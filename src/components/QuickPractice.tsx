import { useState } from 'react';
import type { QuickPracticePayload } from '../lib/activity-schemas';
import SpeakButton from './SpeakButton';

type Props = {
  payload: QuickPracticePayload;
  language?: string | null;
  onComplete?: () => void;
};

export default function QuickPractice({ payload, language, onComplete }: Props) {
  const [revealed, setRevealed] = useState(false);

  const reveal = () => {
    setRevealed(true);
    onComplete?.();
  };

  return (
    <div className="rounded-xl border border-paper-300/70 bg-paper-100/60 p-6">
      <p className="font-display text-2xl font-medium text-center leading-snug">
        {payload.prompt}
      </p>

      {payload.options && payload.options.length > 0 && !revealed && (
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          {payload.options.map((opt, i) => (
            <span
              key={i}
              className="px-3 py-1.5 rounded-lg border border-paper-300 bg-paper-50 text-sm text-ink-700"
            >
              {opt}
            </span>
          ))}
        </div>
      )}

      {revealed ? (
        <p className="flex items-center justify-center gap-1.5 text-center text-lg text-emerald-700 font-medium mt-5">
          {payload.answer}
          <SpeakButton text={payload.answer} language={language} size="sm" />
        </p>
      ) : (
        <button
          type="button"
          onClick={reveal}
          className="mt-5 mx-auto block px-5 py-2.5 rounded-xl bg-emerald-600 text-paper-50 text-sm font-medium hover:bg-emerald-700 transition-colors"
        >
          Reveal answer
        </button>
      )}
    </div>
  );
}
