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

// A learner was asked to write their own sentence using a target word/phrase.
// The provider returns warm, brief feedback on what they wrote.
export interface SentenceFeedbackInput {
  word: string;
  translation?: string;
  language: string;
  level?: string;
  sentence: string;
}

export interface SentenceFeedback {
  rating: 'great' | 'good' | 'needs_work';
  feedback: string;
  // A corrected version of the learner's sentence, when a fix is warranted.
  correction?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// A learner chatting with an AI tutor about one specific lesson.
export interface LessonChatInput {
  language: string;
  title?: string;
  level?: string;
  transcript: string;
  messages: ChatMessage[];
}

export interface AIProvider {
  readonly name: string;
  detectLanguageAndLevel(text: string): Promise<DetectResult>;
  generateActivities(input: ActivityGenInput): Promise<ActivityBundle>;
  evaluateSentence(input: SentenceFeedbackInput): Promise<SentenceFeedback>;
  chatAboutLesson(input: LessonChatInput): Promise<string>;
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
