// Local ingestion runner.
//
// YouTube refuses caption requests from datacenter IPs ("Sign in to confirm
// you're not a bot"), so the deployed worker can only fetch transcripts
// itself when a hosted provider (SUPADATA_API_KEY) is configured. This script
// closes the gap for free: it syncs the channel catalogue, drains the
// processing queue batch by batch, and for any video the server couldn't
// transcribe it fetches captions from THIS machine's residential IP (via
// YouTube's Innertube API) and pushes them to the worker.
//
// Usage: node scripts/ingest-local.mjs
// Requires Node 18+ (built-in fetch). No dependencies.
//
// The Innertube logic duplicates
// supabase/functions/_shared/innertube-transcript-provider.ts (Deno) — keep
// them in sync.

const FUNCTIONS_BASE =
  process.env.FUNCTIONS_BASE ??
  'https://nyekhfvkaujfrfulofmg.supabase.co/functions/v1';
const BATCH_SIZE = 5;
const MAX_ITERATIONS = 50;

const CLIENTS = [
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
      userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
      hl: 'en',
      timeZone: 'UTC',
      utcOffsetMinutes: 0,
    },
    userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
  },
];

async function fetchTranscript(videoId) {
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
      const pj = await res.json();
      if (pj?.playabilityStatus?.status !== 'OK') continue;
      const tracks =
        pj?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      if (!tracks.length) continue;
      const preferred = tracks.find((t) => !t.kind) ?? tracks[0];
      const trackRes = await fetch(preferred.baseUrl + '&fmt=json3', {
        headers: { 'User-Agent': client.userAgent },
      });
      const text = parseCaptionBody(await trackRes.text());
      if (text) {
        return { text, language: preferred.languageCode, client: client.name };
      }
    } catch {
      // try next client
    }
  }
  return null;
}

// Despite fmt=json3, some clients get json3 and others srv3 XML.
function parseCaptionBody(body) {
  const trimmed = body.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed);
      return normalize(
        (json.events ?? [])
          .flatMap((ev) => (ev.segs ?? []).map((s) => s.utf8 ?? ''))
          .join(''),
      );
    } catch {
      return '';
    }
  }
  if (trimmed.startsWith('<')) {
    const parts = [];
    for (const m of trimmed.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) {
      parts.push(m[1].replace(/<[^>]+>/g, ' '));
    }
    return normalize(decodeXmlEntities(parts.join(' ')));
  }
  return '';
}

function normalize(s) {
  return s.replace(/\s+/g, ' ').trim();
}

function decodeXmlEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

async function invoke(fn, payload) {
  const res = await fetch(`${FUNCTIONS_BASE}/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`${fn} ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function printResults(processed) {
  for (const v of processed) {
    console.log(`  ${v.id}  ${v.status}  ${v.diag ?? ''}`);
  }
}

console.log('Syncing channel catalogue...');
const sync = await invoke('sync-channel', {});
console.log(
  `  ${sync.channel_video_count} videos on channel, ${sync.new_videos} new, ` +
  `${sync.queued_now} queued now (queue depth ${sync.queue_depth}, first_sync=${sync.first_sync})`,
);

let totals = { published: 0, needs_review: 0, failed: 0 };
const tally = (processed) => {
  for (const v of processed) totals[v.status] = (totals[v.status] ?? 0) + 1;
};

for (let i = 1; i <= MAX_ITERATIONS; i++) {
  const res = await invoke('process-videos', { batch_size: BATCH_SIZE });
  if (!res.processed.length && res.remaining_queued === 0) break;

  console.log(`\nBatch ${i} (server-side):`);
  printResults(res.processed);

  // Anything the server couldn't transcribe: fetch locally and push back.
  const stuck = res.processed.filter(
    (v) => v.status === 'needs_review' && (v.diag ?? '').startsWith('transcript_fetch'),
  );
  const retried = new Set();
  if (stuck.length) {
    console.log(`  fetching ${stuck.length} transcript(s) locally via Innertube...`);
    const transcripts = {};
    for (const v of stuck) {
      const t = await fetchTranscript(v.id);
      if (t) {
        transcripts[v.id] = { text: t.text, language: t.language };
      } else {
        console.log(`  ${v.id}  no captions reachable from this IP either — stays needs_review`);
      }
    }
    if (Object.keys(transcripts).length) {
      const pushRes = await invoke('process-videos', { batch_size: 0, transcripts });
      printResults(pushRes.processed);
      tally(pushRes.processed);
      for (const v of pushRes.processed) retried.add(v.id);
    }
  }
  tally(res.processed.filter((v) => !retried.has(v.id)));

  if (res.remaining_queued === 0) break;
  console.log(`  ${res.remaining_queued} still queued...`);
}

console.log(
  `\nDone. published=${totals.published ?? 0} needs_review=${totals.needs_review ?? 0} failed=${totals.failed ?? 0}`,
);
