import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

interface NoteItem {
  id: string;
  content: string;
  updated_at: string;
  video_id: string | null;
  lesson_title: string | null;
  teacher_slug: string | null;
  teacher_name: string | null;
}

export default function Notebook() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<NoteItem[] | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('notes')
        .select('id,content,updated_at,video_id, videos(title, teachers(slug,display_name))')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      if (cancelled) return;
      type Row = {
        id: string;
        content: string;
        updated_at: string;
        video_id: string | null;
        videos: { title: string | null; teachers: { slug: string; display_name: string } | null } | null;
      };
      setNotes(
        ((data ?? []) as unknown as Row[]).map((r) => ({
          id: r.id,
          content: r.content,
          updated_at: r.updated_at,
          video_id: r.video_id,
          lesson_title: r.videos?.title ?? null,
          teacher_slug: r.videos?.teachers?.slug ?? null,
          teacher_name: r.videos?.teachers?.display_name ?? null,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const addNote = async () => {
    if (!user || !draft.trim()) return;
    const { data } = await supabase
      .from('notes')
      .insert({ user_id: user.id, content: draft.trim() })
      .select('id,content,updated_at,video_id')
      .single();
    if (data) {
      setNotes((n) => [
        {
          ...(data as { id: string; content: string; updated_at: string; video_id: string | null }),
          lesson_title: null,
          teacher_slug: null,
          teacher_name: null,
        },
        ...(n ?? []),
      ]);
      setDraft('');
    }
  };

  const saveNote = async (id: string, content: string) => {
    const updated_at = new Date().toISOString();
    setNotes((n) => (n ?? []).map((x) => (x.id === id ? { ...x, content, updated_at } : x)));
    await supabase.from('notes').update({ content, updated_at }).eq('id', id);
  };
  const deleteNote = async (id: string) => {
    setNotes((n) => (n ?? []).filter((x) => x.id !== id));
    await supabase.from('notes').delete().eq('id', id);
  };

  return (
    <main className="min-h-dvh bg-paper-100 text-ink-900">
      <header className="border-b border-paper-300/60 bg-paper-50">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between">
          <Link to="/" className="font-display text-lg font-semibold tracking-tight">
            Lingua
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/library" className="text-ink-600 hover:text-ink-900">
              Library
            </Link>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                navigate('/');
              }}
              className="text-ink-600 hover:text-ink-900"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-5 sm:px-8 pt-8 sm:pt-12 pb-20">
        <h1 className="font-display text-3xl font-semibold tracking-tight animate-rise">
          Notebook
        </h1>
        <p className="text-ink-500 mt-1 text-sm animate-rise">
          Everything you’ve jotted down, across all your lessons.
        </p>

        {/* Composer */}
        <div className="mt-7 notebook-paper notebook-margin rounded-2xl border border-paper-300/70 p-4 pl-6 animate-rise">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Write a note…"
            className="w-full bg-transparent text-[0.95rem] leading-7 resize-none focus:outline-none placeholder:text-ink-400"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={addNote}
              disabled={!draft.trim()}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-paper-50 text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40"
            >
              Add note
            </button>
          </div>
        </div>

        {notes === null ? (
          <p className="text-ink-400 py-12 text-center">Loading…</p>
        ) : notes.length === 0 ? (
          <p className="text-ink-400 py-12 text-center text-sm">
            No notes yet — add one above, or jot notes while doing a lesson.
          </p>
        ) : (
          <ul className="flex flex-col gap-3 mt-5">
            {notes.map((n) => (
              <NoteCard
                key={n.id}
                note={n}
                onSave={(c) => saveNote(n.id, c)}
                onDelete={() => deleteNote(n.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function NoteCard({
  note,
  onSave,
  onDelete,
}: {
  note: NoteItem;
  onSave: (c: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.content);

  return (
    <li className="group notebook-paper notebook-margin rounded-2xl border border-paper-300/70 p-4 pl-6 animate-rise">
      {editing ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="w-full bg-transparent text-[0.95rem] leading-7 resize-none focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                onSave(text);
                setEditing(false);
              }}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-paper-50 text-xs font-medium hover:bg-emerald-700 transition-colors"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setText(note.content);
                setEditing(false);
              }}
              className="px-3 py-1.5 rounded-lg border border-paper-300 text-xs font-medium text-ink-700 hover:border-ink-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[0.95rem] leading-7 whitespace-pre-wrap">{note.content}</p>
          <div className="flex items-center justify-between mt-2">
            {note.video_id && note.teacher_slug ? (
              <Link
                to={`/${note.teacher_slug}?l=${note.video_id}`}
                className="text-xs text-emerald-600 hover:text-emerald-700 truncate"
              >
                {note.lesson_title ?? 'lesson'}
                {note.teacher_name ? ` · ${note.teacher_name}` : ''} ↗
              </Link>
            ) : (
              <span className="text-xs text-ink-400">General note</span>
            )}
            <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs text-ink-500 hover:text-ink-900"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="text-xs text-ink-400 hover:text-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}
    </li>
  );
}
