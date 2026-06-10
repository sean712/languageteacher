// Minimal hand-written DB types for Phase 1. Replace with `supabase gen types`
// output once the CLI is set up locally.

export type VideoType = 'short' | 'long';
export type VideoStatus =
  | 'not_processed'
  | 'queued'
  | 'processing'
  | 'published'
  | 'needs_review'
  | 'failed';
export type TranscriptSource = 'captions' | 'whisper' | 'upload' | 'none';
export type ActivityType =
  | 'flashcards'
  | 'gap_fill'
  | 'quiz'
  | 'matching'
  | 'quick_practice';

export interface TeacherRow {
  id: string;
  user_id: string | null;
  display_name: string;
  slug: string;
  bio: string | null;
  avatar_url: string | null;
  youtube_channel_id: string | null;
  branding: Record<string, unknown>;
  uploads_playlist_id: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VideoRow {
  id: string;
  teacher_id: string;
  youtube_video_id: string;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  type: VideoType | null;
  duration_seconds: number | null;
  language: string | null;
  level: string | null;
  transcript: string | null;
  transcript_source: TranscriptSource;
  ai_confidence: number | null;
  needs_review_notes: Record<string, unknown> | null;
  status: VideoStatus;
  published_at: string | null;
  youtube_published_at: string | null;
  processing_started_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityRow {
  id: string;
  video_id: string;
  type: ActivityType;
  payload: Record<string, unknown>;
  status: VideoStatus;
  created_at: string;
}

type TableShape<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      teachers: TableShape<TeacherRow>;
      videos: TableShape<VideoRow>;
      activities: TableShape<ActivityRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
