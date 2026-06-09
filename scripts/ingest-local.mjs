// Local ingestion runner.
//
// YouTube refuses caption requests from datacenter IPs ("Sign in to confirm
// you're not a bot"), so the deployed ingest-channel function can only fetch
// transcripts itself when a hosted provider (SUPADATA_API_KEY) is configured.
// This script closes the gap for free: it triggers ingestion, fetches
// captions for any video the function couldn't transcribe — from THIS
// machine's residential IP, via YouTube's Innertube API — and re-invokes the
// function with the transcripts pushed in the request body.
//
// Usage: node scripts/ingest-local.mjs
// Requires Node 18+ (built-in fetch). No dependencies.
//
// The Innertube logic duplicates
// supabase/functions/_shared/innertube-transcript-provider.ts (Deno) — keep
// them in sync.

const INGEST_URL =
  process.env.INGEST_URL ??
  'https://nyekhfvkaujfrfulofmg.supabase.co/functions/v1/ingest-channel';

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

async function invokeIngest(payload) {
  const res = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`ingest-channel ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

console.log('Pass 1: triggering ingestion (server-side transcript fetch)...');
const pass1 = await invokeIngest({});
for (const v of pass1.processed) {
  console.log(`  ${v.id}  ${v.status}  ${v.diag ?? v.note ?? ''}`);
}

const stuck = pass1.processed.filter(
  (v) => v.status === 'needs_review' && (v.diag ?? '').startsWith('transcript_fetch'),
);
if (!stuck.length) {
  console.log('Nothing needs a locally-fetched transcript. Done.');
  process.exit(0);
}

console.log(`\nFetching ${stuck.length} transcript(s) locally via Innertube...`);
const transcripts = {};
for (const v of stuck) {
  const t = await fetchTranscript(v.id);
  if (t) {
    transcripts[v.id] = { text: t.text, language: t.language };
    console.log(`  ${v.id}  ok (${t.client}, lang=${t.language}, ${t.text.length} chars)`);
  } else {
    console.log(`  ${v.id}  FAILED — no captions reachable from this IP either`);
  }
}

if (!Object.keys(transcripts).length) {
  console.log('No transcripts fetched; nothing to push.');
  process.exit(1);
}

console.log('\nPass 2: re-invoking ingestion with pushed transcripts...');
const pass2 = await invokeIngest({ transcripts });
for (const v of pass2.processed) {
  console.log(`  ${v.id}  ${v.status}  ${v.diag ?? v.note ?? ''}`);
}
console.log(`\nDone. Public page: /${pass2.teacher_slug}`);
