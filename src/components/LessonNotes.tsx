import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLessonNotes } from '../lib/notes';

// Lesson-scoped notebook: jot notes while learning; they also appear in the
// learner's full notebook at /notebook. Notebook-style ruled surface.
export default function LessonNotes({ videoId }: { videoId: string }) {
  const { notes, add, update, remove } = useLessonNotes(videoId);
  const [draft, setDraft] = useState('');

  const save = () => {
    if (!draft.trim()) return;
    add(draft);
    setDraft('');
  };

  return (
    <div className="rounded-2xl border border-paper-300/70 bg-paper-50 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-lg font-medium">Your notes</h3>
        <Link to="/notebook" className="text-sm text-emerald-600 hover:text-emerald-700">
          Open notebook →
        </Link>
      </div>

      <div className="notebook-paper notebook-margin rounded-xl border border-paper-300/70 p-3 pl-5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="Jot a note about this lesson…"
          className="w-full bg-transparent text-[0.95rem] leading-7 resize-none focus:outline-none placeholder:text-ink-400"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={!draft.trim()}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-paper-50 text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40"
          >
            Add note
          </button>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5 mt-4">
        {(notes ?? []).map((n) => (
          <NoteItem
            key={n.id}
            content={n.content}
            onSave={(c) => update(n.id, c)}
            onDelete={() => remove(n.id)}
          />
        ))}
        {notes?.length === 0 && (
          <li className="text-sm text-ink-400">No notes for this lesson yet.</li>
        )}
      </ul>
    </div>
  );
}

function NoteItem({
  content,
  onSave,
  onDelete,
}: {
  content: string;
  onSave: (c: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(content);

  if (editing) {
    return (
      <li className="notebook-paper notebook-margin rounded-xl border border-paper-300/70 p-3 pl-5">
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
              setText(content);
              setEditing(false);
            }}
            className="px-3 py-1.5 rounded-lg border border-paper-300 text-xs font-medium text-ink-700 hover:border-ink-400 transition-colors"
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="group notebook-paper notebook-margin rounded-xl border border-paper-300/70 p-3 pl-5">
      <p className="text-[0.95rem] leading-7 whitespace-pre-wrap">{content}</p>
      <div className="flex justify-end gap-3 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
    </li>
  );
}
