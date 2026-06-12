-- Applied via Supabase MCP 2026-06-12. Learner foundation: unified identity
-- (one auth user; creator = has a teacher row; learner data keys off auth.uid()).
create table if not exists public.saved_lessons (
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);
alter table public.saved_lessons enable row level security;
create policy "own saved lessons" on public.saved_lessons for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.followed_channels (
  user_id uuid not null references auth.users(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, teacher_id)
);
alter table public.followed_channels enable row level security;
create policy "own followed channels" on public.followed_channels for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists saved_lessons_user_idx on public.saved_lessons (user_id, created_at desc);
create index if not exists followed_channels_user_idx on public.followed_channels (user_id, created_at desc);
