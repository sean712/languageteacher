import type { User } from '@supabase/supabase-js';

// THE single source of truth for the free/premium boundary (ROADMAP
// Workstream I). Sean's rule (2026-07-19): flashcards are free for everyone
// (with TTS — pronunciation is the free tier's core value); everything else
// needs an account, and will need a subscription once Stripe lands.
//
// Every gate in the UI must call canUse — no scattered `if (user)` checks —
// so tightening "signed in" to "subscribed" is a change in this one function.
export type Feature =
  | 'flashcards'
  | 'quiz'
  | 'gap_fill'
  | 'matching'
  | 'quick_practice'
  | 'free_write'
  | 'ai_chat'
  | 'save'
  | 'follow'
  | 'notes'
  | 'progress';

export function canUse(feature: Feature, user: User | null | undefined): boolean {
  if (feature === 'flashcards') return true;
  // Interim wall: any account unlocks the rest. After ROADMAP C1 ships,
  // replace `Boolean(user)` with the subscription check (is_premium).
  return Boolean(user);
}
