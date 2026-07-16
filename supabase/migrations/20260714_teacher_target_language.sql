-- APPLIED 2026-07-16 via Supabase MCP `apply_migration` (name:
-- teacher_target_language) to project nyekhfvkaujfrfulofmg. Kept here as the
-- reference copy.
--
-- Creator-declared teaching language + content mode (ROADMAP.md Workstream A).
-- target_language: English name of the language the channel teaches (e.g.
-- 'Welsh'). Authoritative for the pipeline: when set, processing skips
-- language detection and pins generation to this language.
-- content_mode: 'teaching' (videos teach the language) vs 'immersion'
-- (travel/vlog content) — column added now, wired up in Workstream A2.
-- Owner writes go through the existing "teachers can update their own row"
-- RLS policy; public read is already table-wide on teachers.
alter table public.teachers
  add column if not exists target_language text,
  add column if not exists content_mode text not null default 'teaching'
    constraint teachers_content_mode_check check (content_mode in ('teaching', 'immersion'));
