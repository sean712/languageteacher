// connect-channel — onboard a creator by linking a YouTube channel.
//
// POST /functions/v1/connect-channel
// body: { channel: "<id | url | @handle | name>", display_name?: string }
//   or: { via: 'google', display_name?: string }
// → { teacher_slug, channel_title, channel_video_count, queued_now, queue_depth }
//
// Two connect paths into the same records:
//  - manual: resolve the typed id/@handle via the API key. No ownership
//    proof, so a channel already claimed by another account is refused.
//    Kept for testing (per HANDOVER).
//  - google: look the channel up with the caller's stored Google OAuth token
//    (channels.list mine=true). That PROVES ownership — we stamp
//    oauth_verified_at and will reassign a squatted teacher to the verified
//    owner. Also unlocks official captions downloads in the pipeline.
//
// Then upserts a teacher record and indexes the catalogue (queuing the
// latest videos for processing; drained by process-videos). Browser-called,
// so it handles CORS.
//
// Auth: deployed with verify_jwt=true, so only a logged-in creator can call
// it. We read their user id from the JWT and stamp it on the teacher they
// create (teacher.user_id), which is what the RLS owner policies key off.
// Still triggers paid processing — keep an eye on abuse once public.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.107.0';
import { YouTubeClient } from '../_shared/youtube.ts';
import { getAccessTokenForUser } from '../_shared/google-oauth.ts';
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
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const YT_API_KEY = Deno.env.get('YOUTUBE_API_KEY')!;

// Identify the caller from their JWT (validated by the gateway via
// verify_jwt=true). Returns the auth user id, or null if it can't be read.
async function callerUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data } = await client.auth.getUser();
  return data.user?.id ?? null;
}

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
      via?: 'google';
    };
    const viaGoogle = body.via === 'google';
    const channelInput = (body.channel ?? '').trim();
    if (!viaGoogle && !channelInput) {
      return json({ error: 'Enter a channel ID, URL or @handle.' }, 400);
    }

    const userId = await callerUserId(req);
    if (!userId) {
      return json({ error: 'Please log in to connect a channel.' }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });
    const yt = new YouTubeClient(YT_API_KEY);

    let resolved;
    if (viaGoogle) {
      // Ownership-proving path: find the channel the caller's own Google
      // token can see (mine=true). Requires a token stored by
      // store-google-token after the YouTube-scoped sign-in.
      const accessToken = await getAccessTokenForUser(supabase, userId);
      if (!accessToken) {
        return json(
          { error: 'No Google connection found — use "Link with Google" to authorise YouTube access first.' },
          400,
        );
      }
      try {
        resolved = await yt.resolveOwnChannel(accessToken);
      } catch (err) {
        return json(
          { error: `Couldn't read your channel from Google: ${String(err).slice(0, 150)}` },
          400,
        );
      }
    } else {
      try {
        resolved = await yt.resolveChannel(channelInput);
      } catch (err) {
        return json(
          { error: `Couldn't find that channel — check the ID or @handle. (${String(err).slice(0, 120)})` },
          404,
        );
      }
    }

    // Re-connecting an already-linked channel reuses its teacher.
    const { data: existing } = await supabase
      .from('teachers')
      .select('id,slug,uploads_playlist_id,last_synced_at,user_id')
      .eq('youtube_channel_id', resolved.channelId)
      .maybeSingle();

    let teacher: TeacherRow;
    if (existing) {
      const owner = (existing as { user_id: string | null }).user_id;
      // Without OAuth proof, only the current owner may re-sync a claimed
      // channel. WITH proof, Google says the caller owns it — so a teacher
      // claimed by any other account was squatted and moves to the caller.
      if (owner && owner !== userId && !viaGoogle) {
        return json(
          { error: 'This channel is already connected by another account. Link with Google to prove ownership and claim it.' },
          403,
        );
      }
      teacher = existing as TeacherRow;
      const patch: Record<string, unknown> = {};
      if (!teacher.uploads_playlist_id) {
        patch.uploads_playlist_id = resolved.uploadsPlaylistId;
      }
      if (owner !== userId) {
        patch.user_id = userId;
      }
      if (viaGoogle) {
        patch.oauth_verified_at = new Date().toISOString();
      }
      if (Object.keys(patch).length) {
        await supabase.from('teachers').update(patch).eq('id', teacher.id);
      }
    } else {
      const displayName = (body.display_name ?? '').trim() || resolved.title;
      const slug = await uniqueSlug(supabase, slugify(displayName));
      const { data, error } = await supabase
        .from('teachers')
        .insert({
          user_id: userId,
          display_name: displayName,
          slug,
          youtube_channel_id: resolved.channelId,
          uploads_playlist_id: resolved.uploadsPlaylistId,
          avatar_url: resolved.thumbnailUrl || null,
          bio: 'Auto-generated lessons from a linked YouTube channel.',
          oauth_verified_at: viaGoogle ? new Date().toISOString() : null,
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
      teacher_id: teacher.id,
      channel_title: resolved.title,
      ...result,
    });
  } catch (err) {
    console.error('connect-channel failed', err);
    return json({ error: String(err).slice(0, 200) }, 500);
  }
});
