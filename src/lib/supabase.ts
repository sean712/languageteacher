import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// These are inlined by Vite at BUILD time, so they must be present in the
// build environment (locally in .env.local; on Vercel as project env vars).
// If they're missing we DON'T throw at import — that would crash the whole
// bundle before React mounts and leave a blank page. Instead we flag it and
// the app root renders a clear configuration screen. The placeholder client
// below is never actually used in that case.
export const isSupabaseConfigured = Boolean(url && key);

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder-anon-key',
);
