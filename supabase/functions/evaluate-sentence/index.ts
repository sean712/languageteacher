// evaluate-sentence — give a learner warm AI feedback on a sentence they
// wrote using a target word/phrase. Called directly from the browser, so it
// handles CORS and keeps the AI key server-side (never shipped to the client).
//
// POST /functions/v1/evaluate-sentence
// body: { word, translation?, language, level?, sentence }
// → { rating: 'great'|'good'|'needs_work', feedback, correction? }
//
// NOTE (pre-launch): this is an unauthenticated AI endpoint. Before a public
// launch it needs rate-limiting / abuse protection (per-IP or a learner
// token); the SENTENCE length cap here is only a blunt first guard.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getAIProvider } from '../_shared/provider-factory.ts';
import { AIProviderError } from '../_shared/ai-types.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_SENTENCE = 600;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'POST only' }, 405);
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      word?: string;
      translation?: string;
      language?: string;
      level?: string;
      sentence?: string;
    };

    const word = (body.word ?? '').trim();
    const language = (body.language ?? '').trim();
    const sentence = (body.sentence ?? '').trim();

    if (!word || !language) {
      return json({ error: 'word and language are required' }, 400);
    }
    if (!sentence) {
      return json({ error: 'Write a sentence first.' }, 400);
    }
    if (sentence.length > MAX_SENTENCE) {
      return json({ error: 'That sentence is a bit long — keep it short.' }, 400);
    }

    const ai = getAIProvider();
    const feedback = await ai.evaluateSentence({
      word,
      translation: body.translation?.trim() || undefined,
      language,
      level: body.level?.trim() || undefined,
      sentence,
    });

    return json(feedback);
  } catch (err) {
    console.error('evaluate-sentence failed', err);
    const message = err instanceof AIProviderError
      ? 'The tutor could not respond just now — please try again.'
      : 'Something went wrong.';
    return json({ error: message }, 500);
  }
});
