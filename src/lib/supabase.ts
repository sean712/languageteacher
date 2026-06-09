import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env.local',
  );
}

// Untyped client for now. Once `supabase gen types` is wired up in CI, swap to
// createClient<Database>(...) — the hand-written types in ./database.types.ts
// would otherwise drift from the actual schema.
export const supabase = createClient(url, key);
