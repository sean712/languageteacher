-- Autonomous ingestion via pg_cron + pg_net.
--
-- NOTE: schema migrations on this project have been applied through the
-- Supabase MCP tooling, not a tracked migrations folder. This file is kept
-- in-repo for traceability because cron jobs are otherwise invisible in the
-- codebase. Applied 2026-06-10 (migrations: pg_cron_autonomous_pipeline,
-- pin_claim_function_search_path).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Drain the processing queue every minute. process-videos claims a batch with
-- FOR UPDATE SKIP LOCKED (overlapping ticks are safe) and is a cheap no-op
-- when the queue is empty.
select cron.schedule(
  'drain-processing-queue',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://nyekhfvkaujfrfulofmg.supabase.co/functions/v1/process-videos',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('batch_size', 5)
    );
  $cron$
);

-- Discover new uploads on the demo channel every 6 hours (offset from the
-- top-of-hour drain). A sync-all-teachers job replaces this with multi-tenant.
select cron.schedule(
  'sync-demo-channel',
  '17 */6 * * *',
  $cron$
    select net.http_post(
      url := 'https://nyekhfvkaujfrfulofmg.supabase.co/functions/v1/sync-channel',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := '{}'::jsonb
    );
  $cron$
);

-- Advisor 0011: pin the claim function's search_path.
create or replace function public.claim_videos_for_processing(p_batch int default 5)
returns setof public.videos
language sql
set search_path = ''
as $$
  update public.videos v
  set status = 'processing',
      processing_started_at = now(),
      updated_at = now()
  where v.id in (
    select id from public.videos
    where status = 'queued'
       or (status = 'processing' and processing_started_at < now() - interval '10 minutes')
    order by youtube_published_at desc nulls last
    limit p_batch
    for update skip locked
  )
  returning v.*;
$$;

revoke execute on function public.claim_videos_for_processing(int)
  from public, anon, authenticated;
