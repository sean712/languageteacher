// Server-side Google OAuth token management for creators.
//
// The browser hands us a refresh token once (store-google-token, right after
// the Supabase Google sign-in redirect); from then on everything runs
// server-side against google_oauth_tokens, which has no client RLS policies.
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET must match the OAuth client
// configured for the Supabase Google provider — refresh tokens are bound to
// the client that issued them.
import type { createClient } from 'npm:@supabase/supabase-js@2.107.0';

type Supabase = ReturnType<typeof createClient>;

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
// Refresh a minute early so a token can't expire mid-request.
const EXPIRY_MARGIN_MS = 60_000;

export interface TokenRow {
  user_id: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
}

export class GoogleOAuthError extends Error {
  constructor(message: string, readonly revoked = false) {
    super(message);
    this.name = 'GoogleOAuthError';
  }
}

// Exchange a refresh token for a fresh access token.
export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new GoogleOAuthError(
      'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured',
    );
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // invalid_grant = the user revoked access (or the token was superseded).
    const revoked = data?.error === 'invalid_grant';
    throw new GoogleOAuthError(
      `token refresh failed (${res.status}): ${data?.error ?? 'unknown'}`,
      revoked,
    );
  }
  return {
    accessToken: data.access_token as string,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
  };
}

// Resolve a usable Google access token for an auth user, refreshing and
// persisting as needed. Returns null when the user never linked Google or
// has revoked access (revocation also clears the dead row so callers fall
// back to non-OAuth paths instead of erroring forever).
export async function getAccessTokenForUser(
  supabase: Supabase,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('google_oauth_tokens')
    .select('user_id,refresh_token,access_token,access_token_expires_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as TokenRow;

  if (
    row.access_token &&
    row.access_token_expires_at &&
    new Date(row.access_token_expires_at).getTime() - EXPIRY_MARGIN_MS >
      Date.now()
  ) {
    return row.access_token;
  }

  try {
    const { accessToken, expiresAt } = await refreshAccessToken(
      row.refresh_token,
    );
    await supabase
      .from('google_oauth_tokens')
      .update({
        access_token: accessToken,
        access_token_expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
    return accessToken;
  } catch (err) {
    if (err instanceof GoogleOAuthError && err.revoked) {
      console.warn(`google token revoked for user ${userId}; clearing row`);
      await supabase.from('google_oauth_tokens').delete().eq('user_id', userId);
      return null;
    }
    throw err;
  }
}

// Same, keyed off a teacher: resolves the owning user, then their token.
// Used by the processing pipeline, which only knows teacher_id.
export async function getAccessTokenForTeacher(
  supabase: Supabase,
  teacherId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('teachers')
    .select('user_id')
    .eq('id', teacherId)
    .maybeSingle();
  const userId = (data as { user_id: string | null } | null)?.user_id;
  if (!userId) return null;
  return getAccessTokenForUser(supabase, userId);
}
