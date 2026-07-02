// store-google-token — persist a creator's Google OAuth tokens server-side.
//
// POST /functions/v1/store-google-token
// body: { refresh_token: string, access_token?: string, scopes?: string[] }
// → { stored: true }
//
// Supabase's Google sign-in hands provider_token / provider_refresh_token to
// the BROWSER on the redirect back (and only then — they vanish on session
// refresh). The client immediately posts them here; we upsert into
// google_oauth_tokens, which has no client RLS policies, so this function is
// the only write path and nothing client-side can ever read a token back.
//
// Auth: verify_jwt=true at the gateway plus an in-function user check (the
// anon key passes verify_jwt — same pattern as lesson-chat).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.107.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function callerUser(
  req: Request,
): Promise<{ id: string; email?: string } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data } = await client.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email } : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const user = await callerUser(req);
    if (!user) return json({ error: 'Sign in first.' }, 401);

    const body = await req.json().catch(() => ({})) as {
      refresh_token?: string;
      access_token?: string;
      scopes?: string[];
    };
    const refreshToken = (body.refresh_token ?? '').trim();
    if (!refreshToken) return json({ error: 'refresh_token required' }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });
    const { error } = await supabase.from('google_oauth_tokens').upsert({
      user_id: user.id,
      refresh_token: refreshToken,
      // Access tokens live ~1h; treat the fresh one as good for 50 min and
      // let google-oauth.ts refresh from there.
      access_token: body.access_token ?? null,
      access_token_expires_at: body.access_token
        ? new Date(Date.now() + 50 * 60 * 1000).toISOString()
        : null,
      scopes: body.scopes ?? [],
      google_email: user.email ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;

    return json({ stored: true });
  } catch (err) {
    console.error('store-google-token failed', err);
    return json({ error: String(err).slice(0, 200) }, 500);
  }
});
