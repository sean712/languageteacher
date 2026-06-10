// Activity payload schemas — same shapes as the React-side `src/lib/activity-schemas.ts`.
// Duplicated rather than imported because this code runs in Deno on Edge Functions
// while the React copy runs in the browser bundle. Keep them in sync when changing
// SCHEMA_VERSION or any field; a future refactor can extract to a shared workspace
// package once the project grows.
import { z } from 'npm:zod@4.4.3';

export const SCHEMA_VERSION = 1;

const base = { schema_version: z.number().int().positive() };

export const FlashcardSchema = z.object({
  ...base,
  items: z.array(
    z.object({
      term: z.string(),
      translation: z.string(),
      example: z.string().optional(),
      note: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
    }),
  ),
});

export const GapFillSchema = z.object({
  ...base,
  items: z.array(
    z.object({
      sentence_with_blank: z.string(),
      answer: z.string(),
      hint: z.string().optional(),
    }),
  ),
});

export const QuizSchema = z.object({
  ...base,
  items: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()).min(2).max(6),
      correct_index: z.number().int().min(0),
      explanation: z.string().optional(),
    }),
  ),
});

export const MatchingSchema = z.object({
  ...base,
  pairs: z.array(z.object({ left: z.string(), right: z.string() })),
});

export const QuickPracticeSchema = z.object({
  ...base,
  prompt: z.string(),
  answer: z.string(),
  kind: z.enum(['flashcard', 'question']),
  options: z.array(z.string()).optional(),
});

export const ActivitySchemas = {
  flashcards: FlashcardSchema,
  gap_fill: GapFillSchema,
  quiz: QuizSchema,
  matching: MatchingSchema,
  quick_practice: QuickPracticeSchema,
} as const;

export type ActivityType = keyof typeof ActivitySchemas;

// Top-level bundle returned by AIProvider.generateActivities.
export const ActivityBundleSchema = z.object({
  language: z.string(),
  level: z.string(),
  confidence: z.number().min(0).max(1),
  needs_review_notes: z.array(z.string()).optional(),
  activities: z.array(
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('flashcards'), payload: FlashcardSchema }),
      z.object({ type: z.literal('gap_fill'), payload: GapFillSchema }),
      z.object({ type: z.literal('quiz'), payload: QuizSchema }),
      z.object({ type: z.literal('matching'), payload: MatchingSchema }),
      z.object({ type: z.literal('quick_practice'), payload: QuickPracticeSchema }),
    ]),
  ),
});

export type ActivityBundle = z.infer<typeof ActivityBundleSchema>;

// Shape the model must emit when grading a learner's free-written sentence.
export const SentenceFeedbackSchema = z.object({
  rating: z.enum(['great', 'good', 'needs_work']),
  feedback: z.string(),
  correction: z.string().optional(),
});

export type SentenceFeedback = z.infer<typeof SentenceFeedbackSchema>;
