// sync-channel — re-index the demo channel's catalogue (cheap, no AI calls).
//
// Invocation: POST /functions/v1/sync-channel, body: {} (Phase 1 hardcoded
// demo channel + teacher). Arbitrary channels are connected via the
// connect-channel function; both share syncCatalogue() in _shared/pipeline.ts.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.107.0';
import { YouTubeClient } from '../_shared/youtube.ts';
import {
  HARDCODED_CHANNEL_ID,
  json,
  syncCatalogue,
  upsertDemoTeacher,
} from '../_shared/pipeline.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const YT_API_KEY = Deno.env.get('YOUTUBE_API_KEY')!;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'POST only' }, 405);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });
    const yt = new YouTubeClient(YT_API_KEY);
    const teacher = await upsertDemoTeacher(supabase);

    let playlistId = teacher.uploads_playlist_id;
    if (!playlistId) {
      playlistId = await yt.getUploadsPlaylistId(HARDCODED_CHANNEL_ID);
      await supabase
        .from('teachers')
        .update({ uploads_playlist_id: playlistId })
        .eq('id', teacher.id);
    }

    const result = await syncCatalogue(supabase, yt, teacher, playlistId);
    return json({ teacher_slug: teacher.slug, ...result });
  } catch (err) {
    console.error('sync fatal', err);
    return json({ error: String(err) }, 500);
  }
});
