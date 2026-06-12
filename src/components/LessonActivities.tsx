import { useCallback, useMemo, useState } from 'react';
import type { ActivityRow, VideoRow } from '../lib/database.types';
import FlashcardDeck from './FlashcardDeck';
import Quiz from './Quiz';
import GapFill from './GapFill';
import Matching from './Matching';
import QuickPractice from './QuickPractice';
import FreeWrite from './FreeWrite';
import {
  ActivitySchemas,
  type ActivityType,
  type FlashcardsPayload,
  type FreeWritePayload,
  type GapFillPayload,
  type MatchingPayload,
  type QuizPayload,
  type QuickPracticePayload,
} from '../lib/activity-schemas';

// Menu types include 'free_write', a frontend-only activity synthesized from
// a lesson's flashcard terms (not a stored activity row).
export type MenuType = ActivityType | 'free_write';

const FREE_WRITE_MAX_WORDS = 6;

// Order activities are offered in: warm-up → recall → production.
const ACTIVITY_ORDER: ActivityType[] = [
  'flashcards',
  'matching',
  'gap_fill',
  'quiz',
  'quick_practice',
];

const META: Record<MenuType, { label: string; blurb: string }> = {
  flashcards: { label: 'Flashcards', blurb: 'Learn the key words' },
  matching: { label: 'Matching', blurb: 'Pair them up' },
  gap_fill: { label: 'Fill the gaps', blurb: 'Complete the sentences' },
  quiz: { label: 'Quiz', blurb: 'Test yourself' },
  quick_practice: { label: 'Quick practice', blurb: 'One quick rep' },
  free_write: { label: 'Make it personal', blurb: 'Write your own sentence' },
};

export interface ParsedActivity {
  type: MenuType;
  count: number;
  payload: unknown;
}

export function parseActivities(activities: ActivityRow[]): ParsedActivity[] {
  const parsed: ParsedActivity[] = [];
  let flashcards: FlashcardsPayload | null = null;
  let quickPractice: QuickPracticePayload | null = null;
  for (const type of ACTIVITY_ORDER) {
    const row = activities.find((a) => a.type === type);
    if (!row) continue;
    const res = ActivitySchemas[type].safeParse(row.payload);
    if (!res.success) continue;
    const data = res.data;
    if (type === 'flashcards') flashcards = data as FlashcardsPayload;
    if (type === 'quick_practice') quickPractice = data as QuickPracticePayload;
    const count =
      'items' in data
        ? data.items.length
        : 'pairs' in data
        ? data.pairs.length
        : 1;
    parsed.push({ type, count, payload: data });
  }

  // Capstone production task: a personal writing prompt with AI feedback.
  // Prefer the lesson's flashcard terms; for a Short (just a quick_practice)
  // fall back to its answer so there's still something active to do.
  if (flashcards && flashcards.items.length > 0) {
    const items = flashcards.items
      .slice(0, FREE_WRITE_MAX_WORDS)
      .map((it) => ({ word: it.term, translation: it.translation }));
    parsed.push({ type: 'free_write', count: items.length, payload: { items } });
  } else if (quickPractice && quickPractice.answer.trim()) {
    parsed.push({
      type: 'free_write',
      count: 1,
      payload: { items: [{ word: quickPractice.answer.trim() }] },
    });
  }

  return parsed;
}

function countLabel(type: MenuType, count: number): string {
  switch (type) {
    case 'flashcards':
      return `${count} cards`;
    case 'quiz':
      return `${count} questions`;
    case 'gap_fill':
      return `${count} sentences`;
    case 'matching':
      return `${count} pairs`;
    case 'quick_practice':
      return 'Single prompt';
    case 'free_write':
      return 'with AI feedback';
  }
}

// Per-device completion memory, keyed by video. No auth needed.
export function useCompleted(videoId: string) {
  const key = `lingua:done:${videoId}`;
  const [done, setDone] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(key);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  const mark = useCallback(
    (type: string) => {
      setDone((prev) => {
        if (prev.has(type)) return prev;
        const next = new Set(prev);
        next.add(type);
        try {
          localStorage.setItem(key, JSON.stringify([...next]));
        } catch {
          /* ignore quota / private-mode errors */
        }
        return next;
      });
    },
    [key],
  );
  return [done, mark] as const;
}

// The activity engine: a picker that opens one activity at a time in a focused
// view, with per-device completion. Used inside LessonView.
export default function LessonActivities({
  video,
  activities,
}: {
  video: VideoRow;
  activities: ActivityRow[];
}) {
  const [selected, setSelected] = useState<MenuType | null>(null);
  const [completed, markComplete] = useCompleted(video.id);

  const parsed = useMemo(() => parseActivities(activities), [activities]);
  const doneCount = parsed.filter((p) => completed.has(p.type)).length;
  const allDone = parsed.length > 0 && doneCount === parsed.length;

  const current = selected
    ? parsed.find((p) => p.type === selected) ?? null
    : null;
  const nextUp = parsed.find((p) => p.type !== selected && !completed.has(p.type));

  if (parsed.length === 0) {
    return (
      <p className="text-sm text-ink-400">
        No activities generated for this lesson yet.
      </p>
    );
  }

  return current ? (
    <FocusedActivity
      video={video}
      parsed={current}
      completed={completed.has(current.type)}
      nextLabel={nextUp ? META[nextUp.type].label : null}
      onComplete={() => markComplete(current.type)}
      onBack={() => setSelected(null)}
      onNext={nextUp ? () => setSelected(nextUp.type) : undefined}
    />
  ) : (
    <ActivityMenu
      parsed={parsed}
      completed={completed}
      doneCount={doneCount}
      allDone={allDone}
      onPick={setSelected}
    />
  );
}

function ActivityMenu({
  parsed,
  completed,
  doneCount,
  allDone,
  onPick,
}: {
  parsed: ParsedActivity[];
  completed: Set<string>;
  doneCount: number;
  allDone: boolean;
  onPick: (t: MenuType) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-display text-lg font-medium">
          {allDone ? 'You’ve done it all 🎉' : 'Choose an activity'}
        </h4>
        <span className="text-xs text-ink-400">
          {doneCount} / {parsed.length} done
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        {parsed.map((p) => {
          const isDone = completed.has(p.type);
          return (
            <button
              key={p.type}
              type="button"
              onClick={() => onPick(p.type)}
              className="group flex items-center gap-3.5 rounded-xl border border-paper-300/70 bg-paper-50 p-3 text-left hover:border-ink-400 hover:bg-paper-100/50 transition-colors"
            >
              <span
                className={`flex-shrink-0 w-10 h-10 rounded-lg grid place-items-center ${
                  isDone
                    ? 'bg-emerald-500 text-paper-50'
                    : 'bg-emerald-50 text-emerald-600'
                }`}
              >
                {isDone ? <CheckIcon /> : <ActivityIcon type={p.type} />}
              </span>
              <span className="min-w-0">
                <span className="block font-medium leading-tight">
                  {META[p.type].label}
                </span>
                <span className="block text-xs text-ink-400 mt-0.5">
                  {META[p.type].blurb} · {countLabel(p.type, p.count)}
                </span>
              </span>
              <span
                aria-hidden
                className="ml-auto text-ink-400 group-hover:text-ink-700 group-hover:translate-x-0.5 transition-all"
              >
                →
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FocusedActivity({
  video,
  parsed,
  completed,
  nextLabel,
  onComplete,
  onBack,
  onNext,
}: {
  video: VideoRow;
  parsed: ParsedActivity;
  completed: boolean;
  nextLabel: string | null;
  onComplete: () => void;
  onBack: () => void;
  onNext?: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors"
        >
          <span aria-hidden>←</span> Activities
        </button>
        <span className="flex items-center gap-2 text-sm font-medium">
          {META[parsed.type].label}
          {completed && (
            <span className="text-emerald-600" title="Completed">
              <CheckIcon />
            </span>
          )}
        </span>
      </div>

      <ActivityBody video={video} parsed={parsed} onComplete={onComplete} />

      {completed && (
        <div className="mt-5 pt-4 border-t border-paper-300/60 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <p className="text-sm text-emerald-700 font-medium">Activity complete</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2 rounded-lg border border-paper-300 text-sm font-medium text-ink-700 hover:border-ink-400 transition-colors"
            >
              Back to activities
            </button>
            {onNext && nextLabel && (
              <button
                type="button"
                onClick={onNext}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-paper-50 text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                Next: {nextLabel} →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityBody({
  video,
  parsed,
  onComplete,
}: {
  video: VideoRow;
  parsed: ParsedActivity;
  onComplete: () => void;
}) {
  switch (parsed.type) {
    case 'flashcards':
      return (
        <FlashcardDeck
          payload={parsed.payload as FlashcardsPayload}
          onComplete={onComplete}
        />
      );
    case 'quiz':
      return (
        <Quiz payload={parsed.payload as QuizPayload} onComplete={onComplete} />
      );
    case 'gap_fill':
      return (
        <GapFill
          payload={parsed.payload as GapFillPayload}
          onComplete={onComplete}
        />
      );
    case 'matching':
      return (
        <Matching
          payload={parsed.payload as MatchingPayload}
          onComplete={onComplete}
        />
      );
    case 'quick_practice':
      return (
        <QuickPractice
          payload={parsed.payload as QuickPracticePayload}
          onComplete={onComplete}
        />
      );
    case 'free_write':
      return (
        <FreeWrite
          payload={parsed.payload as FreeWritePayload}
          language={video.language}
          level={video.level}
          videoId={video.id}
          onComplete={onComplete}
        />
      );
  }
}

function ActivityIcon({ type }: { type: MenuType }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (type) {
    case 'flashcards':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="14" height="14" rx="2" />
          <path d="M7 5l4-2 9 4-1.5 4" />
        </svg>
      );
    case 'quiz':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case 'gap_fill':
      return (
        <svg {...common}>
          <path d="M4 7h16M4 12h6M14 12h6M4 17h16" />
        </svg>
      );
    case 'matching':
      return (
        <svg {...common}>
          <path d="M7 8H5a3 3 0 000 6h2M17 8h2a3 3 0 010 6h-2M9 11h6" />
        </svg>
      );
    case 'quick_practice':
      return (
        <svg {...common}>
          <path d="M13 2L3 14h7l-1 8 10-12h-7z" />
        </svg>
      );
    case 'free_write':
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
        </svg>
      );
  }
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}
