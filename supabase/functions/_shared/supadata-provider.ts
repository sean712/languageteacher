// Hosted YouTube transcript service (https://supadata.ai). Runs from its own
// residential egress, so it works from Supabase Edge Functions where direct
// YouTube requests are bot-walled. Requires SUPADATA_API_KEY (free tier
// covers ~100 transcripts; paid is ~$0.001/transcript).
import type {
  TranscriptFetchOutcome,
  TranscriptProvider,
} from './transcript-types.ts';

export class SupadataTranscriptProvider implements TranscriptProvider {
  readonly name = 'supadata';

  constructor(private apiKey: string) {}

  async fetchTranscript(videoId: string): Promise<TranscriptFetchOutcome> {
    const url =
      `https://api.supadata.ai/v1/youtube/transcript?videoId=${encodeURIComponent(videoId)}&text=true`;
    const res = await fetch(url, { headers: { 'x-api-key': this.apiKey } });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 150);
      return { result: null, diag: `supadata_status=${res.status} body=${body}` };
    }
    const data = await res.json() as { content?: unknown; lang?: string };
    const text = typeof data.content === 'string'
      ? data.content.replace(/\s+/g, ' ').trim()
      : '';
    if (!text) {
      return { result: null, diag: 'supadata_empty_content' };
    }
    return {
      result: { text, source: 'captions', language: data.lang ?? 'unknown' },
      diag: `ok supadata lang=${data.lang ?? 'unknown'} chars=${text.length}`,
    };
  }
}
