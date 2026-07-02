-- Google OAuth tokens for creators who link their channel via Google.
-- Holds the long-lived refresh token, so RLS is enabled with NO policies:
-- only the service role (Edge Functions) can read or write. The refresh
-- token must never be readable from the browser.
create table public.google_oauth_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  scopes text[] not null default '{}',
  google_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_oauth_tokens enable row level security;

-- Stamped when channel ownership is proven via Google OAuth
-- (channels.list mine=true returned this channel for the owner's token).
alter table public.teachers add column oauth_verified_at timestamptz;
