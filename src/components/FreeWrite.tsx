import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import type {
  FreeWritePayload,
  SentenceFeedback,
} from '../lib/activity-schemas';

type Props = {
  payload: FreeWritePayload;
  language: string | null;
  level: string | null;
  videoId: string;
  onComplete?: () => void;
};

interface SavedSentence {
  word: string;
  sentence: string;
  rating: SentenceFeedback['rating'];
  feedback: string;
  savedAt: number;
}

// Per-device store of the learner's own sentences, keyed by lesson. Mirrors
// the completion store in LessonActivities — anonymous, no auth needed yet.
function useSavedSentences(videoId: string) {
  const key = `lingua:saved:${videoId}`;
  const [saved, setSaved] = useState<SavedSentence[]>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as SavedSentence[]) : [];
    } catch {
      return [];
    }
  });
  const persist = useCallback(
    (next: SavedSentence[]) => {
      setSaved(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore quota / private-mode errors */
      }
    },
    [key],
  );
  const add = useCallback(
    (s: SavedSentence) => persist([s, ...saved]),
    [persist, saved],
  );
  const remove = useCallback(
    (savedAt: number) => persist(saved.filter((s) => s.savedAt !== savedAt)),
    [persist, saved],
  );
  return { saved, add, remove };
}

const RATING_STYLE: Record<SentenceFeedback['rating'], { label: string; cls: string }> = {
  great: { label: 'Great', cls: 'bg-emerald-500 text-paper-50' },
  good: { label: 'Good', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-500' },
  needs_work: { label: 'Keep going', cls: 'bg-amber-100 text-amber-800' },
};

export default function FreeWrite({
  payload,
  language,
  level,
  videoId,
  onComplete,
}: Props) {
  const items = payload.items;
  const [index, setIndex] = useState(0);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SentenceFeedback | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const { saved, add, remove } = useSavedSentences(videoId);

  const item = items[index];

  const reset = () => {
    setText('');
    setFeedback(null);
    setStatus('idle');
    setError(null);
    setJustSaved(false);
  };

  const getFeedback = async () => {
    if (!text.trim()) return;
    setStatus('loading');
    setError(null);
    setFeedback(null);
    const { data, error: invokeErr } = await supabase.functions.invoke(
      'evaluate-sentence',
      {
        body: {
          word: item.word,
          translation: item.translation,
          language: language ?? 'the target language',
          level,
          sentence: text.trim(),
          // For server-side ai_feedback event logging (rev-share signal).
          video_id: videoId,
        },
      },
    );
    if (invokeErr || !data || (data as { error?: string }).error) {
      setStatus('error');
      setError(
        (data as { error?: string } | null)?.error ??
          'The tutor could not respond just now — please try again.',
      );
      return;
    }
    setFeedback(data as SentenceFeedback);
    setStatus('idle');
    onComplete?.();
  };

  const saveSentence = () => {
    if (!feedback) return;
    add({
      word: item.word,
      sentence: text.trim(),
      rating: feedback.rating,
      feedback: feedback.feedback,
      savedAt: Date.now(),
    });
    setJustSaved(true);
  };

  const nextWord = () => {
    setIndex((i) => (i + 1) % items.length);
    reset();
  };

  return (
    <div>
      <div className="text-xs text-ink-400 mb-3">
        Make it yours — write a real sentence about your life. The AI tutor will
        give you feedback.
      </div>

      <div className="rounded-xl border border-paper-300/70 bg-paper-100/60 p-4">
        <p className="text-sm text-ink-500">
          Write a sentence using
          {items.length > 1 ? ` (${index + 1}/${items.length})` : ''}:
        </p>
        <p className="font-display text-2xl font-medium mt-1">
          {item.word}
          {item.translation && (
            <span className="text-ink-400 text-base font-normal">
              {' '}
              · {item.translation}
            </span>
          )}
        </p>

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setJustSaved(false);
          }}
          rows={3}
          maxLength={600}
          placeholder="e.g. write about your day, your family, your plans…"
          className="mt-3 w-full rounded-lg border border-paper-300 bg-paper-50 p-3 text-[0.95rem] resize-none focus:outline-none focus:border-ink-400"
        />

        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={getFeedback}
            disabled={!text.trim() || status === 'loading'}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 text-paper-50 text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40"
          >
            {status === 'loading' ? 'Asking the tutor…' : 'Get feedback'}
          </button>
          {items.length > 1 && (
            <button
              type="button"
              onClick={nextWord}
              className="px-4 py-2.5 rounded-xl border border-paper-300 text-sm font-medium text-ink-700 hover:border-ink-400 transition-colors"
            >
              Try another word →
            </button>
          )}
        </div>
      </div>

      {status === 'error' && error && (
        <p className="mt-3 text-sm text-red-700">{error}</p>
      )}

      {feedback && (
        <div className="mt-3 rounded-xl border border-paper-300/70 bg-paper-50 p-4">
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${RATING_STYLE[feedback.rating].cls}`}
            >
              {RATING_STYLE[feedback.rating].label}
            </span>
            <span className="text-xs text-ink-400">Tutor feedback</span>
          </div>
          <p className="text-[0.95rem] text-ink-700 leading-relaxed mt-2">
            {feedback.feedback}
          </p>
          {feedback.correction && feedback.correction.trim() && (
            <p className="text-sm mt-2">
              <span className="text-ink-400">Suggested: </span>
              <span className="text-ink-900 font-medium">
                {feedback.correction}
              </span>
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={saveSentence}
              disabled={justSaved}
              className="px-3.5 py-2 rounded-lg border border-emerald-500 text-emerald-700 text-sm font-medium hover:bg-emerald-50 transition-colors disabled:opacity-50"
            >
              {justSaved ? 'Saved ✓' : 'Save sentence'}
            </button>
            {items.length > 1 && (
              <button
                type="button"
                onClick={nextWord}
                className="px-3.5 py-2 rounded-lg text-sm font-medium text-ink-700 hover:bg-paper-100 transition-colors"
              >
                Next word →
              </button>
            )}
          </div>
        </div>
      )}

      {saved.length > 0 && (
        <div className="mt-5">
          <h5 className="text-xs uppercase tracking-wide text-ink-400 mb-2">
            Your saved sentences
          </h5>
          <ul className="flex flex-col gap-2">
            {saved.map((s) => (
              <li
                key={s.savedAt}
                className="rounded-lg border border-paper-300/70 bg-paper-50 px-3.5 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[0.95rem] text-ink-900">{s.sentence}</p>
                  <button
                    type="button"
                    onClick={() => remove(s.savedAt)}
                    aria-label="Remove saved sentence"
                    className="text-ink-400 hover:text-ink-700 text-sm leading-none px-1"
                  >
                    ×
                  </button>
                </div>
                <p className="text-xs text-ink-400 mt-1">
                  <span className="text-emerald-600 font-medium">{s.word}</span>{' '}
                  · {s.feedback}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
