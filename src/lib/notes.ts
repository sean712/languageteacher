import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

export interface Note {
  id: string;
  video_id: string | null;
  content: string;
  updated_at: string;
}

// Notes for one lesson (the in-lesson notebook entry point). Owned by the
// auth user (RLS); needs an account.
export function useLessonNotes(videoId: string) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[] | null>(null);

  useEffect(() => {
    if (!user) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    supabase
      .from('notes')
      .select('id,video_id,content,updated_at')
      .eq('user_id', user.id)
      .eq('video_id', videoId)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setNotes((data ?? []) as Note[]);
      });
    return () => {
      cancelled = true;
    };
  }, [user, videoId]);

  const add = useCallback(
    async (content: string) => {
      if (!user || !content.trim()) return;
      const { data } = await supabase
        .from('notes')
        .insert({ user_id: user.id, video_id: videoId, content: content.trim() })
        .select('id,video_id,content,updated_at')
        .single();
      if (data) setNotes((n) => [data as Note, ...(n ?? [])]);
    },
    [user, videoId],
  );

  const update = useCallback(async (id: string, content: string) => {
    const updated_at = new Date().toISOString();
    setNotes((n) =>
      (n ?? []).map((x) => (x.id === id ? { ...x, content, updated_at } : x)),
    );
    await supabase.from('notes').update({ content, updated_at }).eq('id', id);
  }, []);

  const remove = useCallback(async (id: string) => {
    setNotes((n) => (n ?? []).filter((x) => x.id !== id));
    await supabase.from('notes').delete().eq('id', id);
  }, []);

  return { notes, add, update, remove, signedIn: Boolean(user) };
}
