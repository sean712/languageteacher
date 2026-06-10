// Claude implementation — stub for now. Mirrors OpenAIProvider so swapping
// AI_PROVIDER=anthropic in the environment is a one-line config change.
// To complete: switch to claude-opus-4-7 or claude-sonnet-4-6, use the
// Messages API, and parse the first content block's text as JSON.
//
// import Anthropic from 'npm:@anthropic-ai/sdk@x.y.z';
import {
  AIProviderError,
  type AIProvider,
  type ActivityGenInput,
  type DetectResult,
  type SentenceFeedback,
  type SentenceFeedbackInput,
} from './ai-types.ts';
import type { ActivityBundle } from './schemas.ts';

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';

  constructor(_opts: { apiKey: string; model?: string }) {
    // intentionally empty until the SDK is wired up
  }

  detectLanguageAndLevel(_text: string): Promise<DetectResult> {
    throw new AIProviderError(
      'AnthropicProvider.detectLanguageAndLevel is not implemented yet. Set AI_PROVIDER=openai or implement this method.',
    );
  }

  generateActivities(_input: ActivityGenInput): Promise<ActivityBundle> {
    throw new AIProviderError(
      'AnthropicProvider.generateActivities is not implemented yet. Set AI_PROVIDER=openai or implement this method.',
    );
  }

  evaluateSentence(_input: SentenceFeedbackInput): Promise<SentenceFeedback> {
    throw new AIProviderError(
      'AnthropicProvider.evaluateSentence is not implemented yet. Set AI_PROVIDER=openai or implement this method.',
    );
  }
}
