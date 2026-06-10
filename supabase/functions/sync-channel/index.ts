// sync-channel — index a channel's full catalogue (cheap, no AI calls).
//
// Invocation: POST /functions/v1/sync-channel, body: {} (Phase 1 hardcoded
// channel + teacher).
//
// What it does:
//   1. walk the channel's uploads playlist and fetch metadata for every video
//   2. insert unknown videos as status 'not_processed' (the teacher's library
//      view; NOT visible to learners — RLS exposes only 'published')
//   3. queue policy: on first sync, queue the latest FIRST_SYNC_QUEUE_LIMIT
//      videos; on later syncs, queue every newly-discovered video (this is
//      what makes a fresh upload become a lesson automatically)
//
// Processing itself happens in process-videos (the queue worker).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.107.0';
import { YouTubeClient } from '../_shared/youtube.ts';
import {
  HARDCODED_CHANNEL_ID,
  SHORT_DURATION_THRESHOLD,
  json,
  upsertDemoTeacher,
} from '../_shared/pipeline.ts';

const FIRST_SYNC_QUEUE_LIMIT = 20;

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

    const allIds = await yt.listAllVideoIds(playlistId);
    const metas = await yt.getVideoMeta(allIds);

    const { data: existingRows, error: exErr } = await supabase
      .from('videos')
      .select('youtube_video_id,youtube_published_at')
      .eq('teacher_id', teacher.id);
    if (exErr) throw exErr;
    const existing = new Map(
      (existingRows ?? []).map((r) => [
        r.youtube_video_id as string,
        r.youtube_published_at as string | null,
      ]),
    );

    // Insert newly-discovered videos. Existing rows are never touched here —
    // their status is owned by the worker / the teacher.
    const newMetas = metas.filter((m) => !existing.has(m.id));
    if (newMetas.length) {
      const { error } = await supabase.from('videos').insert(
        newMetas.map((m) => ({
          teacher_id: teacher.id,
          youtube_video_id: m.id,
          title: m.title,
          description: m.description,
          thumbnail_url: m.thumbnailUrl,
          duration_seconds: m.durationSeconds,
          type: m.durationSeconds <= SHORT_DURATION_THRESHOLD ? 'short' : 'long',
          status: 'not_processed',
          youtube_published_at: m.publishedAt,
        })),
      );
      if (error) throw error;
    }

    // Backfill youtube_published_at for rows created before the column existed.
    for (const m of metas) {
      if (existing.has(m.id) && !existing.get(m.id)) {
        await supabase
          .from('videos')
          .update({ youtube_published_at: m.publishedAt })
          .eq('teacher_id', teacher.id)
          .eq('youtube_video_id', m.id);
      }
    }

    // Queue policy.
    const firstSync = !teacher.last_synced_at;
    let queued = 0;
    if (firstSync) {
      const { data: toQueue, error } = await supabase
        .from('videos')
        .select('id')
        .eq('teacher_id', teacher.id)
        .eq('status', 'not_processed')
        .order('youtube_published_at', { ascending: false })
        .limit(FIRST_SYNC_QUEUE_LIMIT);
      if (error) throw error;
      if (toQueue?.length) {
        const { error: qErr } = await supabase
          .from('videos')
          .update({ status: 'queued' })
          .in('id', toQueue.map((v) => v.id));
        if (qErr) throw qErr;
        queued = toQueue.length;
      }
    } else if (newMetas.length) {
      const { data: q, error } = await supabase
        .from('videos')
        .update({ status: 'queued' })
        .eq('teacher_id', teacher.id)
        .eq('status', 'not_processed')
        .in('youtube_video_id', newMetas.map((m) => m.id))
        .select('id');
      if (error) throw error;
      queued = q?.length ?? 0;
    }

    await supabase
      .from('teachers')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', teacher.id);

    const { count: queueDepth } = await supabase
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'queued');

    return json({
      teacher_slug: teacher.slug,
      first_sync: firstSync,
      channel_video_count: metas.length,
      new_videos: newMetas.length,
      queued_now: queued,
      queue_depth: queueDepth ?? 0,
    });
  } catch (err) {
    console.error('sync fatal', err);
    return json({ error: String(err) }, 500);
  }
});
