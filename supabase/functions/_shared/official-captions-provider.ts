// Official YouTube Data API captions, authorised by the channel owner's
// Google OAuth token. This is the highest-quality source: captions.download
// returns the owner's actual caption tracks — manually-written subtitles
// where they exist (punctuated, human quality), the official ASR track
// otherwise — and needs no bot-wall workarounds because access is sanctioned.
//
// Only works for videos the token's owner uploaded (captions.download is
// owner-gated), which is exactly our case: the provider is constructed
// per-teacher with that teacher's token and tried first in the chain.
//
// Quota note: captions.list = 50 units, captions.download = 200 units, from
// the default 10,000/day pool. A 20-video first sync ≈ 5,000 units. Request
// a quota bump before scale.
import type {
  TranscriptFetchOutcome,
  TranscriptProvider,
} from './transcript-types.ts';

const API = 'https://www.googleapis.com/youtube/v3';

interface CaptionTrack {
  id: string;
  snippet: {
    language: string;
    trackKind: string; // 'standard' | 'asr' | 'forced'
    isDraft: boolean;
  };
}

export class OfficialCaptionsProvider implements TranscriptProvider {
  readonly name = 'official-captions';

  constructor(private accessToken: string) {}

  async fetchTranscript(videoId: string): Promise<TranscriptFetchOutcome> {
    const headers = { Authorization: `Bearer ${this.accessToken}` };

    const listRes = await fetch(
      `${API}/captions?part=snippet&videoId=${encodeURIComponent(videoId)}`,
      { headers },
    );
    if (!listRes.ok) {
      const body = (await listRes.text()).slice(0, 150);
      return {
        result: null,
        diag: `official_list_status=${listRes.status} body=${body}`,
      };
    }
    const list = (await listRes.json()) as { items?: CaptionTrack[] };
    const tracks = (list.items ?? []).filter((t) => !t.snippet.isDraft);
    if (!tracks.length) {
      return { result: null, diag: 'official_no_tracks' };
    }

    // Manual tracks beat auto-generated (ASR) ones.
    const track =
      tracks.find((t) => t.snippet.trackKind !== 'asr') ?? tracks[0];

    const dlRes = await fetch(
      `${API}/captions/${encodeURIComponent(track.id)}?tfmt=srt`,
      { headers },
    );
    if (!dlRes.ok) {
      const body = (await dlRes.text()).slice(0, 150);
      return {
        result: null,
        diag: `official_download_status=${dlRes.status} body=${body}`,
      };
    }
    const text = srtToText(await dlRes.text());
    if (!text) {
      return { result: null, diag: 'official_empty_track' };
    }
    return {
      result: { text, source: 'captions', language: track.snippet.language },
      diag:
        `ok official kind=${track.snippet.trackKind} lang=${track.snippet.language} chars=${text.length}`,
    };
  }
}

// Strip SRT cue numbers/timestamps and collapse to plain text. ASR tracks
// often repeat the trailing line of one cue at the start of the next
// (rolling captions), so drop exact consecutive duplicates.
function srtToText(srt: string): string {
  const lines: string[] = [];
  for (const raw of srt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^\d+$/.test(line)) continue;
    if (line.includes('-->')) continue;
    if (lines[lines.length - 1] !== line) lines.push(line);
  }
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}
