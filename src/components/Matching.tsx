import { useMemo, useState } from 'react';
import type { MatchingPayload } from '../lib/activity-schemas';

type Props = { payload: MatchingPayload; onComplete?: () => void };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Tap a term on the left, then its match on the right. Correct pairs lock in
// green; a wrong attempt flashes red. Pair identity is the original index.
export default function Matching({ payload, onComplete }: Props) {
  const pairs = payload.pairs;
  const lefts = useMemo(
    () => shuffle(pairs.map((p, i) => ({ id: i, text: p.left }))),
    [pairs],
  );
  const rights = useMemo(
    () => shuffle(pairs.map((p, i) => ({ id: i, text: p.right }))),
    [pairs],
  );

  const [selected, setSelected] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [wrongPair, setWrongPair] = useState<[number, number] | null>(null);

  const attempt = (rightId: number) => {
    if (selected === null || matched.has(rightId)) return;
    if (rightId === selected) {
      const next = new Set(matched);
      next.add(rightId);
      setMatched(next);
      setSelected(null);
      if (next.size === pairs.length) onComplete?.();
    } else {
      setWrongPair([selected, rightId]);
      window.setTimeout(() => setWrongPair(null), 550);
      setSelected(null);
    }
  };

  const done = matched.size === pairs.length;

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-ink-400 mb-3">
        <span>Match each pair.</span>
        <span>
          {matched.size} / {pairs.length}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-2.5">
          {lefts.map((l) => {
            const isMatched = matched.has(l.id);
            const isSelected = selected === l.id;
            const isWrong = wrongPair?.[0] === l.id;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => !isMatched && setSelected(l.id)}
                disabled={isMatched}
                className={[
                  'px-3 py-3 rounded-xl border text-sm text-left transition-colors',
                  isMatched
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                    : isWrong
                    ? 'bg-red-50 border-red-400 text-red-700'
                    : isSelected
                    ? 'bg-ink-900 border-ink-900 text-paper-50'
                    : 'bg-paper-50 border-paper-300 text-ink-900 hover:border-ink-400',
                ].join(' ')}
              >
                {l.text}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2.5">
          {rights.map((r) => {
            const isMatched = matched.has(r.id);
            const isWrong = wrongPair?.[1] === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => attempt(r.id)}
                disabled={isMatched}
                className={[
                  'px-3 py-3 rounded-xl border text-sm text-left transition-colors',
                  isMatched
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                    : isWrong
                    ? 'bg-red-50 border-red-400 text-red-700'
                    : selected === null
                    ? 'bg-paper-50 border-paper-300 text-ink-900'
                    : 'bg-paper-50 border-paper-300 text-ink-900 hover:border-ink-400',
                ].join(' ')}
              >
                {r.text}
              </button>
            );
          })}
        </div>
      </div>

      {done && (
        <p className="mt-4 text-sm font-medium text-emerald-700 text-center">
          Every pair matched — great work.
        </p>
      )}
    </div>
  );
}
