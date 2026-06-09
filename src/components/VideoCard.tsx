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

  return (
    <article className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left active:bg-gray-50 dark:active:bg-white/10"
      >
        <div className="flex gap-3 p-3">
          {video.thumbnail_url && (
            <img
              src={video.thumbnail_url}
              alt=""
              className="w-28 h-20 sm:w-32 sm:h-24 rounded-lg object-cover flex-shrink-0 bg-gray-100"
            />
          )}
          <div className="min-w-0 flex flex-col justify-between py-0.5">
            <h2 className="text-sm sm:text-base font-medium line-clamp-2">
              {video.title ?? 'Untitled lesson'}
            </h2>
            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
              {video.type === 'short' && (
                <span className="px-1.5 py-0.5 rounded bg-brand-100 text-brand-700">
                  Short
                </span>
              )}
              {video.language && <span>{video.language.toUpperCase()}</span>}
              {video.level && <span>· {video.level}</span>}
            </div>
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 dark:border-white/10 p-4 flex flex-col gap-6">
          {flashcards && (
            <SectionDeck activity={flashcards} />
          )}
          {quickPractice && !flashcards && (
            <p className="text-sm text-gray-500">
              Quick-practice rendering: TODO.
            </p>
          )}
          {quiz && <SectionQuiz activity={quiz} />}
          {!flashcards && !quiz && !quickPractice && (
            <p className="text-sm text-gray-500">
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

function SchemaError({ type }: { type: string }) {
  return (
    <p className="text-xs text-amber-700 dark:text-amber-400">
      Couldn't render this {type} activity — saved payload doesn't match the
      expected schema.
    </p>
  );
}
