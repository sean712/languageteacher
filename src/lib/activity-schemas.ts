import { z } from 'zod';

// Bump SCHEMA_VERSION when the activity payload shape changes in a
// non-backward-compatible way. Edge Function emits the current version;
// readers (this app) tolerate older versions where possible.
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

export type FlashcardsPayload = z.infer<typeof FlashcardSchema>;
export type GapFillPayload = z.infer<typeof GapFillSchema>;
export type QuizPayload = z.infer<typeof QuizSchema>;
export type MatchingPayload = z.infer<typeof MatchingSchema>;
export type QuickPracticePayload = z.infer<typeof QuickPracticeSchema>;

export const ActivitySchemas = {
  flashcards: FlashcardSchema,
  gap_fill: GapFillSchema,
  quiz: QuizSchema,
  matching: MatchingSchema,
  quick_practice: QuickPracticeSchema,
} as const;

export type ActivityType = keyof typeof ActivitySchemas;
