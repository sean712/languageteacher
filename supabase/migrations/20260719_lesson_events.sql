-- APPLIED 2026-07-19 via Supabase MCP `apply_migration` (name: lesson_events)
-- to project nyekhfvkaujfrfulofmg. Kept here as the reference copy.
--
-- Event tracking (ROADMAP Workstream F1). Insert-only from browsers; reads
-- are service-role only (creator dashboards will read AGGREGATES, never raw
-- events — privacy + perf). AI events (ai_chat / ai_feedback) are inserted
-- SERVER-SIDE by the lesson-chat / evaluate-sentence functions and are the
-- authoritative signal for revenue sharing; client events are best-effort
-- trend data.
create table public.lesson_events (
  id bigint generated always as identity primary key,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  video_id uuid references public.videos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  anon_id text,
  event text not null check (event in (
    'lesson_view', 'activity_start', 'activity_complete', 'lesson_complete',
    'save', 'follow', 'ai_chat', 'ai_feedback'
  )),
  activity_type text,
  created_at timestamptz not null default now()
);

create index lesson_events_teacher_time
  on public.lesson_events (teacher_id, created_at desc);
create index lesson_events_video_time
  on public.lesson_events (video_id, created_at desc);

alter table public.lesson_events enable row level security;

-- Browsers may only INSERT, and may not claim someone else's user_id.
-- No select/update/delete policies: raw events are service-role only.
create policy "anyone can log events" on public.lesson_events
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
