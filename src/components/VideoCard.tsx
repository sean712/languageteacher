import { useState } from 'react';
import type { ActivityRow, VideoRow } from '../lib/database.types';
import FlashcardDeck from './FlashcardDeck';
import Quiz from './Quiz';
import {
  ActivitySchemas,
  type FlashcardsPayload,
  type QuizPayload,
} from '../lib/activity-schemas';

type Props = { video: VideoRow; activities: ActivityRow[] };

export default function VideoCard({ video, activities }: Props) {
  const [open, setOpen] = useState(false);

  const flashcards = activities.find((a) => a.type === 'flashcards');
  const quiz = activities.find((a) => a.type === 'quiz');
  const quickPractice = activities.find((a) => a.type === 'quick_practice');

  const activityCount = [flashcards, quiz, quickPractice].filter(Boolean).length;

  return (
    <article className="rounded-2xl border border-paper-300/70 bg-paper-50 overflow-hidden transition-shadow hover:shadow-[0_14px_30px_-20px_rgba(26,25,22,0.35)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-left hover:bg-paper-100/60 transition-colors"
      >
        <div className="flex gap-3.5 p-3.5">
          {video.thumbnail_url && (
            <div className="relative w-32 h-[5.5rem] sm:w-36 sm:h-24 rounded-xl overflow-hidden flex-shrink-0 bg-paper-200">
              <img
                src={video.thumbnail_url}
                alt=""
                className="w-full h-full object-cover"
              />
              {video.type === 'short' && (
                <span className="absolute top-1.5 left-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-ink-900/80 text-paper-50">
                  Short
                </span>
              )}
            </div>
          )}
          <div className="min-w-0 flex flex-col justify-between py-0.5">
            <h3 className="text-[0.95rem] sm:text-base font-medium leading-snug line-clamp-2">
              {video.title ?? 'Untitled lesson'}
            </h3>
            <div className="flex items-center gap-2 mt-2 text-xs text-ink-400">
              {video.level && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
                  {video.level}
                </span>
              )}
              {video.language && (
                <span className="capitalize">{video.language}</span>
              )}
              {activityCount > 0 && (
                <span className="text-ink-400">
                  · {activityCount} {activityCount === 1 ? 'activity' : 'activities'}
                </span>
              )}
            </div>
          </div>
          <span
            aria-hidden
            className={`self-center ml-auto pr-1 text-ink-400 transition-transform ${
              open ? 'rotate-180' : ''
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </button>

      {open && (
        <div className="border-t border-paper-300/60 p-4 sm:p-5 flex flex-col gap-7">
          {flashcards && <SectionDeck activity={flashcards} />}
          {quickPractice && !flashcards && (
            <SectionQuickPractice activity={quickPractice} />
          )}
          {quiz && <SectionQuiz activity={quiz} />}
          {!flashcards && !quiz && !quickPractice && (
            <p className="text-sm text-ink-400">
              No activities generated for this video yet.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function SectionDeck({ activity }: { activity: ActivityRow }) {
  const parsed = ActivitySchemas.flashcards.safeParse(activity.payload);
  if (!parsed.success) {
    return <SchemaError type="flashcards" />;
  }
  return <FlashcardDeck payload={parsed.data as FlashcardsPayload} />;
}

function SectionQuiz({ activity }: { activity: ActivityRow }) {
  const parsed = ActivitySchemas.quiz.safeParse(activity.payload);
  if (!parsed.success) {
    return <SchemaError type="quiz" />;
  }
  return <Quiz payload={parsed.data as QuizPayload} />;
}

function SectionQuickPractice({ activity }: { activity: ActivityRow }) {
  const parsed = ActivitySchemas.quick_practice.safeParse(activity.payload);
  if (!parsed.success) {
    return <SchemaError type="quick practice" />;
  }
  const { prompt, answer } = parsed.data;
  return (
    <div>
      <div className="text-xs text-ink-400 mb-2">Quick practice</div>
      <div className="rounded-xl border border-paper-300/70 bg-paper-100/60 p-5">
        <p className="font-display text-xl font-medium text-center">{prompt}</p>
        <details className="mt-3 group">
          <summary className="list-none text-center text-sm text-emerald-600 font-medium cursor-pointer">
            Reveal answer
          </summary>
          <p className="text-center text-ink-700 mt-2">{answer}</p>
        </details>
      </div>
    </div>
  );
}

function SchemaError({ type }: { type: string }) {
  return (
    <p className="text-xs text-amber-700">
      Couldn't render this {type} activity — saved payload doesn't match the
      expected schema.
    </p>
  );
}
