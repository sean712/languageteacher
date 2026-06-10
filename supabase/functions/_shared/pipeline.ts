// Pieces of the Phase 1 pipeline shared by sync-channel (catalogue indexing)
// and process-videos (queue worker). The split exists because indexing a
// catalogue is cheap and instant while processing a video costs money and
// seconds — see HANDOVER.md.
import { createClient } from 'npm:@supabase/supabase-js@2.107.0';
import { getAIProvider } from './provider-factory.ts';
import { AIProviderError } from './ai-types.ts';
import { fetchTranscriptViaChain } from './transcript-factory.ts';
import type { TranscriptProvider } from './transcript-types.ts';

// --- Phase 1 hardcoded constants. Move to channel/teacher rows in Phase 2. ---
export const HARDCODED_CHANNEL_ID = 'UCK8WMyvZ1sFlhxie5tlaIdQ';
export const HARDCODED_TEACHER_SLUG = 'demo-teacher';
export const SHORT_DURATION_THRESHOLD = 60;
export const PUBLISH_CONFIDENCE_THRESHOLD = 0.6;

export type Supabase = ReturnType<typeof createClient>;

export interface PushedTranscript {
  text?: string;
  language?: string;
}

export interface VideoRow {
  id: string;
  youtube_video_id: string;
  title: string | null;
  duration_seconds: number | null;
  status: string;
}

export interface TeacherRow {
  id: string;
  slug: string;
  uploads_playlist_id: string | null;
  last_synced_at: string | null;
}

export async function upsertDemoTeacher(supabase: Supabase): Promise<TeacherRow> {
  const { data: existing } = await supabase
    .from('teachers')
    .select('id,slug,uploads_playlist_id,last_synced_at')
    .ilike('slug', HARDCODED_TEACHER_SLUG)
    .maybeSingle();
  if (existing) return existing as TeacherRow;

  const { data, error } = await supabase
    .from('teachers')
    .insert({
      display_name: 'Demo Teacher',
      slug: HARDCODED_TEACHER_SLUG,
      youtube_channel_id: HARDCODED_CHANNEL_ID,
      bio: 'Auto-generated lessons from a linked YouTube channel.',
    })
    .select('id,slug,uploads_playlist_id,last_synced_at')
    .single();
  if (error) throw error;
  return data as TeacherRow;
}

// Process one already-claimed videos row: transcript -> AI -> activities.
// The row is in 'processing' when this runs; every path out sets a terminal
// status (published / needs_review). Throws only on unexpected DB errors —
// the caller marks the row 'failed' in that case.
export async function processVideoRow(args: {
  supabase: Supabase;
  ai: ReturnType<typeof getAIProvider>;
  transcriptProviders: TranscriptProvider[];
  row: VideoRow;
  pushed?: PushedTranscript;
}): Promise<{ status: 'published' | 'needs_review'; diag: string }> {
  const { supabase, ai, transcriptProviders, row, pushed } = args;
  const isShort = (row.duration_seconds ?? 0) <= SHORT_DURATION_THRESHOLD;

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
    const outcome = await fetchTranscriptViaChain(transcriptProviders, row.youtube_video_id);
    transcriptDiag = outcome.diag;
    if (outcome.result) {
      transcript = outcome.result.text;
      transcriptSource = outcome.result.source;
      language = outcome.result.language;
    }
  }

  if (!transcript) {
    await updateVideo(supabase, row.id, {
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
      title: row.title ?? undefined,
    });
    bundleConfidence = bundle.confidence;
    bundleLevel = bundle.level;
    bundleLanguage = bundle.language;
    reviewNotes = bundle.needs_review_notes;
    activities = bundle.activities.map((a) => ({ type: a.type, payload: a.payload }));
  } catch (err) {
    if (err instanceof AIProviderError) {
      await updateVideo(supabase, row.id, {
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

  await updateVideo(supabase, row.id, {
    transcript,
    transcript_source: transcriptSource,
    language: bundleLanguage,
    level: bundleLevel,
    ai_confidence: bundleConfidence,
    status: finalStatus,
    needs_review_notes: reviewNotes?.length ? { items: reviewNotes } : null,
    published_at: finalStatus === 'published' ? new Date().toISOString() : null,
  });

  // Replace any existing activities for this video.
  await supabase.from('activities').delete().eq('video_id', row.id);
  if (activities.length) {
    const { error } = await supabase.from('activities').insert(
      activities.map((a) => ({
        video_id: row.id,
        type: a.type,
        payload: a.payload,
        status: finalStatus,
      })),
    );
    if (error) throw error;
  }

  return { status: finalStatus, diag: `ok lang=${bundleLanguage} level=${bundleLevel} conf=${bundleConfidence}` };
}

async function updateVideo(supabase: Supabase, id: string, patch: Record<string, unknown>) {
  const { error } = await supabase
    .from('videos')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
