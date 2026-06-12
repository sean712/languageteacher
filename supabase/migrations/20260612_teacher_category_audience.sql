-- Applied via Supabase MCP 2026-06-12. Creator-declared channel category +
-- target audience, collected during onboarding (used now for the flow, stored
-- for later: non-language activity types, audience-tuned generation). Owner
-- writes via the existing "teachers can update their own row" policy.
alter table public.teachers
  add column if not exists category text,
  add column if not exists target_audience jsonb not null default '{}'::jsonb;
