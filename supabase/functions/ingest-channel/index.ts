// ingest-channel — Phase 1 pipeline.
//
// Invocation:
//   POST /functions/v1/ingest-channel
//   body: {} (uses hardcoded channel + teacher in Phase 1)
// Optional body fields:
//   transcripts: { [youtube_video_id]: { text: string, language?: string } }
//     — pre-fetched transcripts to use instead of the TranscriptProvider
//     chain. Used by scripts/ingest-local.mjs, which fetches captions from a
//     residential IP because YouTube bot-walls datacenter IPs.
// or POST with { channel_id: "UC...", teacher_id: "uuid" } once Phase 2 lands.
//
// For each recent video on the channel:
//   1. fetch metadata + classify Short vs long (duration <=60s = short)
//   2. get a transcript (pushed > provider chain); if none -> needs_review
//   3. detect language + level via AIProvider
//   4. generate activities via AIProvider
//   5. upsert video + insert activities; mark published or needs_review
//
// Auth: anyone with the function URL can call this for now; locked down to
// the service role / a cron secret in Phase 2.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.107.0';
import {
  YouTubeClient,
  type YouTubeVideoMeta,
} from '../_shared/youtube.ts';
import { getAIProvider } from '../_shared/provider-factory.ts';
import { AIProviderError } from '../_shared/ai-types.ts';
import {
  fetchTranscriptViaChain,
  getTranscriptProviders,
} from '../_shared/transcript-factory.ts';
import type { TranscriptProvider } from '../_shared/transcript-types.ts';

interface PushedTranscript {
  text?: string;
  language?: string;
}

// --- Phase 1 hardcoded constants. Move to channel/teacher rows in Phase 2. ---
const HARDCODED_CHANNEL_ID = 'UCK8WMyvZ1sFlhxie5tlaIdQ';
const HARDCODED_TEACHER_SLUG = 'demo-teacher';
const MAX_VIDEOS_PER_RUN = 5;
const SHORT_DURATION_THRESHOLD = 60;
const PUBLISH_CONFIDENCE_THRESHOLD = 0.6;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const YT_API_KEY = Deno.env.get('YOUTUBE_API_KEY')!;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'POST only' }, 405);
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      transcripts?: Record<string, PushedTranscript>;
    };
    const pushedTranscripts = body.transcripts ?? {};

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });
    const yt = new YouTubeClient(YT_API_KEY);
    const ai = getAIProvider();
    const transcriptProviders = getTranscriptProviders();

    // Ensure the demo teacher row exists.
    const teacher = await upsertDemoTeacher(supabase);

    const uploadsId = await yt.getUploadsPlaylistId(HARDCODED_CHANNEL_ID);
    const videoIds = await yt.listRecentVideoIds(uploadsId, MAX_VIDEOS_PER_RUN);
    const metas = await yt.getVideoMeta(videoIds);

    const results: Array<{ id: string; status: string; diag?: string; note?: string }> = [];

    for (const meta of metas) {
      try {
        const { status, diag } = await processVideo({
          supabase,
          ai,
          transcriptProviders,
          teacherId: teacher.id,
          meta,
          pushed: pushedTranscripts[meta.id],
        });
        results.push({ id: meta.id, status, diag });
      } catch (err) {
        console.error(`video ${meta.id} failed`, err);
        await supabase
          .from('videos')
          .upsert(
            {
              teacher_id: teacher.id,
              youtube_video_id: meta.id,
              title: meta.title,
              thumbnail_url: meta.thumbnailUrl,
              duration_seconds: meta.durationSeconds,
              type: meta.durationSeconds <= SHORT_DURATION_THRESHOLD ? 'short' : 'long',
              status: 'failed',
            },
            { onConflict: 'teacher_id,youtube_video_id' },
          );
        results.push({ id: meta.id, status: 'failed', note: String(err) });
      }
    }

    return json({ teacher_slug: teacher.slug, processed: results });
  } catch (err) {
    console.error('ingest fatal', err);
    return json({ error: String(err) }, 500);
  }
});

async function processVideo(args: {
  supabase: ReturnType<typeof createClient>;
  ai: ReturnType<typeof getAIProvider>;
  transcriptProviders: TranscriptProvider[];
  teacherId: string;
  meta: YouTubeVideoMeta;
  pushed?: PushedTranscript;
}): Promise<{ status: 'published' | 'needs_review' | 'skipped'; diag: string }> {
  const { supabase, ai, transcriptProviders, teacherId, meta, pushed } = args;
  const isShort = meta.durationSeconds <= SHORT_DURATION_THRESHOLD;

  // Skip if we've already processed this video successfully.
  const { data: existing } = await supabase
    .from('videos')
    .select('id,status')
    .eq('teacher_id', teacherId)
    .eq('youtube_video_id', meta.id)
    .maybeSingle();
  if (existing && existing.status === 'published') {
    return { status: 'skipped', diag: 'already_published' };
  }

  // 1. transcript: a pushed one wins; otherwise walk the provider chain.
  let transcript = '';
  let transcriptSource: 'captions' | 'whisper' | 'upload' | 'none' = 'none';
  let language: string | undefined;
  let transcriptDiag = '';
  if (pushed?.text?.trim()) {
    transcript = pushed.text.trim();
    transcriptSource = 'captions';
    language = pushed.language;
    transcriptDiag = 'pushed';
  } else {
    const outcome = await fetchTranscriptViaChain(transcriptProviders, meta.id);
    transcriptDiag = outcome.diag;
    if (outcome.result) {
      transcript = outcome.result.text;
      transcriptSource = outcome.result.source;
      language = outcome.result.language;
    }
  }

  if (!transcript) {
    await upsertVideo(supabase, teacherId, meta, {
      transcript: null,
      transcript_source: 'none',
      status: 'needs_review',
      needs_review_notes: { reason: 'no transcript available — teacher must upload one', diag: transcriptDiag },
    });
    return { status: 'needs_review', diag: `transcript_fetch: ${transcriptDiag}` };
  }

  // 2. detection + generation
  let bundleConfidence = 0;
  let bundleLevel = 'A2';
  let bundleLanguage = language ?? 'unknown';
  let reviewNotes: string[] | undefined;
  let activities: Array<{ type: string; payload: Record<string, unknown> }> = [];

  try {
    const detected = await ai.detectLanguageAndLevel(transcript);
    bundleLanguage = detected.language || bundleLanguage;
    bundleLevel = detected.level || bundleLevel;

    const bundle = await ai.generateActivities({
      transcript,
      language: bundleLanguage,
      level: bundleLevel,
      video_type: isShort ? 'short' : 'long',
      title: meta.title,
    });
    bundleConfidence = bundle.confidence;
    bundleLevel = bundle.level;
    bundleLanguage = bundle.language;
    reviewNotes = bundle.needs_review_notes;
    activities = bundle.activities.map((a) => ({ type: a.type, payload: a.payload }));
  } catch (err) {
    if (err instanceof AIProviderError) {
      await upsertVideo(supabase, teacherId, meta, {
        transcript,
        transcript_source: transcriptSource,
        language: bundleLanguage,
        status: 'needs_review',
        needs_review_notes: { reason: 'AI generation failed', error: String(err) },
      });
      return { status: 'needs_review', diag: `ai_error: ${String(err).slice(0, 200)}` };
    }
    throw err;
  }

  const lowConfidence = bundleConfidence < PUBLISH_CONFIDENCE_THRESHOLD;
  const finalStatus: 'published' | 'needs_review' = lowConfidence ? 'needs_review' : 'published';

  const video = await upsertVideo(supabase, teacherId, meta, {
    transcript,
    transcript_source: transcriptSource,
    language: bundleLanguage,
    level: bundleLevel,
    ai_confidence: bundleConfidence,
    status: finalStatus,
    needs_review_notes: reviewNotes?.length
      ? { items: reviewNotes }
      : null,
    published_at: finalStatus === 'published' ? new Date().toISOString() : null,
  });

  // Replace any existing activities for this video.
  await args.supabase.from('activities').delete().eq('video_id', video.id);
  if (activities.length) {
    await args.supabase.from('activities').insert(
      activities.map((a) => ({
        video_id: video.id,
        type: a.type,
        payload: a.payload,
        status: finalStatus,
      })),
    );
  }

  return { status: finalStatus, diag: `ok lang=${bundleLanguage} level=${bundleLevel} conf=${bundleConfidence}` };
}

async function upsertDemoTeacher(
  supabase: ReturnType<typeof createClient>,
): Promise<{ id: string; slug: string }> {
  const { data: existing } = await supabase
    .from('teachers')
    .select('id,slug')
    .ilike('slug', HARDCODED_TEACHER_SLUG)
    .maybeSingle();
  if (existing) return existing as { id: string; slug: string };

  const { data, error } = await supabase
    .from('teachers')
    .insert({
      display_name: 'Demo Teacher',
      slug: HARDCODED_TEACHER_SLUG,
      youtube_channel_id: HARDCODED_CHANNEL_ID,
      bio: 'Auto-generated lessons from a linked YouTube channel.',
    })
    .select('id,slug')
    .single();
  if (error) throw error;
  return data as { id: string; slug: string };
}

async function upsertVideo(
  supabase: ReturnType<typeof createClient>,
  teacherId: string,
  meta: YouTubeVideoMeta,
  patch: Record<string, unknown>,
): Promise<{ id: string }> {
  const row = {
    teacher_id: teacherId,
    youtube_video_id: meta.id,
    title: meta.title,
    description: meta.description,
    thumbnail_url: meta.thumbnailUrl,
    duration_seconds: meta.durationSeconds,
    type: meta.durationSeconds <= SHORT_DURATION_THRESHOLD ? 'short' : 'long',
    ...patch,
  };
  const { data, error } = await supabase
    .from('videos')
    .upsert(row, { onConflict: 'teacher_id,youtube_video_id' })
    .select('id')
    .single();
  if (error) throw error;
  return data as { id: string };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
