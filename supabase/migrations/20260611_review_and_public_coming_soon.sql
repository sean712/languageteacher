-- Applied via Supabase MCP on 2026-06-11. Kept here for traceability.

-- 1. owner_can_update_videos: let creators manage their own videos from the client.
create policy "teachers can update their own videos"
on public.videos for update to authenticated
using (exists (select 1 from public.teachers t where t.id = videos.teacher_id and t.user_id = auth.uid()))
with check (exists (select 1 from public.teachers t where t.id = videos.teacher_id and t.user_id = auth.uid()));

-- 2. public_video_metadata_column_grants: anon reads only safe columns of videos
--    (never transcript / needs_review_notes / ai_confidence), for published +
--    upcoming rows. Powers the public "coming soon" teaser. NOTE: anon queries
--    must select explicit columns, not '*'.
revoke select on public.videos from anon;
grant select (
  id, teacher_id, youtube_video_id, title, description, thumbnail_url,
  type, duration_seconds, language, level, status, published_at,
  youtube_published_at, created_at, updated_at
) on public.videos to anon;

create policy "public can read upcoming video metadata"
on public.videos for select to anon
using (status in ('queued', 'processing', 'needs_review'));
