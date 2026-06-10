// Minimal YouTube Data API v3 client (metadata only).
//
// Captions are NOT fetched here — transcript acquisition lives behind the
// TranscriptProvider interface (see transcript-types.ts / transcript-factory.ts)
// because YouTube bot-walls caption requests from datacenter IPs.

const API_BASE = 'https://www.googleapis.com/youtube/v3';

export interface YouTubeVideoMeta {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  durationSeconds: number;
  publishedAt: string;
}

export interface ResolvedChannel {
  channelId: string;
  uploadsPlaylistId: string;
  title: string;
  thumbnailUrl: string;
}

export class YouTubeClient {
  constructor(private apiKey: string) {}

  // Resolve a user-supplied channel reference — a channel ID (UC…), a channel
  // URL, an @handle, or a free-text name — to its canonical id, uploads
  // playlist, title and avatar.
  async resolveChannel(input: string): Promise<ResolvedChannel> {
    const raw = input.trim();
    let mode: 'id' | 'handle' | 'search' = 'search';
    let value = raw;

    const urlMatch = raw.match(
      /youtube\.com\/(?:channel\/(UC[\w-]{22})|(@[\w.-]+)|(?:c|user)\/([\w.-]+))/i,
    );
    if (urlMatch) {
      if (urlMatch[1]) { mode = 'id'; value = urlMatch[1]; }
      else if (urlMatch[2]) { mode = 'handle'; value = urlMatch[2]; }
      else if (urlMatch[3]) { mode = 'search'; value = urlMatch[3]; }
    } else if (/^UC[\w-]{22}$/.test(raw)) {
      mode = 'id';
    } else if (raw.startsWith('@')) {
      mode = 'handle';
    }

    let channelId: string | undefined;
    if (mode === 'id') {
      channelId = value;
    } else if (mode === 'handle') {
      const handle = value.startsWith('@') ? value : `@${value}`;
      const data = await this.get(
        `${API_BASE}/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${this.apiKey}`,
      );
      channelId = data.items?.[0]?.id;
      if (!channelId) throw new Error(`No channel for handle ${handle}`);
    } else {
      const data = await this.get(
        `${API_BASE}/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(value)}&key=${this.apiKey}`,
      );
      channelId = data.items?.[0]?.id?.channelId;
      if (!channelId) throw new Error(`No channel found for "${value}"`);
    }

    const data = await this.get(
      `${API_BASE}/channels?part=snippet,contentDetails&id=${channelId}&key=${this.apiKey}`,
    );
    const item = data.items?.[0];
    if (!item) throw new Error(`Channel ${channelId} not found`);
    const uploads = item.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) throw new Error(`No uploads playlist for ${channelId}`);
    return {
      channelId: channelId!,
      uploadsPlaylistId: uploads,
      title: item.snippet?.title ?? 'Channel',
      thumbnailUrl:
        item.snippet?.thumbnails?.high?.url ??
        item.snippet?.thumbnails?.medium?.url ??
        item.snippet?.thumbnails?.default?.url ??
        '',
    };
  }

  // deno-lint-ignore no-explicit-any
  private async get(url: string): Promise<any> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`YouTube API ${res.status}: ${await res.text()}`);
    }
    return await res.json();
  }

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

  // Walks the whole uploads playlist (50 ids per page, 1 quota unit each).
  // Cheap even for large channels; safetyCap guards against runaway paging.
  async listAllVideoIds(playlistId: string, safetyCap = 2000): Promise<string[]> {
    const ids: string[] = [];
    let pageToken = '';
    do {
      const url =
        `${API_BASE}/playlistItems?part=contentDetails&playlistId=${playlistId}` +
        `&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}&key=${this.apiKey}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`playlistItems.list failed: ${res.status} ${await res.text()}`);
      }
      const data = await res.json();
      for (const i of data.items ?? []) {
        ids.push((i as { contentDetails: { videoId: string } }).contentDetails.videoId);
      }
      pageToken = data.nextPageToken ?? '';
    } while (pageToken && ids.length < safetyCap);
    return ids;
  }

  async getVideoMeta(videoIds: string[]): Promise<YouTubeVideoMeta[]> {
    // videos.list accepts at most 50 ids per call.
    const out: YouTubeVideoMeta[] = [];
    for (let i = 0; i < videoIds.length; i += 50) {
      out.push(...await this.getVideoMetaChunk(videoIds.slice(i, i + 50)));
    }
    return out;
  }

  private async getVideoMetaChunk(videoIds: string[]): Promise<YouTubeVideoMeta[]> {
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
