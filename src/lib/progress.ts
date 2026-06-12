import { supabase } from './supabase';

// Activity completion is stored per-device in localStorage and, for signed-in
// learners, mirrored to the account-backed `lesson_progress` table so it
// follows them across devices.

export const DONE_PREFIX = 'lingua:done:';

export function readLocalDone(videoId: string): Set<string> {
  try {
    const raw = localStorage.getItem(DONE_PREFIX + videoId);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function writeLocalDone(videoId: string, set: Set<string>) {
  try {
    localStorage.setItem(DONE_PREFIX + videoId, JSON.stringify([...set]));
  } catch {
    /* ignore quota / private-mode */
  }
}

// Merge all local completion into the account once, on sign-in, so progress
// earned anonymously isn't lost. Union per lesson (never removes server rows).
export async function syncLocalProgressToServer(userId: string): Promise<void> {
  try {
    const entries: { videoId: string; types: string[] }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(DONE_PREFIX)) continue;
      const videoId = k.slice(DONE_PREFIX.length);
      try {
        const arr = JSON.parse(localStorage.getItem(k) || '[]');
        if (Array.isArray(arr) && arr.length) entries.push({ videoId, types: arr });
      } catch {
        /* skip malformed */
      }
    }
    if (!entries.length) return;

    const ids = entries.map((e) => e.videoId);
    const { data: existing } = await supabase
      .from('lesson_progress')
      .select('video_id,done_activities')
      .eq('user_id', userId)
      .in('video_id', ids);
    const serverMap = new Map<string, string[]>(
      ((existing ?? []) as { video_id: string; done_activities: string[] }[]).map(
        (r) => [r.video_id, r.done_activities ?? []],
      ),
    );

    const now = new Date().toISOString();
    const rows = entries.map((e) => ({
      user_id: userId,
      video_id: e.videoId,
      done_activities: [...new Set([...(serverMap.get(e.videoId) ?? []), ...e.types])],
      updated_at: now,
    }));
    await supabase.from('lesson_progress').upsert(rows);
  } catch {
    /* best-effort; never block the app */
  }
}
