// tts — pronunciation audio for taught words/phrases (ROADMAP Workstream G).
//
// POST /functions/v1/tts
// body: { text: string, language: string }
//   language = whatever videos.language / teachers.target_language holds:
//   an English name ('Welsh'), an ISO code ('cy'), or a native name
//   ('Cymraeg') — the normaliser below handles all three.
// → { audioData: <base64 mp3>, contentType: 'audio/mpeg', voiceId, success: true }
//   or { error, success: false } (400 when no voice exists for the language,
//   so the UI can hide the speaker affordance).
//
// Ported from Sean's lexical2.0 `tts-polly` function (proven in production):
// Irish goes to Abair (free, keyless, Connemara voice); everything else goes
// to Amazon Polly (Welsh = Gwyneth). Secrets needed for Polly only:
// AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION — same values as the
// Lexical 2.0 Supabase project; the IAM user needs only polly:SynthesizeSpeech.
//
// Deployed verify_jwt=true, which the anon key passes — deliberate: TTS is
// available to anonymous learners (flashcards are the free tier and
// pronunciation is their core value). Abair is free and Polly ~$4/1M chars;
// the text cap is the only guard for now — add per-IP rate limiting before
// heavy scale.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const TEXT_CAP = 300;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Stored language value (lowercased) → TTS code. Mirrored client-side in
// src/lib/audio-player.ts (hasVoice) — keep the two in sync.
const NAME_TO_CODE: Record<string, string> = {
  welsh: 'cy', cymraeg: 'cy', cy: 'cy',
  irish: 'ga', gaeilge: 'ga', ga: 'ga',
  french: 'fr', 'français': 'fr', francais: 'fr', fr: 'fr',
  german: 'de', deutsch: 'de', de: 'de',
  spanish: 'es', 'español': 'es', espanol: 'es', es: 'es',
  italian: 'it', italiano: 'it', it: 'it',
  portuguese: 'pt', pt: 'pt',
  'brazilian portuguese': 'pt-br', 'portuguese (brazilian)': 'pt-br', 'pt-br': 'pt-br',
  dutch: 'nl', nl: 'nl',
  danish: 'da', da: 'da',
  finnish: 'fi', fi: 'fi',
  icelandic: 'is', is: 'is',
  norwegian: 'no', no: 'no', nb: 'no',
  polish: 'pl', pl: 'pl',
  swedish: 'sv', sv: 'sv',
  turkish: 'tr', tr: 'tr',
  arabic: 'arb', ar: 'arb', arb: 'arb',
  'mandarin chinese': 'cmn-CN', mandarin: 'cmn-CN', chinese: 'cmn-CN',
  'cmn-cn': 'cmn-CN', zh: 'cmn-CN',
  english: 'en-GB', 'en-gb': 'en-GB', 'en-us': 'en-US', en: 'en-GB',
};

// Polly voice per code — Lexical's proven map (Welsh = Gwyneth).
const VOICE_MAP: Record<string, string> = {
  'cmn-CN': 'Zhiyu', arb: 'Zeina', cy: 'Gwyneth', da: 'Naja', nl: 'Lotte',
  fi: 'Suvi', fr: 'Celine', de: 'Marlene', is: 'Dora', it: 'Carla',
  no: 'Liv', pl: 'Ewa', 'pt-br': 'Camila', pt: 'Ines', es: 'Penelope',
  sv: 'Astrid', tr: 'Filiz', 'en-US': 'Matthew', 'en-GB': 'Amy',
};

// Polly's LanguageCode parameter wants region-qualified codes.
const POLLY_LANG: Record<string, string> = {
  cy: 'cy-GB', da: 'da-DK', nl: 'nl-NL', fi: 'fi-FI', fr: 'fr-FR',
  de: 'de-DE', is: 'is-IS', it: 'it-IT', no: 'nb-NO', pl: 'pl-PL',
  'pt-br': 'pt-BR', pt: 'pt-PT', es: 'es-ES', sv: 'sv-SE', tr: 'tr-TR',
  'en-GB': 'en-GB', 'en-US': 'en-US', 'cmn-CN': 'cmn-CN', arb: 'arb',
};

const NEURAL_VOICES = new Set([
  'Matthew', 'Joanna', 'Amy', 'Emma', 'Brian', 'Ivy', 'Kevin', 'Kimberly',
  'Salli', 'Joey', 'Justin', 'Kendra', 'Ruth', 'Stephen', 'Aria', 'Ayanda',
  'Gabrielle', 'Liam',
]);

function toTtsCode(language: unknown): string | null {
  if (typeof language !== 'string') return null;
  return NAME_TO_CODE[language.trim().toLowerCase()] ?? null;
}

// btoa chokes on big arg lists; encode in chunks (clips are small, but safe).
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function synthesizeAbair(text: string) {
  const res = await fetch('https://api.abair.ie/v3/synthesis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      synthinput: { text },
      voiceparams: {
        name: 'ga_CO_snc_piper', // Connemara voice — Sean's choice, keep it
        languageCode: 'ga-IE',
        gender: 'UNSPECIFIED',
      },
      audioconfig: { audioEncoding: 'MP3', speakingRate: 1.0, pitch: 1.0 },
    }),
  });
  if (!res.ok) throw new Error(`Abair API error: ${res.status}`);
  const data = await res.json() as { audioContent?: string };
  if (!data?.audioContent) throw new Error('No audio data received from Abair');
  return { audioData: data.audioContent, voiceId: 'ga_CO_snc_piper' };
}

async function synthesizePolly(text: string, code: string) {
  const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials not configured (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY secrets)');
  }
  const { PollyClient, SynthesizeSpeechCommand } = await import(
    'npm:@aws-sdk/client-polly@3.425.0'
  );
  const client = new PollyClient({
    region: Deno.env.get('AWS_REGION') ?? 'eu-west-2',
    credentials: { accessKeyId, secretAccessKey },
  });
  const voiceId = VOICE_MAP[code] ?? 'Amy';
  const resp = await client.send(new SynthesizeSpeechCommand({
    Text: text,
    VoiceId: voiceId,
    OutputFormat: 'mp3',
    TextType: 'text',
    Engine: NEURAL_VOICES.has(voiceId) ? 'neural' : 'standard',
    LanguageCode: POLLY_LANG[code] ?? code,
  }));
  if (!resp.AudioStream) throw new Error('No audio stream received from Polly');
  const bytes = await resp.AudioStream.transformToByteArray();
  return { audioData: toBase64(bytes), voiceId };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only', success: false }, 405);

  try {
    const body = await req.json().catch(() => ({})) as {
      text?: string;
      language?: string;
    };
    const text = (body.text ?? '').trim();
    if (!text) return json({ error: 'No text provided', success: false }, 400);
    if (text.length > TEXT_CAP) {
      return json({ error: `Text too long (max ${TEXT_CAP} chars)`, success: false }, 400);
    }
    const code = toTtsCode(body.language);
    if (!code) {
      return json(
        { error: `No voice available for "${body.language ?? ''}"`, success: false },
        400,
      );
    }

    const { audioData, voiceId } = code === 'ga'
      ? await synthesizeAbair(text)
      : await synthesizePolly(text, code);

    return json({ audioData, contentType: 'audio/mpeg', voiceId, success: true });
  } catch (err) {
    console.error('tts failed', err);
    return json({ error: String(err).slice(0, 200), success: false }, 500);
  }
});
