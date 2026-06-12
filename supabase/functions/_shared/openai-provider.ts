import OpenAI from 'npm:openai@6.42.0';
import {
  AIProviderError,
  type AIProvider,
  type ActivityGenInput,
  type DetectResult,
  type SentenceFeedback,
  type SentenceFeedbackInput,
} from './ai-types.ts';
import {
  ActivityBundleSchema,
  SentenceFeedbackSchema,
  type ActivityBundle,
} from './schemas.ts';
import {
  activityGenerationPrompt,
  detectLanguageAndLevelPrompt,
  sentenceFeedbackPrompt,
} from './prompts.ts';

// Uses OpenAI's Responses API (client.responses.create). The two small,
// fixed-shape calls (detection, sentence feedback) use strict json_schema
// Structured Outputs — the model literally can't return a non-conforming
// object, so no parse/repair retry is needed. Activity generation uses
// json_object mode + Zod validation with one repair retry, because its schema
// is a large discriminated union (FlashcardSchema | QuizSchema | …) that isn't
// worth hand-maintaining as strict JSON Schema alongside the Zod source of
// truth in schemas.ts.

const DETECTION_SCHEMA = {
  type: 'object',
  properties: {
    language: { type: 'string' },
    level: { type: 'string', enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
  },
  required: ['language', 'level'],
  additionalProperties: false,
} as const;

// Strict mode requires every property in `required`, so the optional
// `correction` is required-but-nullable here and normalized to undefined below.
const FEEDBACK_SCHEMA = {
  type: 'object',
  properties: {
    rating: { type: 'string', enum: ['great', 'good', 'needs_work'] },
    feedback: { type: 'string' },
    correction: { type: ['string', 'null'] },
  },
  required: ['rating', 'feedback', 'correction'],
  additionalProperties: false,
} as const;

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private model: string;

  constructor(opts: { apiKey: string; model?: string }) {
    this.client = new OpenAI({ apiKey: opts.apiKey });
    this.model = opts.model ?? Deno.env.get('OPENAI_MODEL') ?? 'gpt-5-mini';
  }

  async detectLanguageAndLevel(text: string): Promise<DetectResult> {
    const { system, user } = detectLanguageAndLevelPrompt(text);
    let parsed: { language?: unknown; level?: unknown };
    try {
      parsed = await this.respondJsonSchema(system, user, 'detection', DETECTION_SCHEMA);
    } catch (e) {
      throw new AIProviderError('detect: Responses API call failed', e, true);
    }
    return {
      language: String(parsed.language ?? 'unknown'),
      level: String(parsed.level ?? 'A2'),
    };
  }

  async evaluateSentence(input: SentenceFeedbackInput): Promise<SentenceFeedback> {
    const { system, user } = sentenceFeedbackPrompt(input);
    let json: Record<string, unknown>;
    try {
      json = await this.respondJsonSchema(system, user, 'sentence_feedback', FEEDBACK_SCHEMA);
    } catch (e) {
      throw new AIProviderError('feedback: Responses API call failed', e, true);
    }
    // Strict schema returns correction as string|null; Zod wants string|undefined.
    if (json.correction === null) delete json.correction;
    const validated = SentenceFeedbackSchema.safeParse(json);
    if (!validated.success) {
      throw new AIProviderError(
        `feedback: schema validation failed: ${JSON.stringify(validated.error.issues).slice(0, 300)}`,
      );
    }
    return validated.data;
  }

  async generateActivities(input: ActivityGenInput): Promise<ActivityBundle> {
    const { system, user } = activityGenerationPrompt(input);
    return await this.callAndParse(system, user, /* retry */ true);
  }

  // --- Responses API helpers ---

  // Strict Structured Outputs: returns an object guaranteed to match `schema`.
  private async respondJsonSchema<T = Record<string, unknown>>(
    system: string,
    user: string,
    name: string,
    schema: Record<string, unknown>,
  ): Promise<T> {
    const resp = await this.client.responses.create({
      model: this.model,
      // gpt-5 reasoning models: keep effort low — these are fixed-shape
      // extraction tasks, not problems that need deep reasoning, and the batch
      // worker must stay inside the Edge wall-clock.
      reasoning: { effort: 'low' },
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      text: { format: { type: 'json_schema', name, strict: true, schema } },
    });
    return JSON.parse(resp.output_text || '{}') as T;
  }

  // JSON-object mode + Zod validation, with one repair retry on bad JSON or a
  // schema mismatch.
  private async callAndParse(
    system: string,
    user: string,
    retry: boolean,
  ): Promise<ActivityBundle> {
    const resp = await this.client.responses.create({
      model: this.model,
      reasoning: { effort: 'low' },
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      text: { format: { type: 'json_object' } },
    });
    const raw = resp.output_text ?? '';
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      if (retry) {
        return this.callAndParse(
          system + '\n\nIMPORTANT: Previous response was not valid JSON. Return ONLY a JSON object.',
          user,
          false,
        );
      }
      throw new AIProviderError('activity gen: invalid JSON after retry', e);
    }
    const validated = ActivityBundleSchema.safeParse(json);
    if (!validated.success) {
      if (retry) {
        return this.callAndParse(
          system + `\n\nIMPORTANT: Previous response failed schema validation. Errors: ${JSON.stringify(validated.error.issues).slice(0, 1_500)}. Re-emit conforming JSON.`,
          user,
          false,
        );
      }
      throw new AIProviderError(
        `activity gen: schema validation failed: ${JSON.stringify(validated.error.issues).slice(0, 500)}`,
      );
    }
    return validated.data;
  }
}
