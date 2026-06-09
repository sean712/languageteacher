// Provider-agnostic interface for AI calls.
// Add a new provider by implementing this and registering it in provider-factory.ts.
// All feature code must depend on this interface, never on a specific SDK.
import type { ActivityBundle } from './schemas.ts';

export interface DetectResult {
  language: string;
  level: string;
}

export interface ActivityGenInput {
  transcript: string;
  supplementary_text?: string;
  language?: string;
  level?: string;
  video_type: 'short' | 'long';
  title?: string;
}

export interface AIProvider {
  readonly name: string;
  detectLanguageAndLevel(text: string): Promise<DetectResult>;
  generateActivities(input: ActivityGenInput): Promise<ActivityBundle>;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly retriable = false,
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}
