import { supabase, isSupabaseConfigured } from './supabase';

// Client-side event tracking (ROADMAP Workstream F1). Fire-and-forget:
// analytics must never throw into the UI or delay an interaction. Raw events
// are insert-only for browsers (RLS); dashboards read aggregates.
//
// AI events (ai_chat / ai_feedback) are NOT tracked here — the Edge Functions
// log those server-side, where they can't be spoofed (they feed rev-share).
export type ClientLessonEvent =
  | 'lesson_view'
  | 'activity_start'
  | 'activity_complete'
  | 'lesson_complete'
  | 'save'
  | 'follow';

const ANON_ID_KEY = 'lingua:anon-id';

// Stable per-device id so anonymous trend numbers can be deduplicated.
function anonId(): string | null {
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    return null; // storage blocked (private mode) — event still counts
  }
}

export function track(
  event: ClientLessonEvent,
  opts: { teacherId: string; videoId?: string; activityType?: string },
): void {
  if (!isSupabaseConfigured || !opts.teacherId) return;
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      await supabase.from('lesson_events').insert({
        teacher_id: opts.teacherId,
        video_id: opts.videoId ?? null,
        user_id: data.session?.user.id ?? null,
        anon_id: anonId(),
        event,
        activity_type: opts.activityType ?? null,
      });
    } catch {
      // Never let analytics break the product.
    }
  })();
}
