import { useState } from 'react';
import type { QuizPayload } from '../lib/activity-schemas';

type Props = { payload: QuizPayload };

export default function Quiz({ payload }: Props) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  const items = payload.items;
  if (items.length === 0) return <p className="text-sm text-gray-500">No questions.</p>;

  const q = items[index];
  const done = index >= items.length;

  if (done) {
    return (
      <div className="text-center py-8">
        <p className="text-2xl font-semibold">
          {score} / {items.length}
        </p>
        <p className="text-gray-500 mt-1">Nicely done.</p>
        <button
          type="button"
          onClick={() => {
            setIndex(0);
            setPicked(null);
            setScore(0);
          }}
          className="mt-6 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium"
        >
          Try again
        </button>
      </div>
    );
  }

  const isAnswered = picked !== null;
  const isCorrect = picked === q.correct_index;

  const next = () => {
    if (isCorrect) setScore((s) => s + 1);
    setPicked(null);
    setIndex((i) => i + 1);
  };

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
        <span>Quiz</span>
        <span>
          {index + 1} / {items.length}
        </span>
      </div>

      <p className="text-base sm:text-lg font-medium mb-4">{q.question}</p>

      <div className="flex flex-col gap-2">
        {q.options.map((opt, i) => {
          const showRight = isAnswered && i === q.correct_index;
          const showWrong = isAnswered && i === picked && !isCorrect;
          return (
            <button
              key={i}
              type="button"
              onClick={() => !isAnswered && setPicked(i)}
              className={[
                'w-full text-left px-4 py-3 rounded-xl border text-sm transition',
                showRight
                  ? 'bg-green-50 border-green-400 text-green-900 dark:bg-green-500/10 dark:text-green-300'
                  : showWrong
                  ? 'bg-red-50 border-red-400 text-red-900 dark:bg-red-500/10 dark:text-red-300'
                  : isAnswered
                  ? 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-500'
                  : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 active:bg-gray-50',
              ].join(' ')}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {isAnswered && q.explanation && (
        <p className="mt-3 text-sm text-gray-500">{q.explanation}</p>
      )}

      {isAnswered && (
        <button
          type="button"
          onClick={next}
          className="mt-4 w-full py-3 rounded-xl bg-brand-600 text-white text-sm font-medium"
        >
          {index + 1 === items.length ? 'See results' : 'Next question'}
        </button>
      )}
    </div>
  );
}
