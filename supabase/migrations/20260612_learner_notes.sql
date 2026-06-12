-- Applied via Supabase MCP 2026-06-12. Personal notebook (cross-lesson),
-- owner-only RLS. video_id optional (lesson-tagged or general); on delete set
-- null so notes survive a lesson being removed.
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid references public.videos(id) on delete set null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.notes enable row level security;
create policy "own notes" on public.notes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists notes_user_idx on public.notes (user_id, updated_at desc);
create index if not exists notes_video_idx on public.notes (user_id, video_id);
