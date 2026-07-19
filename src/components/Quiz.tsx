import { useEffect, useState } from 'react';
import type { QuizPayload } from '../lib/activity-schemas';
import SpeakButton from './SpeakButton';
import { hasVoice } from '../lib/audio-player';

type Props = {
  payload: QuizPayload;
  language?: string | null;
  onComplete?: () => void;
};

export default function Quiz({ payload, language, onComplete }: Props) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  const items = payload.items;
  const done = items.length > 0 && index >= items.length;

  // Mark complete once the learner reaches the results screen.
  useEffect(() => {
    if (done) onComplete?.();
  }, [done, onComplete]);

  if (items.length === 0) return <p className="text-sm text-ink-400">No questions.</p>;

  const q = items[index];

  if (done) {
    return (
      <div className="text-center py-8">
        <p className="font-display text-4xl font-semibold">
          {score} / {items.length}
        </p>
        <p className="text-ink-500 mt-1">Nicely done.</p>
        <button
          type="button"
          onClick={() => {
            setIndex(0);
            setPicked(null);
            setScore(0);
          }}
          className="mt-6 px-5 py-2.5 rounded-xl bg-emerald-600 text-paper-50 text-sm font-medium hover:bg-emerald-700 transition-colors"
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
      <div className="flex items-center justify-between text-xs text-ink-400 mb-2">
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
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                  : showWrong
                  ? 'bg-red-50 border-red-400 text-red-800'
                  : isAnswered
                  ? 'bg-paper-100 border-paper-300/70 text-ink-400'
                  : 'bg-paper-50 border-paper-300/70 text-ink-900 hover:border-ink-400',
              ].join(' ')}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {isAnswered && hasVoice(language) && (
        <div className="mt-3 flex items-center gap-1.5">
          <SpeakButton
            text={q.options[q.correct_index]}
            language={language}
            size="sm"
          />
          <span className="text-sm text-ink-500">
            Hear it: <span className="text-ink-700">{q.options[q.correct_index]}</span>
          </span>
        </div>
      )}

      {isAnswered && q.explanation && (
        <p className="mt-3 text-sm text-ink-500">{q.explanation}</p>
      )}

      {isAnswered && (
        <button
          type="button"
          onClick={next}
          className="mt-4 w-full py-3 rounded-xl bg-emerald-600 text-paper-50 text-sm font-medium hover:bg-emerald-700 transition-colors"
        >
          {index + 1 === items.length ? 'See results' : 'Next question'}
        </button>
      )}
    </div>
  );
}
