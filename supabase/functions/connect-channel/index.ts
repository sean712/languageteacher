// connect-channel — onboard a creator by linking a YouTube channel.
//
// POST /functions/v1/connect-channel
// body: { channel: "<id | url | @handle | name>", display_name?: string }
// → { teacher_slug, channel_title, channel_video_count, queued_now, queue_depth }
//
// Resolves the channel, upserts a teacher record, and indexes the catalogue
// (queuing the latest videos for processing). Processing itself is drained by
// process-videos. Called from the browser, so it handles CORS.
//
// ⚠️ Phase 1: UNAUTHENTICATED and creates teachers + triggers paid processing.
// Fine for solo testing; gate behind creator auth (and, later, OAuth channel
// ownership) before onboarding real creators. The teacher.user_id stays null
// until auth lands; OAuth becomes an additional connect path into the same
// records.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.107.0';
import { YouTubeClient } from '../_shared/youtube.ts';
import { syncCatalogue, type TeacherRow } from '../_shared/pipeline.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RESERVED_SLUGS = new Set(['connect', 'demo-teacher', 'api', 'admin']);

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const YT_API_KEY = Deno.env.get('YOUTUBE_API_KEY')!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function slugify(s: string): string {
  const base = s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'channel';
}

type Supabase = ReturnType<typeof createClient>;

async function uniqueSlug(supabase: Supabase, base: string): Promise<string> {
  let candidate = RESERVED_SLUGS.has(base) ? `${base}-1` : base;
  for (let i = 0; i < 50; i++) {
    const { data } = await supabase
      .from('teachers')
      .select('id')
      .ilike('slug', candidate)
      .maybeSingle();
    if (!data) return candidate;
    candidate = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now()}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const body = await req.json().catch(() => ({})) as {
      channel?: string;
      display_name?: string;
    };
    const channelInput = (body.channel ?? '').trim();
    if (!channelInput) {
      return json({ error: 'Enter a channel ID, URL or @handle.' }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });
    const yt = new YouTubeClient(YT_API_KEY);

    let resolved;
    try {
      resolved = await yt.resolveChannel(channelInput);
    } catch (err) {
      return json(
        { error: `Couldn't find that channel — check the ID or @handle. (${String(err).slice(0, 120)})` },
        404,
      );
    }

    // Re-connecting an already-linked channel reuses its teacher.
    const { data: existing } = await supabase
      .from('teachers')
      .select('id,slug,uploads_playlist_id,last_synced_at')
      .eq('youtube_channel_id', resolved.channelId)
      .maybeSingle();

    let teacher: TeacherRow;
    if (existing) {
      teacher = existing as TeacherRow;
      if (!teacher.uploads_playlist_id) {
        await supabase
          .from('teachers')
          .update({ uploads_playlist_id: resolved.uploadsPlaylistId })
          .eq('id', teacher.id);
      }
    } else {
      const displayName = (body.display_name ?? '').trim() || resolved.title;
      const slug = await uniqueSlug(supabase, slugify(displayName));
      const { data, error } = await supabase
        .from('teachers')
        .insert({
          display_name: displayName,
          slug,
          youtube_channel_id: resolved.channelId,
          uploads_playlist_id: resolved.uploadsPlaylistId,
          avatar_url: resolved.thumbnailUrl || null,
          bio: 'Auto-generated lessons from a linked YouTube channel.',
        })
        .select('id,slug,uploads_playlist_id,last_synced_at')
        .single();
      if (error) throw error;
      teacher = data as TeacherRow;
    }

    const result = await syncCatalogue(
      supabase,
      yt,
      teacher,
      resolved.uploadsPlaylistId,
    );

    return json({
      teacher_slug: teacher.slug,
      channel_title: resolved.title,
      ...result,
    });
  } catch (err) {
    console.error('connect-channel failed', err);
    return json({ error: String(err).slice(0, 200) }, 500);
  }
});
