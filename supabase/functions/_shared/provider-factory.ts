import type { AIProvider } from './ai-types.ts';
import { OpenAIProvider } from './openai-provider.ts';
import { AnthropicProvider } from './anthropic-provider.ts';

export function getAIProvider(): AIProvider {
  const name = (Deno.env.get('AI_PROVIDER') ?? 'openai').toLowerCase();
  switch (name) {
    case 'openai': {
      const key = Deno.env.get('OPENAI_API_KEY');
      if (!key) throw new Error('OPENAI_API_KEY is not set');
      return new OpenAIProvider({ apiKey: key });
    }
    case 'anthropic':
    case 'claude': {
      const key = Deno.env.get('ANTHROPIC_API_KEY');
      if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
      return new AnthropicProvider({ apiKey: key });
    }
    default:
      throw new Error(`Unknown AI_PROVIDER: ${name}`);
  }
}
