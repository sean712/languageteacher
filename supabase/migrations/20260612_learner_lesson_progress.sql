-- Applied via Supabase MCP 2026-06-12. Account-backed activity completion
-- (cross-device). done_activities = the activity types completed for a lesson.
create table if not exists public.lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  done_activities text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, video_id)
);
alter table public.lesson_progress enable row level security;
create policy "own lesson progress" on public.lesson_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists lesson_progress_user_idx on public.lesson_progress (user_id, updated_at desc);
