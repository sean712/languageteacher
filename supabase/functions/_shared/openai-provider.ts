import OpenAI from 'npm:openai@6.42.0';
import { AIProviderError, type AIProvider, type ActivityGenInput, type DetectResult } from './ai-types.ts';
import { ActivityBundleSchema, type ActivityBundle } from './schemas.ts';
import { activityGenerationPrompt, detectLanguageAndLevelPrompt } from './prompts.ts';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private model: string;

  constructor(opts: { apiKey: string; model?: string }) {
    this.client = new OpenAI({ apiKey: opts.apiKey });
    this.model = opts.model ?? Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';
  }

  async detectLanguageAndLevel(text: string): Promise<DetectResult> {
    const { system, user } = detectLanguageAndLevelPrompt(text);
    const resp = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const raw = resp.choices[0]?.message?.content ?? '{}';
    try {
      const parsed = JSON.parse(raw);
      return {
        language: String(parsed.language ?? 'unknown'),
        level: String(parsed.level ?? 'A2'),
      };
    } catch (e) {
      throw new AIProviderError('detect: invalid JSON from OpenAI', e, true);
    }
  }

  async generateActivities(input: ActivityGenInput): Promise<ActivityBundle> {
    const { system, user } = activityGenerationPrompt(input);
    return await this.callAndParse(system, user, /* retry */ true);
  }

  private async callAndParse(
    system: string,
    user: string,
    retry: boolean,
  ): Promise<ActivityBundle> {
    const resp = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const raw = resp.choices[0]?.message?.content ?? '';
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
