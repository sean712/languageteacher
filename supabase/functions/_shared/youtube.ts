// Minimal YouTube Data API v3 client + caption-track scraper.
//
// Note on captions: the official `captions.download` endpoint requires OAuth
// as the channel owner — we don't have that in Phase 1. So we instead fetch
// the public watch page, extract `ytInitialPlayerResponse`, and download
// the caption track URL it exposes. This is the same mechanism community
// transcript libraries use; it works for any video that has public captions
// (auto-generated or uploaded). It will break if YouTube changes the page
// structure — when that happens, replace with a stable approach (OAuth
// captions.download, or a hosted transcript service).

const API_BASE = 'https://www.googleapis.com/youtube/v3';

export interface YouTubeVideoMeta {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  durationSeconds: number;
  publishedAt: string;
}

export interface CaptionFetchResult {
  text: string;
  source: 'captions';
  language: string;
}

export class YouTubeClient {
  constructor(private apiKey: string) {}

  async getUploadsPlaylistId(channelId: string): Promise<string> {
    const url = `${API_BASE}/channels?part=contentDetails&id=${channelId}&key=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`channels.list failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    const playlistId =
      data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!playlistId) {
      throw new Error(`No uploads playlist for channel ${channelId}`);
    }
    return playlistId;
  }

  async listRecentVideoIds(playlistId: string, max = 10): Promise<string[]> {
    const url = `${API_BASE}/playlistItems?part=contentDetails&playlistId=${playlistId}&maxResults=${max}&key=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`playlistItems.list failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return (data.items ?? []).map(
      (i: { contentDetails: { videoId: string } }) => i.contentDetails.videoId,
    );
  }

  async getVideoMeta(videoIds: string[]): Promise<YouTubeVideoMeta[]> {
    if (videoIds.length === 0) return [];
    const url = `${API_BASE}/videos?part=snippet,contentDetails&id=${videoIds.join(',')}&key=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`videos.list failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return (data.items ?? []).map((v: {
      id: string;
      snippet: {
        title: string;
        description: string;
        thumbnails: Record<string, { url: string }>;
        publishedAt: string;
      };
      contentDetails: { duration: string };
    }) => ({
      id: v.id,
      title: v.snippet.title,
      description: v.snippet.description,
      thumbnailUrl:
        v.snippet.thumbnails?.maxres?.url ??
        v.snippet.thumbnails?.high?.url ??
        v.snippet.thumbnails?.medium?.url ??
        v.snippet.thumbnails?.default?.url ??
        '',
      durationSeconds: parseIsoDuration(v.contentDetails.duration),
      publishedAt: v.snippet.publishedAt,
    }));
  }
}

export function parseIsoDuration(iso: string): number {
  // Handles PT#H#M#S
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const [, h, mi, s] = m;
  return (Number(h ?? 0) * 3600) + (Number(mi ?? 0) * 60) + Number(s ?? 0);
}

// ----- captions -----

export async function fetchCaptions(videoId: string): Promise<CaptionFetchResult | null> {
  const watch = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!watch.ok) return null;
  const html = await watch.text();

  const playerJson = extractPlayerResponse(html);
  if (!playerJson) return null;

  const tracks: Array<{ baseUrl: string; languageCode: string; kind?: string }> =
    playerJson?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (tracks.length === 0) return null;

  // Prefer non-auto-generated tracks; fall back to first available.
  const preferred = tracks.find((t) => !t.kind) ?? tracks[0];
  const trackUrl = preferred.baseUrl + '&fmt=json3';
  const trackRes = await fetch(trackUrl);
  if (!trackRes.ok) return null;
  const trackJson = await trackRes.json();
  const text = extractJson3Text(trackJson);
  if (!text.trim()) return null;
  return { text, source: 'captions', language: preferred.languageCode };
}

function extractPlayerResponse(html: string): Record<string, unknown> | null {
  const marker = 'var ytInitialPlayerResponse = ';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const start = idx + marker.length;
  // Walk the string accounting for braces/escapes until the JSON object closes.
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const raw = html.slice(start, i + 1);
        try { return JSON.parse(raw); } catch { return null; }
      }
    }
  }
  return null;
}

function extractJson3Text(json: {
  events?: Array<{ segs?: Array<{ utf8?: string }> }>;
}): string {
  const parts: string[] = [];
  for (const ev of json.events ?? []) {
    for (const seg of ev.segs ?? []) {
      if (seg.utf8) parts.push(seg.utf8);
    }
  }
  return parts.join('').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
}
