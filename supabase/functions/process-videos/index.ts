// process-videos — drain the processing queue, a batch per invocation.
//
// Invocation: POST /functions/v1/process-videos
// body (all optional):
//   batch_size: number (default 5, max 10 — keeps a batch well inside the
//     Edge Function wall-clock limit)
//   transcripts: { [youtube_video_id]: { text, language? } } — pre-fetched
//     transcripts pushed by scripts/ingest-local.mjs. Videos named here are
//     processed even if not currently queued (e.g. they already fell to
//     needs_review for lack of a transcript), as long as they're unpublished.
//
// Claiming uses claim_videos_for_processing (FOR UPDATE SKIP LOCKED), so
// concurrent invocations are safe. Response includes remaining_queued so
// callers can loop until the queue is empty.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.107.0';
import { getAIProvider } from '../_shared/provider-factory.ts';
import { getTranscriptProviders } from '../_shared/transcript-factory.ts';
import {
  json,
  processVideoRow,
  type PushedTranscript,
  type VideoRow,
} from '../_shared/pipeline.ts';

const DEFAULT_BATCH = 5;
const MAX_BATCH = 10;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'POST only' }, 405);
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      batch_size?: number;
      transcripts?: Record<string, PushedTranscript>;
    };
    // batch_size 0 = push-only invocation: process pushed transcripts
    // without claiming anything from the queue.
    const batch = Math.min(Math.max(body.batch_size ?? DEFAULT_BATCH, 0), MAX_BATCH);
    const pushed = body.transcripts ?? {};

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });
    const ai = getAIProvider();
    const transcriptProviders = getTranscriptProviders();

    let rows: VideoRow[] = [];
    if (batch > 0) {
      const { data: claimed, error: claimErr } = await supabase
        .rpc('claim_videos_for_processing', { p_batch: batch });
      if (claimErr) throw claimErr;
      rows = (claimed ?? []) as VideoRow[];
    }

    // Pushed transcripts may target videos that aren't queued anymore
    // (typically needs_review after a failed server-side transcript fetch).
    const claimedIds = new Set(rows.map((r) => r.youtube_video_id));
    const extraIds = Object.keys(pushed).filter((id) => !claimedIds.has(id));
    if (extraIds.length) {
      const { data: extra, error } = await supabase
        .from('videos')
        .select('*')
        .in('youtube_video_id', extraIds)
        .neq('status', 'published');
      if (error) throw error;
      rows = rows.concat((extra ?? []) as VideoRow[]);
    }

    const results: Array<{ id: string; status: string; diag?: string }> = [];
    for (const row of rows) {
      try {
        const r = await processVideoRow({
          supabase,
          ai,
          transcriptProviders,
          row,
          pushed: pushed[row.youtube_video_id],
        });
        results.push({ id: row.youtube_video_id, status: r.status, diag: r.diag });
      } catch (err) {
        console.error(`video ${row.youtube_video_id} failed`, err);
        await supabase
          .from('videos')
          .update({ status: 'failed' })
          .eq('id', row.id);
        results.push({
          id: row.youtube_video_id,
          status: 'failed',
          diag: String(err).slice(0, 200),
        });
      }
    }

    const { count } = await supabase
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'queued');

    return json({ processed: results, remaining_queued: count ?? 0 });
  } catch (err) {
    console.error('worker fatal', err);
    return json({ error: String(err) }, 500);
  }
});
