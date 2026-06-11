-- Applied via Supabase MCP 2026-06-11. Let a creator remove their own channel;
-- FK cascades (videos -> activities, content_uploads) delete its content.
create policy "teachers can delete their own row"
on public.teachers for delete to authenticated
using (user_id = auth.uid());
