// Fetches captions via YouTube's Innertube `/youtubei/v1/player` API using
// mobile-app client contexts. As of 2026 this is the only request shape that
// still yields working caption URLs without a PO token: the watch-page
// `ytInitialPlayerResponse` route returns caption URLs that serve empty
// bodies, and the WEB Innertube client returns UNPLAYABLE.
//
// IMPORTANT: this works from residential IPs only. From datacenter IPs
// (including Supabase Edge Functions) YouTube returns LOGIN_REQUIRED
// ("Sign in to confirm you're not a bot") regardless of client context.
// In production the chain in transcript-factory.ts puts a hosted provider
// first; this provider is the zero-cost path for local runs and a fallback
// that fails fast with a clear diag.
//
// scripts/ingest-local.mjs duplicates this logic for Node — keep in sync.
import type {
  TranscriptFetchOutcome,
  TranscriptProvider,
} from './transcript-types.ts';

interface InnertubeClient {
  name: string;
  context: Record<string, unknown>;
  userAgent: string;
}

// Client versions go stale over months, not days; bump them if every client
// starts returning UNPLAYABLE from a residential IP.
const CLIENTS: InnertubeClient[] = [
  {
    name: 'IOS',
    context: {
      clientName: 'IOS',
      clientVersion: '20.10.4',
      deviceMake: 'Apple',
      deviceModel: 'iPhone16,2',
      osName: 'iPhone',
      osVersion: '18.3.2.22D82',
      hl: 'en',
      timeZone: 'UTC',
      utcOffsetMinutes: 0,
    },
    userAgent:
      'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
  },
  {
    name: 'ANDROID',
    context: {
      clientName: 'ANDROID',
      clientVersion: '20.10.38',
      androidSdkVersion: 30,
      userAgent:
        'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
      hl: 'en',
      timeZone: 'UTC',
      utcOffsetMinutes: 0,
    },
    userAgent:
      'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
  },
];

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
}

export class InnertubeTranscriptProvider implements TranscriptProvider {
  readonly name = 'innertube';

  async fetchTranscript(videoId: string): Promise<TranscriptFetchOutcome> {
    const diags: string[] = [];
    for (const client of CLIENTS) {
      try {
        const res = await fetch(
          'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': client.userAgent,
            },
            body: JSON.stringify({
              context: { client: client.context },
              videoId,
              contentCheckOk: true,
              racyCheckOk: true,
            }),
          },
        );
        const pj = await res.json() as {
          playabilityStatus?: { status?: string; reason?: string };
          captions?: {
            playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] };
          };
        };
        const playability = pj.playabilityStatus?.status ?? 'unknown';
        if (playability !== 'OK') {
          diags.push(
            `${client.name}=${playability}(${pj.playabilityStatus?.reason ?? ''})`,
          );
          continue;
        }
        const tracks =
          pj.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
        if (tracks.length === 0) {
          diags.push(`${client.name}=ok_no_tracks`);
          continue;
        }
        // Prefer manually-uploaded tracks over auto-generated (kind=asr).
        const preferred = tracks.find((t) => !t.kind) ?? tracks[0];
        const trackRes = await fetch(preferred.baseUrl + '&fmt=json3', {
          headers: { 'User-Agent': client.userAgent },
        });
        const body = await trackRes.text();
        const text = parseCaptionBody(body);
        if (!text) {
          diags.push(
            `${client.name}=empty_track status=${trackRes.status} len=${body.length}`,
          );
          continue;
        }
        return {
          result: { text, source: 'captions', language: preferred.languageCode },
          diag:
            `ok innertube/${client.name} lang=${preferred.languageCode}` +
            `${preferred.kind === 'asr' ? ' (auto-generated)' : ''} chars=${text.length}`,
        };
      } catch (err) {
        diags.push(`${client.name}=error(${String(err).slice(0, 80)})`);
      }
    }
    return { result: null, diag: `innertube_failed ${diags.join(' ')}` };
  }
}

// Despite fmt=json3, some clients get json3 ({"wireMagic":"pb3",...}) and
// others get srv3 XML (<timedtext format="3">) — handle both.
export function parseCaptionBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed) as {
        events?: Array<{ segs?: Array<{ utf8?: string }> }>;
      };
      return normalizeWhitespace(
        (json.events ?? [])
          .flatMap((ev) => (ev.segs ?? []).map((s) => s.utf8 ?? ''))
          .join(''),
      );
    } catch {
      return '';
    }
  }
  if (trimmed.startsWith('<')) {
    const parts: string[] = [];
    for (const m of trimmed.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) {
      parts.push(m[1].replace(/<[^>]+>/g, ' '));
    }
    return normalizeWhitespace(decodeXmlEntities(parts.join(' ')));
  }
  return '';
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
