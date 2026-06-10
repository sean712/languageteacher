// DEPRECATED 2026-06-10 — replaced by sync-channel (catalogue indexing) and
// process-videos (queue worker). Kept as a stub so stale callers get a clear
// answer; delete this function from the dashboard when convenient.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

Deno.serve(() =>
  new Response(
    JSON.stringify({
      error: 'ingest-channel is deprecated; use sync-channel then process-videos',
    }),
    { status: 410, headers: { 'Content-Type': 'application/json' } },
  ));
