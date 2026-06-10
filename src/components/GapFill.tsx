import { useMemo, useState } from 'react';
import type { GapFillPayload } from '../lib/activity-schemas';

type Props = { payload: GapFillPayload; onComplete?: () => void };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Split a sentence around its blank marker. Handles "___", "[blank]", "...".
function splitBlank(s: string): [string, string] {
  const m = s.match(/_{2,}|\[[^\]]*\]|\.{3,}/);
  if (!m || m.index === undefined) return [s.replace(/\s+$/, '') + ' ', ''];
  return [s.slice(0, m.index), s.slice(m.index + m[0].length)];
}

export default function GapFill({ payload, onComplete }: Props) {
  const items = payload.items;
  // A word bank: one chip per answer, shuffled, each usable once.
  const bank = useMemo(
    () => shuffle(items.map((it, i) => ({ id: i, word: it.answer }))),
    [items],
  );

  // placement[blankIndex] = bank chip id (or null)
  const [placement, setPlacement] = useState<(number | null)[]>(() =>
    items.map(() => null),
  );
  const [checked, setChecked] = useState(false);
  const [solved, setSolved] = useState(false);

  const wordOf = (bankId: number) => bank.find((b) => b.id === bankId)!.word;
  const usedIds = new Set(
    placement.filter((x): x is number => x !== null),
  );
  const allFilled = placement.every((x) => x !== null);

  const placeWord = (bankId: number) => {
    if (solved) return;
    setChecked(false);
    setPlacement((prev) => {
      const next = [...prev];
      const target = next.findIndex((x) => x === null);
      if (target !== -1) next[target] = bankId;
      return next;
    });
  };

  const clearBlank = (blankIdx: number) => {
    if (solved || placement[blankIdx] === null) return;
    setChecked(false);
    setPlacement((prev) => {
      const next = [...prev];
      next[blankIdx] = null;
      return next;
    });
  };

  const isBlankCorrect = (i: number) =>
    placement[i] !== null && wordOf(placement[i]!) === items[i].answer;

  const check = () => {
    setChecked(true);
    if (placement.every((_, i) => isBlankCorrect(i))) {
      setSolved(true);
      onComplete?.();
    }
  };

  return (
    <div>
      <div className="text-xs text-ink-400 mb-3">
        Tap a word, then drop it into the gaps.
      </div>

      <ol className="flex flex-col gap-3">
        {items.map((item, i) => {
          const [before, after] = splitBlank(item.sentence_with_blank);
          const bankId = placement[i];
          const filledWord = bankId !== null ? wordOf(bankId) : null;
          const correct = checked && isBlankCorrect(i);
          const wrong = checked && !isBlankCorrect(i);
          return (
            <li
              key={i}
              className="rounded-xl border border-paper-300/70 bg-paper-50 px-4 py-3 text-[0.95rem] leading-relaxed"
            >
              <span>{before}</span>
              <button
                type="button"
                onClick={() => clearBlank(i)}
                disabled={solved}
                className={[
                  'inline-flex items-center justify-center min-w-20 mx-0.5 px-2 py-0.5 rounded-md align-baseline text-sm font-medium transition-colors',
                  filledWord === null
                    ? 'border-b-2 border-dashed border-ink-400 text-ink-400'
                    : correct
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-500'
                    : wrong
                    ? 'bg-red-50 text-red-700 border border-red-400'
                    : 'bg-paper-200 text-ink-900 border border-paper-300',
                ].join(' ')}
              >
                {filledWord ?? '     '}
              </button>
              <span>{after}</span>
              {item.hint && !solved && (
                <span className="block text-xs text-ink-400 mt-1">
                  Hint: {item.hint}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* word bank */}
      <div className="flex flex-wrap gap-2 mt-4">
        {bank.map((chip) => {
          const used = usedIds.has(chip.id);
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => placeWord(chip.id)}
              disabled={used || solved}
              className={[
                'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                used
                  ? 'opacity-30 border-paper-300 text-ink-400'
                  : 'bg-paper-50 border-paper-300 text-ink-900 hover:border-ink-400',
              ].join(' ')}
            >
              {chip.word}
            </button>
          );
        })}
      </div>

      {solved ? (
        <p className="mt-4 text-sm font-medium text-emerald-700 text-center">
          All correct — nicely done.
        </p>
      ) : (
        <button
          type="button"
          onClick={check}
          disabled={!allFilled}
          className="mt-4 w-full py-3 rounded-xl bg-emerald-600 text-paper-50 text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40"
        >
          {checked ? 'Check again' : 'Check answers'}
        </button>
      )}
    </div>
  );
}
