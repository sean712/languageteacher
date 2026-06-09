// Provider-agnostic prompts. Only the transport (OpenAI vs Anthropic API shape)
// differs per provider — the prompt strings themselves live here.
import { SCHEMA_VERSION } from './schemas.ts';
import type { ActivityGenInput } from './ai-types.ts';

const TRANSCRIPT_CAP = 18_000;

export function detectLanguageAndLevelPrompt(text: string): {
  system: string;
  user: string;
} {
  return {
    system:
      'You identify the language and CEFR level of short language-learning content. Respond ONLY with JSON matching {"language": <ISO 639-1 code or English language name>, "level": "A1"|"A2"|"B1"|"B2"|"C1"|"C2"}.',
    user: text.slice(0, 4_000),
  };
}

export function activityGenerationPrompt(input: ActivityGenInput): {
  system: string;
  user: string;
} {
  const trimmedTranscript = input.transcript.slice(0, TRANSCRIPT_CAP);
  const trimmedSupp = input.supplementary_text?.slice(0, 6_000) ?? '';

  const sizing =
    input.video_type === 'short'
      ? `Produce exactly ONE activity of type "quick_practice" — a single focused card or question that captures the key point of the Short.`
      : `Produce a set of activities:
- one "flashcards" activity with 10-15 items (term/translation, optional example)
- one "quiz" activity with 5-8 multiple-choice questions (4 options each)
- one "gap_fill" activity with 5-8 sentences
- one "matching" activity with 5-8 pairs
Skip an activity type only if there isn't enough relevant material — never fabricate.`;

  const system = `You are a language-learning content designer. Given a teacher's video transcript and any supplementary material, produce structured learning activities for learners studying the SAME language as the source.

Rules:
1. Output ONLY valid JSON matching the schema below — no prose, no markdown, no code fences.
2. Every activity payload must include "schema_version": ${SCHEMA_VERSION}.
3. Source content from the transcript; the supplementary material (often a teacher-supplied transcript correction or vocab list) is the authoritative ground truth — prefer it over the auto-caption transcript on any conflict.
4. For low-resource languages (e.g. Welsh, Irish, Basque) where auto-captions are often wrong, be conservative: only include terms you are confident about; flag uncertain terms in "needs_review_notes" and add a "confidence" field (0-1) per flashcard item.
5. "language" must be the language being TAUGHT (the target language), not the language of instruction.
6. "level" is overall CEFR: A1 | A2 | B1 | B2 | C1 | C2.
7. "confidence" is an overall 0-1 score reflecting how reliable the activities are; <0.6 means the teacher should review before publishing.

JSON shape:
{
  "language": string,
  "level": "A1"|"A2"|"B1"|"B2"|"C1"|"C2",
  "confidence": number (0..1),
  "needs_review_notes": string[] (optional — terms or sections you're uncertain about),
  "activities": [
    { "type": "flashcards", "payload": { "schema_version": ${SCHEMA_VERSION}, "items": [ { "term": string, "translation": string, "example"?: string, "note"?: string, "confidence"?: number } ] } },
    { "type": "quiz", "payload": { "schema_version": ${SCHEMA_VERSION}, "items": [ { "question": string, "options": string[], "correct_index": number, "explanation"?: string } ] } },
    { "type": "gap_fill", "payload": { "schema_version": ${SCHEMA_VERSION}, "items": [ { "sentence_with_blank": string, "answer": string, "hint"?: string } ] } },
    { "type": "matching", "payload": { "schema_version": ${SCHEMA_VERSION}, "pairs": [ { "left": string, "right": string } ] } },
    { "type": "quick_practice", "payload": { "schema_version": ${SCHEMA_VERSION}, "prompt": string, "answer": string, "kind": "flashcard"|"question", "options"?: string[] } }
  ]
}

${sizing}`;

  const user = `Video title: ${input.title ?? '(unknown)'}
Video type: ${input.video_type}
Detected language (may be wrong): ${input.language ?? 'unknown'}
Detected level (may be wrong): ${input.level ?? 'unknown'}

=== TRANSCRIPT (auto-captions or Whisper output — may contain errors) ===
${trimmedTranscript}

${
  trimmedSupp
    ? `=== TEACHER-SUPPLIED SUPPLEMENTARY MATERIAL (authoritative ground truth) ===
${trimmedSupp}`
    : '=== No supplementary material was provided. Be extra cautious with terms transcribed from low-resource languages. ==='
}`;

  return { system, user };
}
