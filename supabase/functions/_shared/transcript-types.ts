// Provider-agnostic interface for transcript acquisition, mirroring AIProvider.
//
// Why this seam exists: YouTube gates caption access by IP reputation
// (BotGuard / PO tokens). Requests from datacenter IPs — including Supabase
// Edge Functions — get "Sign in to confirm you're not a bot"; the same
// requests from residential IPs succeed. So where a transcript comes from is
// deployment-dependent: a hosted transcript service with its own residential
// egress (supadata), the Innertube API when running from a residential IP
// (the local runner in scripts/), Whisper on a worker, or a teacher upload.
// Feature code must depend on this interface, never on a specific source.

export interface TranscriptResult {
  text: string;
  source: 'captions' | 'whisper' | 'upload';
  language: string;
}

export interface TranscriptFetchOutcome {
  result: TranscriptResult | null;
  diag: string;
}

export interface TranscriptProvider {
  readonly name: string;
  fetchTranscript(videoId: string): Promise<TranscriptFetchOutcome>;
}
