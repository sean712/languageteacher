// Google sign-in helpers.
//
// Two flavours of the same Supabase Google OAuth flow:
//  - plain sign-in (learners): basic profile scopes, no consent friction.
//  - YouTube link (creators): adds YouTube scopes + offline access so Google
//    returns a refresh token. Supabase surfaces provider tokens to the
//    browser ONLY on the session created by the redirect — they vanish on
//    the next token refresh — so whoever sees them must post them to
//    store-google-token immediately (storeProviderTokens, called from
//    AuthProvider and again from the Connect return leg; the upsert is
//    idempotent).
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

// youtube.readonly: channels.list(mine=true) — channel discovery + ownership
// proof. youtube.force-ssl: captions.download (owner-only, best-quality
// transcripts).
export const YOUTUBE_SCOPES =
  'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl';

export function signInWithGoogle(
  next: string,
  opts?: { youtube?: boolean },
) {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}${next}`,
      ...(opts?.youtube
        ? {
            scopes: YOUTUBE_SCOPES,
            // offline + consent is what makes Google issue a refresh token.
            queryParams: { access_type: 'offline', prompt: 'consent' },
          }
        : {}),
    },
  });
}

// Persist the session's Google provider tokens server-side. Returns whether
// tokens were present and stored. Safe to call on any session — plain
// sign-ins carry no provider_refresh_token and are a no-op.
export async function storeProviderTokens(
  session: Session | null,
): Promise<boolean> {
  if (!session?.provider_refresh_token) return false;
  const { error } = await supabase.functions.invoke('store-google-token', {
    body: {
      refresh_token: session.provider_refresh_token,
      access_token: session.provider_token ?? undefined,
    },
  });
  if (error) {
    console.error('failed to store Google tokens', error);
    return false;
  }
  return true;
}
