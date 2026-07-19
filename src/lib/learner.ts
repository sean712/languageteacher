import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { readLocalDone, writeLocalDone } from './progress';
import { track } from './track';

// Activity completion for a lesson. Anonymous → localStorage only. Signed in →
// loads from the account, merges with anything local, and writes through to the
// `lesson_progress` table on each completion (cross-device).
export function useCompleted(videoId: string) {
  const { user } = useAuth();
  const [done, setDone] = useState<Set<string>>(() => readLocalDone(videoId));

  useEffect(() => {
    if (!user) {
      setDone(readLocalDone(videoId));
      return;
    }
    let cancelled = false;
    supabase
      .from('lesson_progress')
      .select('done_activities')
      .eq('user_id', user.id)
      .eq('video_id', videoId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const server = new Set<string>(
          ((data?.done_activities as string[] | undefined) ?? []),
        );
        const local = readLocalDone(videoId);
        const union = new Set<string>([...server, ...local]);
        setDone(union);
        writeLocalDone(videoId, union);
        // Push local-only items up so the account catches up.
        const hasExtra = [...local].some((t) => !server.has(t));
        if (hasExtra) {
          supabase.from('lesson_progress').upsert({
            user_id: user.id,
            video_id: videoId,
            done_activities: [...union],
            updated_at: new Date().toISOString(),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user, videoId]);

  const mark = useCallback(
    (type: string) => {
      setDone((prev) => {
        if (prev.has(type)) return prev;
        const next = new Set(prev);
        next.add(type);
        writeLocalDone(videoId, next);
        if (user) {
          supabase.from('lesson_progress').upsert({
            user_id: user.id,
            video_id: videoId,
            done_activities: [...next],
            updated_at: new Date().toISOString(),
          });
        }
        return next;
      });
    },
    [user, videoId],
  );

  return [done, mark] as const;
}

// Learner save/follow state. Anonymous users get a passive false state; the
// calling component handles the "sign in to save" redirect. Data is owned by
// the auth user (RLS), so it syncs across devices.

export function useSavedLesson(videoId: string, teacherId?: string) {
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) {
      setSaved(false);
      setReady(true);
      return;
    }
    let cancelled = false;
    supabase
      .from('saved_lessons')
      .select('video_id')
      .eq('user_id', user.id)
      .eq('video_id', videoId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setSaved(Boolean(data));
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user, videoId]);

  const toggle = useCallback(async () => {
    if (!user) return;
    if (saved) {
      setSaved(false);
      await supabase
        .from('saved_lessons')
        .delete()
        .eq('user_id', user.id)
        .eq('video_id', videoId);
    } else {
      setSaved(true);
      if (teacherId) track('save', { teacherId, videoId });
      await supabase
        .from('saved_lessons')
        .insert({ user_id: user.id, video_id: videoId });
    }
  }, [user, saved, videoId, teacherId]);

  return { saved, ready, toggle, signedIn: Boolean(user) };
}

export function useFollowChannel(teacherId: string) {
  const { user } = useAuth();
  const [following, setFollowing] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) {
      setFollowing(false);
      setReady(true);
      return;
    }
    let cancelled = false;
    supabase
      .from('followed_channels')
      .select('teacher_id')
      .eq('user_id', user.id)
      .eq('teacher_id', teacherId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setFollowing(Boolean(data));
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user, teacherId]);

  const toggle = useCallback(async () => {
    if (!user) return;
    if (following) {
      setFollowing(false);
      await supabase
        .from('followed_channels')
        .delete()
        .eq('user_id', user.id)
        .eq('teacher_id', teacherId);
    } else {
      setFollowing(true);
      track('follow', { teacherId });
      await supabase
        .from('followed_channels')
        .insert({ user_id: user.id, teacher_id: teacherId });
    }
  }, [user, following, teacherId]);

  return { following, ready, toggle, signedIn: Boolean(user) };
}
