# ROADMAP — Phase 3 build plan (drafted 2026-07-12)

This is the execution plan for the next agent. Read `HANDOVER.md` FIRST — it
describes everything already built (pipeline, auth, dashboard, learner side,
Google OAuth) and the architectural rules. This file describes what to build
next, in what order, and why.

Sean's brief (2026-07-12), condensed:

1. **Stripe with revenue sharing** — learners pay, creators get a cut.
2. **Improve AI outputs.**
3. **Agentic quality checking** — creators won't hunt for errors themselves;
   auto-QA generated content, and let creators/learners **flag an error** and
   have AI analyse + fix it (e.g. a spelling mistake).
4. **Travel/immersion content → language lessons.** Videos that don't teach a
   language (creator travelling) should still become language-learning
   material. Creators picking a 'language' page must **specify the target
   language** — which also helps the AI on normal teaching content (no more
   guessing from context).
5. **Creator + user account/subscription management** — use Stripe-hosted
   pages wherever possible, just link to them.
6. **Resend for email** to creators and users.
7. **Creator stats dashboard** — popular lessons, users, money earned, trends.

## How to work on this project (recap of the rules)

- Mobile-first, always. Desktop is secondary.
- Never bypass the `AIProvider` seam (`supabase/functions/_shared/ai-types.ts`).
  New AI capabilities = new methods on the interface, implemented in
  `openai-provider.ts` (Responses API, `gpt-5-mini`, `reasoning.effort:'low'`).
- Never ask Sean to paste API keys in chat. Tell him what secret to set where
  (Supabase Edge Function secrets / Vercel env vars) and use placeholders.
- Migrations are applied via the Supabase MCP (`apply_migration`); keep a copy
  in `supabase/migrations/` for reference. Edge Functions deploy via the MCP
  deploy tool — send ALL files every deploy (entrypoint `index.ts`, shared
  modules as `../_shared/<file>`); delegate the big deploy call to a subagent.
- `verify_jwt=true` is NOT an auth gate on its own (the anon key passes it) —
  every user-gated function must resolve and check `callerUserId` in-function,
  like `lesson-chat` does.
- Anon DB reads must select explicit columns (column-level grants on `videos`;
  `select *` 401s).
- Sean writes detailed briefs and wants execution + clear flags, not
  re-litigation of decided architecture.

## Recommended build order

Dependencies drive this order, not importance:

1. **Workstream A — target language + travel content** (small, unblocks real
   creators, improves every AI output immediately).
2. **Workstream F-part-1 — event tracking** (just the `lesson_events` table +
   client writes). Do this EARLY even though the dashboard comes later:
   trends need history, and revenue sharing (C) needs engagement data to
   split the pool. Every week without collection is a week of lost data.
3. **Workstream B — agentic QA + error flagging** (quality/trust; no external
   dependencies; makes the product sellable before you charge for it).
4. **Workstream C — Stripe** (billing + Connect rev share + hosted portals).
5. **Workstream D — account management** (thin once C exists; portal links).
6. **Workstream E — Resend** (cross-cutting; wire the seam early if convenient,
   but the sends themselves can land incrementally alongside B/C/F).
7. **Workstream F-part-2 — the stats dashboard UI** (needs A–C for revenue
   numbers and a few weeks of events for trends).

---

## Workstream A — Target language + travel/immersion content

### A1. Creator specifies the language they teach — SHIPPED 2026-07-16

Code complete and deployed: migration `teacher_target_language` applied,
`connect-channel` v5 + `process-videos` v7 live. Only the frontend deploy
(merge branch → main → Vercel) remains to expose the UI. See the "Target
language" section of HANDOVER.md.

Today the pipeline *detects* the language from the transcript
(`detectLanguageAndLevel` in `pipeline.ts` → `processVideoRow`). That fails
quietly on noisy transcripts (see the Irish-channel story in HANDOVER) and is
useless for travel content where the transcript may be mostly English.

- **Migration** `teacher_target_language`: add to `teachers`:
  - `target_language text` — BCP-47-ish name or code the creator picks
    (store the English language name, e.g. `Italian`; it goes straight into
    prompts).
  - `content_mode text not null default 'teaching'` —
    `'teaching' | 'immersion'` (immersion = travel/vlog content that doesn't
    explicitly teach).
  - Owner-write RLS already exists for teachers rows (reuse the pattern from
    `20260612_teacher_category_audience.sql`).
- **Connect wizard** (`src/pages/Connect.tsx`): when category = `language`,
  show a required **"Which language do you teach?"** select (searchable list of
  ~50 common languages + free-text fallback) and a **content-style** toggle:
  "My videos teach the language" vs "My videos are in/about the language
  (vlogs, travel, immersion)". Persist via `connect-channel` (add the fields to
  its POST body + upsert) and stash/restore through the Google round-trip via
  sessionStorage like category/audience already do.
- **ChannelManage settings**: let the owner edit `target_language` /
  `content_mode` after the fact (small settings card). Changing it should
  offer "Regenerate all" (re-queue published+needs_review) with a cost warning.
- **Pipeline** (`processVideoRow`): pass the teacher's `target_language` into
  `generateActivities` as `target_language` (new field on `ActivityGenInput`).
  When present, **skip language detection entirely** (saves one OpenAI call
  per video — real money at queue depth) and only run level detection, or fold
  level into the generation call. When absent (legacy teachers), keep the
  current detect path.
- **Prompts** (`prompts.ts`): `activityGenerationPrompt` gains:
  - `Target language (authoritative, chosen by the teacher): ${target_language}`
    — instruct the model that all terms/answers must be in this language and
    to IGNORE its own detection when they conflict.

### A2. Immersion/travel mode

Same pipeline, different prompt strategy. When `content_mode === 'immersion'`:

- The transcript is *content about an experience*, possibly mostly in English
  or mixed. The job flips from "extract what the teacher taught" to "**teach
  the target language THROUGH this content**": pull out places, foods,
  activities, situations from the transcript and generate the target-language
  vocabulary and phrases a learner would need in those situations (e.g. an
  Italy vlog → ordering at a trattoria, asking directions in Italian —
  grounded in what actually happens in the video, never generic filler).
- Implement as a second system-prompt branch in `activityGenerationPrompt`
  (keyed off a new `content_mode` field on `ActivityGenInput`), NOT a separate
  function — same schema, same Zod validation, same confidence gate. The
  flashcard `example` field should reference the video's moments so the lesson
  feels tied to the content ("Il conto, per favore — like Marco at 12:30 in
  the trattoria" style, without timestamps unless we have them).
- Confidence guidance for immersion mode: confidence reflects "did the video
  give enough situational material", not transcript fidelity.
- **Do not gate on detected language** in immersion mode — an English-language
  travel vlog teaching Italian is the whole point.

### A3. AI output quality improvements (Sean's item 2)

Cheap wins to fold into the same prompt-touching PR:

- Feed `teachers.category` + `target_audience` (collected since 2026-06-12,
  currently unused) into the generation prompt — audience-tuned difficulty
  and tone.
- Feed the video **description** into the prompt (already stored on `videos`;
  creators often put vocab lists there).
- Ask for **distractor quality** explicitly in quiz generation (plausible,
  same word-class, no giveaway lengths) and **accent/diacritic correctness**.
- Raise flashcard `example` coverage: require an example sentence for every
  item, in the target language with an English gloss.
- Consider `reasoning.effort:'medium'` for generation only (keep `low` for
  chat/feedback) — measure time per video first; pg_cron drains every minute
  and a batch of ≤10 must stay under the 400s Edge limit (~18s/video today).

**Acceptance:** connect a travel channel with target language set → published
lessons teach that language; a legacy teaching channel regenerates with
identical-or-better quality; language field on new lessons always equals the
teacher's choice.

---

## Workstream B — Agentic quality checking + error flagging

Two halves: proactive QA inside the pipeline, and reactive flag-and-fix.

### B1. Automated QA pass (pipeline)

After `generateActivities` succeeds in `processVideoRow`, run a **reviewer
call** before writing activities:

- New `AIProvider` method: `reviewActivities(input) → { issues: Issue[],
  corrected_activities?: ... , qa_score: number }` where each `Issue` is
  `{ activity_index, item_index?, kind: 'spelling'|'wrong_answer'|'bad_distractor'|'not_in_transcript'|'wrong_language'|'other',
  detail, fix_applied: boolean }`.
- The reviewer gets the transcript + the generated JSON and checks: spelling &
  diacritics in the target language, answer correctness (`correct_index`
  actually correct, gap-fill answers fit the blank, matching pairs match),
  terms actually grounded in the source, language consistency with
  `target_language`.
- **Auto-fix policy:** the reviewer returns a corrected bundle; trivial fixes
  (spelling, accents, casing) are applied silently. Structural doubts
  (wrong answer, fabricated term) lower `qa_score`; below a threshold the
  video goes to `needs_review` with the issues in `needs_review_notes` so the
  review page shows *specific* problems, not just "low confidence".
- Store the QA result on the video (`qa_score numeric`, `qa_issues jsonb`) so
  the dashboard can show "3 issues auto-fixed" — creators seeing the machine
  catch its own mistakes is the trust story Sean wants.
- Cost note: this adds ~1 OpenAI call per video. Fine at current volume; make
  it skippable via env (`QA_PASS=off`) for bulk backfills.

### B2. Error flagging (learners + creators) with AI resolution

- **Migration** `content_flags`:
  ```sql
  create table content_flags (
    id uuid primary key default gen_random_uuid(),
    video_id uuid not null references videos(id) on delete cascade,
    activity_id uuid references activities(id) on delete set null,
    item_path text,            -- e.g. 'items[3].term' when known
    reporter_user_id uuid references auth.users(id) on delete set null,
    reporter_role text not null default 'learner',  -- learner|creator
    description text not null, -- freeform: "I think 'grazzie' is misspelled"
    status text not null default 'open',
    -- open -> analysing -> auto_fixed | proposed | rejected | resolved
    ai_analysis jsonb,         -- verdict, located item, proposed fix, confidence
    resolved_at timestamptz,
    created_at timestamptz not null default now()
  );
  ```
  RLS: reporters insert (signed-in) + read their own; channel owner reads all
  flags on their videos + updates status. Decide whether anonymous learners
  can flag — recommend **signed-in only** for v1 (spam control, zero-cost
  decision to revisit).
- **UI (learner):** a small "Report a problem" affordance in the focused
  activity view (`LessonActivities`) — pre-fills which activity/item they're
  on, one textarea, submit. Confirmation: "Thanks — our AI editor will check
  this." Creator flags come from the same component on `ReviewVideo`.
- **Edge Function `resolve-flag`** (service role; triggered on insert via
  pg_cron sweep of `status='open'` — reuse the drain-queue pattern rather
  than pg_net triggers):
  1. Load the flag + the activity payload + the video transcript.
  2. New `AIProvider` method `analyseFlag(...)` → structured verdict:
     `{ valid: boolean, located: item_path, kind, proposed_fix: <patched payload fragment>, confidence, explanation }`.
  3. **Auto-apply** when `valid && confidence high && kind ∈ {spelling,
     diacritic, typo, translation_typo}`: patch `activities.payload`, set flag
     `auto_fixed`, thank the reporter (email via Workstream E later).
  4. Otherwise set `proposed` — the creator dashboard shows the flag with the
     AI's explanation and a one-click **Apply fix / Dismiss** (creator-side
     apply goes through the existing `owner_can_update_activities` RLS from
     the browser; no new privileged path needed).
  5. Invalid flags → `rejected` with the explanation kept (shown to reporter
     in their library, optional v1).
- **Creator dashboard:** a "Flags" section on `ChannelManage` — open/proposed
  counts per video, drill-in list with AI verdicts and apply/dismiss buttons.

**Acceptance:** flag a deliberately misspelled flashcard term → within a
minute the payload is fixed and the flag shows `auto_fixed`; flag a "wrong
answer" → creator sees a proposed fix with explanation and can apply it.

---

## Workstream C — Stripe: subscriptions + revenue sharing

### The model (recommended — confirm with Sean before building payouts)

**Learners buy ONE platform subscription** ("Lingua Premium") that unlocks the
AI features everywhere (free-write feedback, AI tutor chat — the boundary that
already exists in code). Creators are paid a **revenue share from a monthly
pool** proportional to the engagement their content generated (Spotify-style),
via **Stripe Connect Express** transfers.

Why this over per-creator subscriptions (Patreon-style): learners follow
multiple channels; per-channel paywalls fragment a small early catalogue and
make the free/premium boundary (which is per-*feature*, not per-channel)
incoherent. The pool model matches the code we have. Flag to Sean: per-creator
pricing can be layered on later as "channel supporter" tiers; don't build it
now. **The rev-share formula needs Sean's sign-off** — recommended default:
platform keeps 30%; 70% pool split by weighted engagement points per channel
(activity completions ×1, AI interactions ×3, from `lesson_events`,
premium users' events only).

### C1. Billing (learner side)

- Products: one product, monthly + annual prices. Sean creates these in the
  Stripe dashboard (test mode first); IDs go in Edge secrets
  (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`,
  `STRIPE_PRICE_ANNUAL`).
- **Migration** `billing`:
  ```sql
  create table customers (          -- auth user <-> stripe customer
    user_id uuid primary key references auth.users(id) on delete cascade,
    stripe_customer_id text unique not null
  );
  create table subscriptions (
    id text primary key,            -- stripe subscription id
    user_id uuid not null references auth.users(id) on delete cascade,
    status text not null,           -- mirror of stripe status
    price_id text,
    current_period_end timestamptz,
    cancel_at_period_end boolean default false,
    updated_at timestamptz not null default now()
  );
  ```
  RLS: owner-read only; ALL writes via service role (webhook). Add a
  `is_premium(uid)` SQL function (status in `('active','trialing')` and
  period end in the future) for reuse.
- **Edge Functions** (npm `stripe` works on Deno Edge; use the fetch http
  client: `Stripe(key, { httpClient: Stripe.createFetchHttpClient() })`):
  - `create-checkout-session` — caller-gated (in-function `callerUserId`);
    finds/creates the Stripe customer, returns a **Stripe Checkout** hosted
    URL (`mode: subscription`). Success/cancel URLs → `/account?upgraded=1` / back.
  - `create-portal-session` — caller-gated; returns a **Stripe Customer
    Portal** URL. This IS the subscription-management UI (cancel, card,
    invoices) — per Sean, link out, don't build.
  - `stripe-webhook` — `verify_jwt=false`, verifies the Stripe signature from
    the RAW body (read `req.text()` before parsing; use
    `stripe.webhooks.constructEventAsync` — the sync version breaks on Deno).
    Handles `checkout.session.completed`,
    `customer.subscription.created/updated/deleted` → upsert `subscriptions`.
    Configure the endpoint in the Stripe dashboard pointing at the function URL.
- **Enforcement:** `evaluate-sentence` and `lesson-chat` currently gate on
  "has an account". Add the premium check (query `subscriptions` with service
  role, or call `is_premium`). Grace path: keep a small free allowance
  (e.g. 5 AI calls/month per account) so the upgrade prompt has a taste —
  needs a tiny `ai_usage` counter table; simple `(user_id, month, count)`
  upsert in each function. Frontend: the AI tiles' "Account" tag becomes
  "Premium" for signed-in non-subscribers, linking to the upgrade page.
- **Upgrade UI:** minimal `/upgrade` page (price cards → checkout) + banner
  hooks in `LessonChat`/`FreeWrite` when the gate rejects.

### C2. Connect + revenue sharing (creator side)

- **Migration** `creator_payouts`: add `stripe_account_id text`,
  `payouts_enabled boolean default false` to `teachers`; new table
  `revenue_shares (id, teacher_id, period_start, period_end, engagement_points
  numeric, pool_cents int, share_cents int, stripe_transfer_id text, status)`.
- **Edge Functions:**
  - `create-connect-onboarding` — caller must own the teacher row; creates an
    **Express** account (`type: 'express'`) if none, returns an **Account
    Link** (hosted onboarding — again, link out, don't build KYC UI). A
    "Get paid" card on `/dashboard` shows onboarding state
    (`payouts_enabled` synced via the `account.updated` webhook event).
  - `compute-revenue-shares` — monthly (pg_cron, 1st of month): sum last
    month's subscription revenue (from Stripe invoices or a running total),
    take the pool %, split by engagement points from `lesson_events`
    (premium users only), write `revenue_shares` rows.
  - `pay-revenue-shares` — creates `stripe.transfers.create` per row for
    creators with `payouts_enabled`; idempotency key = revenue_shares.id.
    Keep compute and pay as separate steps so Sean can eyeball a month's
    split before money moves (v1: he triggers pay manually from a dashboard
    button or curl).
- Dashboard: "Earnings" card per channel — current-month accrued points,
  last payouts, onboarding CTA. Feeds Workstream F.

**Stripe dashboard tasks for Sean** (put in the PR description / tell him):
enable Connect (Express), create the product+prices, add the webhook endpoint
(+ signing secret to Edge secrets), set `STRIPE_SECRET_KEY`. Test mode first;
use Stripe test clocks for subscription lifecycle testing.

**Acceptance:** test-mode learner can subscribe via Checkout, `subscriptions`
row appears via webhook, AI features unlock, portal link works, cancelling in
the portal downgrades after period end; creator completes Express onboarding;
a manual `compute-revenue-shares` run produces a sane split.

---

## Workstream D — Creator and user account management

Mostly thin UI over things that exist after C:

- **`/account` page** (RequireAuth, both audiences): email + linked providers
  (Google badge if linked), subscription status + **"Manage subscription"** →
  `create-portal-session` (Stripe-hosted, per Sean's instruction), upgrade CTA
  when free, and **Delete account**.
- **Delete account:** Edge Function `delete-account` (caller-gated) — service
  role: cancel any active Stripe subscription immediately
  (`stripe.subscriptions.cancel`), then `auth.admin.deleteUser(uid)`; FKs
  cascade learner data (`saved_lessons`, `lesson_progress`, `notes`,
  `followed_channels`, `customers`). **Creator wrinkle:** if the user owns
  teachers rows, require them to delete/transfer channels first (the UI walks
  them to ChannelManage's existing Remove channel) — don't silently destroy a
  channel with published lessons.
- **Creator side:** the "Get paid" (Connect) card and channel settings
  (target language, category, audience — from A1) round out management.
  `CreatorHeader` gains an Account link.
- Email change / password: Supabase handles via `supabase.auth.updateUser`;
  magic-link users mostly won't need it — keep minimal.

**Acceptance:** a learner can see/cancel their sub without any custom billing
UI; deleting an account removes learner rows and cancels billing; a creator
can't orphan a channel accidentally.

---

## Workstream E — Resend email

- **Seam first, like AIProvider:** `_shared/email-types.ts`
  (`EmailProvider.send({to, subject, react/html/text, tags})`) +
  `_shared/resend-provider.ts` (plain `fetch` to
  `https://api.resend.com/emails`; no SDK needed on Deno) +
  `_shared/email-factory.ts` reading `RESEND_API_KEY` + `EMAIL_FROM`.
  No key → log-and-noop provider, so email never blocks a flow.
- **Supabase Auth SMTP:** point Supabase's auth emails (magic links!) at
  Resend SMTP (dashboard: Auth → SMTP; host `smtp.resend.com`). This fixes
  the known "magic-link email hits spam / rate limits" issue from HANDOVER —
  highest-value email task, zero code.
- **Sean's dashboard tasks:** verify the sending domain in Resend (DKIM/SPF
  records), create the API key, set `RESEND_API_KEY` + `EMAIL_FROM` secrets,
  configure Supabase SMTP.
- **v1 transactional sends** (wire where the events happen, all server-side):
  1. Creator: channel-connected welcome (after `connect-channel` succeeds).
  2. Creator: "your first lessons are live" (first time a video hits
     `published` for a teacher — check in `processVideoRow`).
  3. Creator: flag resolved / fix proposed (from `resolve-flag`, B2).
  4. Learner: flag outcome ("we fixed the issue you reported" — delight).
  5. Learner: subscription receipts come from Stripe — don't duplicate.
- **v2 (park until F):** weekly creator digest (stats summary) and
  new-lesson notifications to followers (needs an unsubscribe/preferences
  column — add `email_prefs jsonb` to a `profiles` table when digests land;
  transactional v1 sends don't need prefs).

---

## Workstream F — Events + creator stats dashboard

### F1. Event collection (do EARLY — see build order)

- **Migration** `lesson_events`:
  ```sql
  create table lesson_events (
    id bigint generated always as identity primary key,
    teacher_id uuid not null references teachers(id) on delete cascade,
    video_id uuid references videos(id) on delete cascade,
    user_id uuid,                    -- null = anonymous
    anon_id text,                    -- localStorage uuid for anon dedupe
    event text not null,             -- lesson_view | activity_start |
                                     -- activity_complete | lesson_complete |
                                     -- save | follow | ai_chat | ai_feedback
    activity_type text,
    created_at timestamptz not null default now()
  );
  ```
  RLS: **insert-only for anon+authenticated** (no select/update/delete;
  check `user_id = auth.uid() or user_id is null`); owner-read via a policy
  joining teachers, or better: owners read only the AGGREGATE views below,
  never raw events (privacy + perf). Service role for aggregation.
- **Client:** tiny `src/lib/track.ts` — fire-and-forget insert, batched/
  debounced, never throws into UI. Call sites: `TeacherPage` (lesson_view),
  `LessonActivities` (start/complete — completion logic already exists in
  `useCompleted`), Save/Follow buttons, `LessonChat`/`FreeWrite`. The AI
  events should ALSO be logged server-side in the two Edge Functions
  (authoritative for rev-share; client events are best-effort).
- Rev-share (C2) counts only the **server-logged AI events + authenticated
  completions** to keep the money math spam-resistant. Client/anon events are
  for trends only.
- Aggregation: nightly pg_cron →
  `channel_stats_daily (teacher_id, day, views, completions, ai_calls,
  active_users, new_followers)` (service-role upsert; owner-read RLS). Keeps
  dashboard queries instant and lets `lesson_events` be pruned later.

### F2. Dashboard UI

On `ChannelManage` (or a new `/dashboard/:slug/stats` tab):

- **Tiles:** views / active learners / completions / AI interactions —
  this month vs last (trend arrows).
- **Earnings:** current accrued engagement points + last `revenue_shares`
  rows + payout status (from C2).
- **Popular lessons:** top 10 by completions with per-lesson view→complete
  funnel.
- **Trend chart:** 30-day daily actives + completions. No chart library —
  inline SVG sparklines/bars fit the editorial paper/ink aesthetic and keep
  the bundle small (mobile-first!).
- Followers count comes straight from `followed_channels`.

**Acceptance:** after a day of real traffic the dashboard shows non-zero
tiles, the popular-lessons list matches reality, and the numbers the
rev-share job uses are visible to the creator (no black-box payouts).

---

---

# Phase 3b additions (Sean's brief, 2026-07-19)

Four more workstreams. IMPORTANT for whoever picks these up: Sean will soon
lose access to the strongest models, so these specs are deliberately
self-contained and step-by-step — exact files, copied working code, explicit
checklists. Follow them literally; don't redesign. If something is genuinely
impossible as written, say so and stop rather than improvising a different
architecture.

Summary of the brief:
1. **TTS pronunciation** — every taught word/phrase clickable → hear it.
   Amazon Polly (great for Welsh), Abair for Irish. Working implementation
   exists in Sean's `sean712/lexical2.0` repo — it is COPIED INLINE below, so
   you don't need that repo (re-add via `add_repo` only if something is
   unclear).
2. **Creator dashboard** (usage stats, revenue payouts) — this is existing
   Workstream F + C2. No change to those specs; build them as written.
3. **Boundary change: flashcards are free; everything else needs
   sign-up/subscription.** Supersedes the old "all static activities free"
   rule. Details in Workstream I below (and adjusts C1 enforcement).
4. **Admin dashboard** for Sean (platform owner): platform stats, top
   channels, revenue. Workstream H below.

## Workstream G — TTS pronunciation (Polly + Abair)

**Goal:** in every activity, tapping a target-language word or phrase (or a
small speaker icon next to it) plays its pronunciation. Amazon Polly for most
languages (Welsh = `Gwyneth`), Abair (free, no key) for Irish.

### G1. Edge Function `tts` (new)

Create `supabase/functions/tts/index.ts`. This is a port of Lexical 2.0's
`tts-polly` function, which is proven in production — copy this structure
exactly, with these adaptations for this codebase: (a) use the standard CORS
block and `json()` helper pattern from `evaluate-sentence/index.ts`; (b) the
request takes a **language NAME** (what `teachers.target_language` stores,
e.g. `'Welsh'`) and maps it to a code internally.

Request: `POST { text: string, language: string }` (language = English name).
Response: `{ audioData: <base64 mp3>, contentType: 'audio/mpeg', success: true }`
or `{ error, success: false }`.

Core logic (from Lexical 2.0, working):

```ts
// Map our stored language names -> TTS language codes.
const NAME_TO_CODE: Record<string, string> = {
  Welsh: 'cy', Irish: 'ga', French: 'fr', German: 'de', Spanish: 'es',
  Italian: 'it', Portuguese: 'pt', Dutch: 'nl', Danish: 'da', Finnish: 'fi',
  Icelandic: 'is', Norwegian: 'no', Polish: 'pl', Swedish: 'sv',
  Turkish: 'tr', Arabic: 'arb', 'Mandarin Chinese': 'cmn-CN',
  English: 'en-GB',
};

// Polly voice per code (Lexical's proven map — Welsh is Gwyneth).
const VOICE_MAP: Record<string, string> = {
  'cmn-CN': 'Zhiyu', arb: 'Zeina', cy: 'Gwyneth', da: 'Naja', nl: 'Lotte',
  fi: 'Suvi', fr: 'Celine', de: 'Marlene', is: 'Dora', it: 'Carla',
  no: 'Liv', pl: 'Ewa', 'pt-br': 'Camila', pt: 'Ines', es: 'Penelope',
  sv: 'Astrid', tr: 'Filiz', 'en-US': 'Matthew', 'en-GB': 'Amy',
};

// Polly LanguageCode parameter needs region-qualified codes.
const POLLY_LANG: Record<string, string> = {
  cy: 'cy-GB', da: 'da-DK', nl: 'nl-NL', fi: 'fi-FI', fr: 'fr-FR',
  de: 'de-DE', is: 'is-IS', it: 'it-IT', no: 'nb-NO', pl: 'pl-PL',
  'pt-br': 'pt-BR', pt: 'pt-PT', es: 'es-ES', sv: 'sv-SE', tr: 'tr-TR',
};
```

**Irish branch** (code === 'ga'): POST to `https://api.abair.ie/v3/synthesis`
— no API key needed:

```ts
const abairResponse = await fetch('https://api.abair.ie/v3/synthesis', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({
    synthinput: { text },
    voiceparams: {
      name: 'ga_CO_snc_piper',   // Connemara voice — Sean's choice, keep it
      languageCode: 'ga-IE',
      gender: 'UNSPECIFIED',
    },
    audioconfig: { audioEncoding: 'MP3', speakingRate: 1.0, pitch: 1.0 },
  }),
});
const abairData = await abairResponse.json();
// abairData.audioContent is the base64 mp3 — return it as audioData.
```

**Everything else** → Polly via the AWS SDK (works on Deno Edge):

```ts
const { PollyClient, SynthesizeSpeechCommand } =
  await import('npm:@aws-sdk/client-polly@3.425.0');
const pollyClient = new PollyClient({
  region: Deno.env.get('AWS_REGION') ?? 'eu-west-2',
  credentials: {
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
  },
});
const voiceId = VOICE_MAP[code] ?? 'Amy';
const neural = ['Matthew','Joanna','Amy','Emma','Brian','Ivy','Kevin',
  'Kimberly','Salli','Joey','Justin','Kendra','Ruth','Stephen','Aria',
  'Ayanda','Gabrielle','Liam'].includes(voiceId);
const resp = await pollyClient.send(new SynthesizeSpeechCommand({
  Text: text, VoiceId: voiceId, OutputFormat: 'mp3', TextType: 'text',
  Engine: neural ? 'neural' : 'standard',
  LanguageCode: POLLY_LANG[code] ?? code,
}));
const audioBytes = await resp.AudioStream!.transformToByteArray();
// base64-encode audioBytes (loop + btoa, as in Lexical) and return.
```

Guards: cap `text` at 300 chars (400 on violation); unknown language name →
`{ error: 'No voice available for <language>', success: false }` with 400 so
the UI can hide the speaker button gracefully next time.

Deploy with `verify_jwt=true` — the anon key passes that gate, which is what
we want: **anonymous users CAN use TTS** (flashcards are the free tier and
pronunciation is their core value; Abair is free and Polly is ~$4/1M chars).
Keep the 300-char cap as the only guard for now; add per-IP rate limiting
before heavy scale.

**Secrets Sean must set** (Supabase → Edge Functions → Secrets — tell him,
don't ask for values in chat): `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_REGION` (he already has these working in the Lexical 2.0 Supabase
project — same values work here; the IAM user needs only `polly:SynthesizeSpeech`).

### G2. Client audio player

Create `src/lib/audio-player.ts` — port Lexical 2.0's `src/lib/audioPlayer.ts`
**minus the auto-play queue** (that's a Lexical conversation feature we don't
need; deleting it removes ~half the file). Keep:

- The singleton `AudioPlayer` class: base64 → `Blob` → object URL →
  `HTMLAudioElement`, with `isPlaying`/`isLoading`/`error` state, a
  `subscribe(cb)` method, `stop()`, and object-URL cleanup on `ended`/`error`
  (`URL.revokeObjectURL` — keep this, it prevents memory leaks).
- `playTextToSpeech(text, language)`: call the `tts` function via
  `supabase.functions.invoke('tts', { body: { text, language } })` (use the
  existing client from `src/lib/supabase.ts` rather than raw fetch), then
  `audioPlayer.playFromBase64(data.audioData, data.contentType)`.
- In-memory cache: `Map<string, {audioData, contentType}>` keyed by
  `` `${language}:${text}` `` so repeat taps in a session don't re-hit Polly.
  (Lexical doesn't cache; add this — it's a few lines and halves cost.)

### G3. Speaker affordance in activities

New tiny component `src/components/SpeakButton.tsx`: a small speaker icon
button (🔊 or an inline SVG matching the paper/ink style), props
`{ text: string; language: string | null }`. Renders nothing when `language`
is null/unmappable. On click: `playTextToSpeech(text, language)`; show a
subtle spinner while loading (subscribe to the player state); `stopPropagation`
so it never triggers the parent card's tap/flip.

Wire it into every place a target-language string is shown. The lesson's
language comes from `videos.language` (already selected on the public page)
— pass it down through `LessonActivities` to each activity component:

- `FlashcardDeck` — on the term side of the card (the big win; do this first).
- `Matching` — on target-language tiles (the `left` side; skip English side).
- `GapFill` — on the completed sentence after a correct answer, and on the
  answer reveal.
- `Quiz` — next to the question when the question is in the target language;
  next to the correct option on the answer reveal.
- `QuickPractice` — next to the prompt/answer as appropriate.
- `LessonNotes`/`Notebook` and `FreeWrite` saved sentences — optional, later.

Mobile note (non-negotiable per Sean): tap targets ≥ 40px, and audio must be
triggered directly from the click handler (iOS Safari blocks `audio.play()`
outside a user gesture — the Lexical player already complies; don't move the
play call into an async callback detached from the gesture).

**Acceptance (G):** on a Welsh lesson, tapping the speaker on a flashcard term
plays Gwyneth saying it (first tap ≤ ~2s, repeat taps instant from cache); an
Irish lesson plays the Abair Connemara voice; an unmappable language shows no
speaker buttons; quiz/matching/gap-fill all have working speakers; nothing
breaks anonymously.

## Workstream H — Admin dashboard (platform owner)

**Goal:** Sean (only) sees platform-wide stats: totals, top channels, revenue.

### H1. Admin gate

Simplest safe pattern — do NOT invent RLS admin policies:

- New Edge Function `admin-stats`, `verify_jwt=true`, plus in-function check:
  resolve `callerUserId` (copy the helper from `connect-channel/index.ts`),
  then compare the caller's user id against the `ADMIN_USER_IDS` secret
  (comma-separated auth user ids). Not in the list → 403. Sean's auth user
  id (looked up 2026-07-19; he is the only auth user, email
  sean.ogrady712@gmail.com) is `7afa7716-080b-49a3-bc5e-90659e10b39d` —
  tell Sean to set `ADMIN_USER_IDS=7afa7716-080b-49a3-bc5e-90659e10b39d`
  in Supabase → Edge Functions → Secrets when this workstream is built.
  If in doubt, re-verify the id against his email in Supabase Dashboard →
  Authentication → Users.
- All queries inside run with the service-role client (cross-tenant reads
  never touch RLS).

### H2. What it returns (one POST, one JSON payload)

- **Totals:** teachers, published lessons, learners (auth users), active
  subscriptions + MRR (from `subscriptions`, once Workstream C lands — return
  zeros gracefully before that), lessons published in the last 30 days.
- **Top channels:** top 10 by engagement points from `lesson_events`
  (30-day window) with published-lesson counts and follower counts.
- **Revenue:** current-month pool estimate, last `revenue_shares` run
  (per-creator splits + status), total paid out to date. Zeros before C2.
- **Trend:** last 30 days of daily events from `channel_stats_daily`
  (Workstream F1); or computed directly from `lesson_events` if F1's rollup
  isn't built yet.
- **Pipeline health:** counts of videos by status across all teachers, plus
  count of `failed` in the last 7 days — Sean's early-warning signal.

### H3. `/admin` page

`src/pages/Admin.tsx`, route `/admin` behind `RequireAuth`. On load call
`admin-stats`; on 403 render the same "not found" treatment ChannelManage
uses (don't advertise the route exists). UI: stat tiles (reuse the `Tile`
pattern from `ChannelManage.tsx`), a top-channels table, a revenue card, and
an inline-SVG 30-day sparkline (same no-chart-library rule as Workstream F).
No link to `/admin` from anywhere public — Sean just knows the URL.

**Acceptance (H):** Sean's account sees numbers that match reality; any other
account (and anonymous) gets a 403/not-found; page renders sanely with
Stripe not yet built (zeros, not crashes).

## Workstream I — New free/premium boundary (flashcards free)

**Sean's rule (2026-07-19), supersedes the old "static = free" boundary:**

- **Anonymous / free:** browse channel pages, watch videos, do **flashcards**
  (with TTS), see the other activity tiles (locked).
- **Everything else** — quiz, gap-fill, matching, quick-practice, free-write,
  AI chat, save/follow/progress/notes — **requires sign-up + subscription**
  (Workstream C's "Lingua Premium"). Until Stripe ships, gate on
  "signed in" as the interim wall, then tighten to "subscribed" when C1's
  `is_premium` lands — build the check as one function so the tightening is
  a one-line change.

### Implementation

- `src/lib/access.ts` — single source of truth:
  ```ts
  export type Feature = 'flashcards' | 'quiz' | 'gap_fill' | 'matching'
    | 'quick_practice' | 'free_write' | 'ai_chat' | 'save' | 'follow'
    | 'notes' | 'progress';
  // Interim: signed-in unlocks everything; flashcards always free.
  // After C1: replace `!!user` with the subscription check.
  export function canUse(feature: Feature, user: User | null): boolean {
    if (feature === 'flashcards') return true;
    return !!user;
  }
  ```
  EVERY gate in the UI calls `canUse` — no scattered `if (user)` checks.
- `LessonActivities` picker: locked tiles render with a small lock badge and
  a one-line upsell ("Free with an account" → later "Premium"); tapping goes
  to `/login` (later `/upgrade`) and returns to the lesson after auth (reuse
  the existing redirect-back pattern from Save/Follow).
- Shorts: `quick_practice` is the only activity on a Short and it's now
  gated — acceptable (flashcard-less Shorts become teaser content; the
  synthesized "Make it personal" is already account-gated).
- Server side: AI functions are already account-gated in-function; when C1
  lands they check `is_premium` too (spec'd in C1). The static activities'
  data is public (`activities` rows are readable) — the gate is UX-level for
  now; move quiz/gap-fill/matching payloads behind an authenticated endpoint
  only if freeloading via devtools actually becomes a problem (don't build
  that pre-launch).
- Update HANDOVER's "Free vs premium boundary" section to point here when
  this ships.

**Acceptance (I):** anonymous user can complete flashcards with TTS but sees
locks on all other tiles; tapping a locked tile round-trips through login and
lands back in the lesson with the tile unlocked; signed-in (interim) users can
do everything; nothing regresses for creators.

## Updated build order (Phase 3b)

TTS is Sean's most concrete immediate want and is independent of everything
else → do G first. Then I (small, mostly frontend). F1 (events) stays early
because H and C2 both feed on it. So: **G → I → F1 → B → C → D/F2 → H → E**,
with A2 (immersion mode) slotted whenever a travel-content creator actually
shows up.

## Decisions to confirm with Sean (defaults chosen; don't block on these)

1. **Rev-share model**: platform pool split by engagement (default, ready to
   build) vs per-creator subscriptions. Formula %: default 70/30 creator/platform.
2. ~~Free AI allowance before the premium wall~~ SUPERSEDED by Workstream I
   (2026-07-19): flashcards are the free tier; everything else is behind
   sign-up/subscription, so no free AI allowance. (The `ai_usage` counter
   from C1 is still worth building — as abuse protection, not a free tier.)
3. **Anonymous error-flagging**: default no (account required).
4. **Pricing**: he sets amounts in Stripe; code reads price IDs from secrets.

## Known debt to keep in view (from HANDOVER — don't lose these)

- `SUPADATA_API_KEY` still needs setting (or the plan's official-captions path
  via Google OAuth covers linked creators).
- Google OAuth needs Sean's Google Cloud + Supabase dashboard config; YouTube
  scopes need Google app verification before public launch — start early.
- `evaluate-sentence` rate limiting (the `ai_usage` counter in C1 solves this).
- Whisper transcription for low-resource languages (parked; teacher upload +
  official captions are the current answers).
- Delete decommissioned `yt-test` / `ingest-channel` stubs from the dashboard.
- Custom SMTP before launch — solved by Workstream E.
