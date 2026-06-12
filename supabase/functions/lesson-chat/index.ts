// lesson-chat — a learner chats with an AI tutor about ONE lesson.
//
// POST /functions/v1/lesson-chat
// body: { video_id, messages: [{ role:'user'|'assistant', content }] }
// → { reply }
//
// Premium / account-gated: deployed with verify_jwt=true, so only a signed-in
// learner can call it (this is the paid-tier feature; Stripe enforcement comes
// later, the account gate is here now). The lesson transcript is fetched
// server-side by video_id (service role) — never trusted from the client.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.107.0';
import { getAIProvider } from '../_shared/provider-factory.ts';
import { AIProviderError, type ChatMessage } from '../_shared/ai-types.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_MESSAGES = 24;
const MAX_CONTENT = 1500;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// verify_jwt=true only proves a *valid* JWT (the anon key qualifies), so it
// can't distinguish anonymous from logged-in. Resolve the actual user here and
// reject anonymous callers — this is the premium/account gate.
async function callerUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data } = await client.auth.getUser();
  return data.user?.id ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const userId = await callerUserId(req);
    if (!userId) {
      return json({ error: 'Please sign in to chat with the AI tutor.' }, 401);
    }

    const body = await req.json().catch(() => ({})) as {
      video_id?: string;
      messages?: ChatMessage[];
    };
    const videoId = (body.video_id ?? '').trim();
    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (!videoId) return json({ error: 'video_id is required' }, 400);
    if (messages.length === 0) return json({ error: 'No message.' }, 400);
    if (messages.length > MAX_MESSAGES) {
      return json({ error: 'This conversation is getting long — start a fresh one.' }, 400);
    }
    // Sanitise the conversation.
    const clean: ChatMessage[] = messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CONTENT) }))
      .filter((m) => m.content.trim());
    if (clean.length === 0 || clean[clean.length - 1].role !== 'user') {
      return json({ error: 'Ask a question to continue.' }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });
    const { data: video } = await supabase
      .from('videos')
      .select('title,language,level,transcript,status')
      .eq('id', videoId)
      .maybeSingle();

    if (!video || !(video as { transcript?: string }).transcript) {
      return json({ error: 'This lesson has no transcript to chat about yet.' }, 404);
    }
    const v = video as {
      title: string | null;
      language: string | null;
      level: string | null;
      transcript: string;
    };

    const ai = getAIProvider();
    const reply = await ai.chatAboutLesson({
      language: v.language ?? 'the target language',
      title: v.title ?? undefined,
      level: v.level ?? undefined,
      transcript: v.transcript,
      messages: clean,
    });

    return json({ reply });
  } catch (err) {
    console.error('lesson-chat failed', err);
    const message = err instanceof AIProviderError
      ? 'The tutor could not respond just now — please try again.'
      : 'Something went wrong.';
    return json({ error: message }, 500);
  }
});
