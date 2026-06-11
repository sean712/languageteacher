-- Applied via Supabase MCP 2026-06-11. Let a creator edit their own activities'
-- text (typo fixes / wording) from the dashboard.
create policy "teachers can update their own activities"
on public.activities for update to authenticated
using (exists (select 1 from public.videos v join public.teachers t on t.id = v.teacher_id
  where v.id = activities.video_id and t.user_id = auth.uid()))
with check (exists (select 1 from public.videos v join public.teachers t on t.id = v.teacher_id
  where v.id = activities.video_id and t.user_id = auth.uid()));
