import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { ActivityRow, ActivityType } from '../lib/database.types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPayload = Record<string, any>;

const TYPE_LABEL: Record<string, string> = {
  flashcards: 'Flashcards',
  quiz: 'Quiz',
  gap_fill: 'Fill the gaps',
  matching: 'Matching',
  quick_practice: 'Quick practice',
};

// Inline editor for an activity's text. Lets a creator fix typos / wording and
// save. Writes the edited payload back (owner RLS on activities).
export default function ActivityEditor({
  activities,
  onSaved,
  onCancel,
}: {
  activities: ActivityRow[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [payloads, setPayloads] = useState<Record<string, AnyPayload>>(() =>
    Object.fromEntries(
      activities.map((a) => [a.id, JSON.parse(JSON.stringify(a.payload))]),
    ),
  );
  const [saving, setSaving] = useState(false);

  const set = (id: string, next: AnyPayload) =>
    setPayloads((p) => ({ ...p, [id]: next }));

  const save = async () => {
    setSaving(true);
    for (const a of activities) {
      await supabase
        .from('activities')
        .update({ payload: payloads[a.id] })
        .eq('id', a.id);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="flex flex-col gap-5">
      {activities.map((a) => (
        <div
          key={a.id}
          className="rounded-xl border border-paper-300/70 bg-paper-50 p-4"
        >
          <h3 className="font-display text-base font-medium mb-3">
            {TYPE_LABEL[a.type] ?? a.type}
          </h3>
          <ActivityFields
            type={a.type}
            payload={payloads[a.id]}
            onChange={(next) => set(a.id, next)}
          />
        </div>
      ))}

      <div className="flex gap-2 sticky bottom-0 bg-paper-100 py-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 text-paper-50 text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl border border-paper-300 text-sm font-medium text-ink-700 hover:border-ink-400 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ActivityFields({
  type,
  payload,
  onChange,
}: {
  type: ActivityType;
  payload: AnyPayload;
  onChange: (next: AnyPayload) => void;
}) {
  // Helper to update an item field within payload.items[i].
  const editItem = (i: number, key: string, value: unknown) => {
    const items = [...(payload.items ?? [])];
    items[i] = { ...items[i], [key]: value };
    onChange({ ...payload, items });
  };

  if (type === 'flashcards') {
    return (
      <div className="flex flex-col gap-3">
        {(payload.items ?? []).map((it: AnyPayload, i: number) => (
          <ItemBlock key={i} n={i + 1}>
            <Field label="Term" value={it.term} onChange={(v) => editItem(i, 'term', v)} />
            <Field label="Translation" value={it.translation} onChange={(v) => editItem(i, 'translation', v)} />
            <Field label="Example (optional)" value={it.example ?? ''} onChange={(v) => editItem(i, 'example', v)} />
          </ItemBlock>
        ))}
      </div>
    );
  }

  if (type === 'quiz') {
    return (
      <div className="flex flex-col gap-3">
        {(payload.items ?? []).map((it: AnyPayload, i: number) => (
          <ItemBlock key={i} n={i + 1}>
            <Field label="Question" value={it.question} onChange={(v) => editItem(i, 'question', v)} textarea />
            <span className="text-xs text-ink-400">Options (select the correct one)</span>
            {(it.options ?? []).map((opt: string, oi: number) => (
              <div key={oi} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`correct-${i}`}
                  checked={it.correct_index === oi}
                  onChange={() => editItem(i, 'correct_index', oi)}
                  className="accent-emerald-600"
                />
                <input
                  value={opt}
                  onChange={(e) => {
                    const options = [...it.options];
                    options[oi] = e.target.value;
                    editItem(i, 'options', options);
                  }}
                  className="flex-1 rounded-lg border border-paper-300 bg-paper-50 px-3 py-1.5 text-sm focus:outline-none focus:border-ink-400"
                />
              </div>
            ))}
            <Field label="Explanation (optional)" value={it.explanation ?? ''} onChange={(v) => editItem(i, 'explanation', v)} />
          </ItemBlock>
        ))}
      </div>
    );
  }

  if (type === 'gap_fill') {
    return (
      <div className="flex flex-col gap-3">
        {(payload.items ?? []).map((it: AnyPayload, i: number) => (
          <ItemBlock key={i} n={i + 1}>
            <Field label="Sentence (use ___ for the gap)" value={it.sentence_with_blank} onChange={(v) => editItem(i, 'sentence_with_blank', v)} textarea />
            <Field label="Answer" value={it.answer} onChange={(v) => editItem(i, 'answer', v)} />
            <Field label="Hint (optional)" value={it.hint ?? ''} onChange={(v) => editItem(i, 'hint', v)} />
          </ItemBlock>
        ))}
      </div>
    );
  }

  if (type === 'matching') {
    const editPair = (i: number, key: string, value: string) => {
      const pairs = [...(payload.pairs ?? [])];
      pairs[i] = { ...pairs[i], [key]: value };
      onChange({ ...payload, pairs });
    };
    return (
      <div className="flex flex-col gap-3">
        {(payload.pairs ?? []).map((pr: AnyPayload, i: number) => (
          <ItemBlock key={i} n={i + 1}>
            <Field label="Left" value={pr.left} onChange={(v) => editPair(i, 'left', v)} />
            <Field label="Right" value={pr.right} onChange={(v) => editPair(i, 'right', v)} />
          </ItemBlock>
        ))}
      </div>
    );
  }

  if (type === 'quick_practice') {
    return (
      <div className="flex flex-col gap-2">
        <Field label="Prompt" value={payload.prompt} onChange={(v) => onChange({ ...payload, prompt: v })} textarea />
        <Field label="Answer" value={payload.answer} onChange={(v) => onChange({ ...payload, answer: v })} />
      </div>
    );
  }

  return null;
}

function ItemBlock({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-paper-300 pl-3 flex flex-col gap-2">
      <span className="text-[11px] font-medium text-ink-400">#{n}</span>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
}) {
  const cls =
    'w-full rounded-lg border border-paper-300 bg-paper-50 px-3 py-1.5 text-sm focus:outline-none focus:border-ink-400';
  return (
    <label className="block">
      <span className="text-xs text-ink-400">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className={`${cls} resize-none mt-0.5`}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${cls} mt-0.5`}
        />
      )}
    </label>
  );
}
