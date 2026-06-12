# HANDOVER — Lingua / Languageteacher

A snapshot of where this project is right now and what needs to happen next.
Written for a fresh Claude session picking up mid-build. Sean is the founder;
he writes detailed briefs and prefers execution over re-litigation.

The fundamental product brief is in README.md and in memory
(`project_overview.md`). What follows is current state, not goals.

## What's live

- **Supabase project** `languageteacher` (ref `nyekhfvkaujfrfulofmg`, eu-west-2)
- **Schema + RLS** applied (migrations: `phase1_schema`, `pin_trigger_search_path`).
  Security advisor: clean. Tables: `teachers`, `videos`, `content_uploads`,
  `activities`. `activities.payload` carries a `schema_version` (currently 1).
- **Catalogue + queue model (2026-06-10).** The whole channel (77 videos) is
  indexed in `videos`; the table itself is the processing queue. Statuses:
  `not_processed` (indexed, teacher hasn't opted in) → `queued` →
  `processing` → `published` / `needs_review` / `failed`. RLS exposes only
  `published` to the public. Current counts: 17 published, 8 needs_review
  (low AI confidence — correct behavior), 52 not_processed.
- **Edge Functions** (all `verify_jwt: false` except the deprecated stub):
  - `sync-channel` — walks the uploads playlist, inserts new videos as
    `not_processed`. Queue policy: first sync queues latest 20; later syncs
    queue every newly-discovered video (= new uploads auto-process).
  - `process-videos` — drains the queue, batch of ≤10 per invocation, via
    `claim_videos_for_processing()` (FOR UPDATE SKIP LOCKED; stale
    `processing` rows >10 min are reclaimable). Accepts pushed transcripts;
    `batch_size: 0` = push-only. Has CORS so the onboarding page can drive it.
  - `connect-channel` — creator onboarding. POST `{ channel, display_name? }`
    (channel = UC… id / URL / @handle / name); resolves via YouTube API,
    upserts a teacher (reuses by `youtube_channel_id`, unique slug), and
    indexes the catalogue via `syncCatalogue()`. Has CORS. ⚠️ UNAUTHENTICATED
    + creates teachers + triggers paid processing — gate behind creator auth
    before real creators (OAuth becomes an additional connect path later).
    `sync-channel` now also uses the shared `syncCatalogue()` for the demo.
  - `evaluate-sentence` — learner-facing AI tutor. POST `{ word, translation?,
    language, level?, sentence }` → `{ rating, feedback, correction? }`. Called
    from the browser via `supabase.functions.invoke` (has CORS). Goes through
    `AIProvider.evaluateSentence` (added to the seam), so the OpenAI key stays
    server-side. ⚠️ unauthenticated + per-call OpenAI cost — needs rate-limiting
    before any public launch (only a 600-char cap guards it now).
  - `ingest-channel` — DEPRECATED 410 stub (was v5); delete from dashboard.
- **Secrets set in Supabase dashboard**: `AI_PROVIDER=openai`, `OPENAI_API_KEY`,
  `YOUTUBE_API_KEY`. (Sean pasted his OpenAI key in chat early on — he was told
  to rotate it; assume he has or will.) **`SUPADATA_API_KEY` — Sean HAS a key;
  set it in Project Settings → Edge Functions → Secrets. Until it's set,
  server-side ingestion (connect-channel / process-videos) can't fetch
  transcripts from Edge and videos go to `needs_review` (diag shows only
  `innertube: …LOGIN_REQUIRED`, no `supadata:`). No redeploy needed once set.**
- **Frontend** — Vite + React 19 + TS + Tailwind v4 + react-router-dom v7.
  Build + typecheck green; dev server on port 5173. Editorial design
  ("paper/ink/emerald", Fraunces serif). The public teacher page is a flat
  newest-first feed with an All/Lessons/Shorts filter; each lesson opens an
  **activity picker** (flashcards, matching, gap-fill, quiz, quick-practice,
  plus **Make it personal**). Completion + saved sentences live in
  `localStorage` (`lingua:done:<videoId>`, `lingua:saved:<videoId>`).
  LAYOUT (2026-06-12): the teacher page is a **responsive lesson grid** (1/2/3
  cols, `max-w-5xl`); opening a lesson shows a **focused two-column view**
  (`LessonView`) with the YouTube video sticky beside the activities on desktop,
  stacked on mobile. Components: `LessonCard` (grid tile), `LessonView`
  (two-column), `LessonActivities` (the activity engine — picker/focused
  activity/completion, exports `parseActivities`/`useCompleted`). The old
  all-in-one `VideoCard` was removed; `ReviewVideo` uses `LessonView` too.
  NOTE (2026-06-11): **CEFR levels (A1/B1…) are no longer shown** anywhere
  public-facing — the field is still generated/stored but hidden (Sean found it
  unreliable + may expand beyond language learning). **Make it personal now
  also appears on Shorts** (synthesized from the quick_practice answer when
  there are no flashcards) so a Short isn't just one question.
  Channel-resolution gotcha: a free-text name or a channel ID copied from page
  source can match the WRONG channel (e.g. a creator's secondary/featured
  channel) — the connect form now steers users to the @handle/URL.
- **Creator auth (magic link, 2026-06-10).** Supabase Auth email magic-link.
  `src/lib/auth.tsx` (AuthProvider/useAuth), `/login` (`src/pages/Login.tsx`),
  `RequireAuth` gates `/connect`. Landing nav shows Log in / Get started when
  logged out. `connect-channel` is now **`verify_jwt=true`** — it reads the
  caller's user id from the JWT and stamps `teacher.user_id` on the channel
  they connect (unowned channels like the demo get claimed on first connect).
  Google sign-in is deferred (UI says "coming soon") and will be added as a
  second provider — it pairs with the future YouTube OAuth channel linking.
  **Supabase setup the owner must do:** Auth → URL Configuration → add
  `http://localhost:5173/**` (and the Vercel URL) to Redirect URLs; default
  magic-link email uses Supabase SMTP (rate-limited, may hit spam) — wire
  custom SMTP before launch.
- **Creator dashboard (2026-06-11).** `/dashboard` (`src/pages/Dashboard.tsx`)
  lists the signed-in creator's channels with status counts; `/dashboard/:slug`
  (`src/pages/ChannelManage.tsx`) is the management view — status tiles
  (published / need review / working / not started), a plain-English banner
  explaining why nothing's published, a per-video list with status badges +
  needs_review reasons, and actions: **Publish** (owner override of a
  needs_review), **Unpublish**, **Regenerate** (→ queued), and **Generate N
  more** from the not_started backlog. All client-side via RLS: owner-read
  already existed; added an `update` policy `teachers can update their own
  videos` (migration `owner_can_update_videos`; permits any column on own rows
  — dashboard only sets `status`; tighten later). `CreatorHeader` gives every
  signed-in page a consistent Dashboard / email / Log out bar; the public
  teacher page shows a "Manage channel →" link to the owner; login now lands on
  `/dashboard`.
- **AI model + API (2026-06-12).** All OpenAI calls go through `OpenAIProvider`
  on the **Responses API** (`client.responses.create`), model **`gpt-5-mini`**
  (override via `OPENAI_MODEL` secret). Detection + sentence feedback use strict
  `json_schema` Structured Outputs (no repair retry needed); activity generation
  uses `json_object` + Zod validation + one retry (its discriminated-union schema
  isn't worth dual-maintaining as strict JSON Schema). `reasoning.effort:'low'`
  on all calls. gpt-5-mini is a reasoning model → ~18s/video (vs ~2s on
  gpt-4o-mini); a batch of 5 ≈ 90s (fine, <400s Edge limit) but **watch
  throughput + cost on deep queues** since pg_cron fires process-videos every
  minute and overlaps are allowed (safe via SKIP LOCKED, but more concurrency).
  Quality is notably better (French upload test: 0.95 conf, 5 valid activities).
- **Teacher transcript + activity editing (2026-06-11).** On the review page a
  creator can **provide/replace the transcript** (stored `transcript_source=
  'upload'`, re-queued) — the worker treats an uploaded transcript as
  authoritative and never refetches it (`processVideoRow` in `pipeline.ts`;
  process-videos is at **v4**). A clean teacher transcript jumps confidence to
  ~0.9 and auto-publishes — this is the ToS-clean quality path and the answer
  to low-resource languages until OAuth/Whisper. They can also **Edit text** of
  any activity inline (`ActivityEditor`, all 5 types) via the
  `owner_can_update_activities` RLS policy. ALSO: supadata is hitting its plan
  **rate limit (429s)** during bulk processing — some needs_review videos are
  just failed transcript fetches (fix via upload, or raise the supadata plan).
- **Review a flagged video (2026-06-11).** `/dashboard/:slug/review/:videoId`
  (`src/pages/ReviewVideo.tsx`): previews the generated activities exactly as
  learners see them (reuses `VideoCard` with a new `defaultOpen` prop) and shows
  the **source transcript** (which makes a low-confidence reason obvious at a
  glance), then Publish / Unpublish / Regenerate. Reached via a "Review" button
  on needs_review/published rows in ChannelManage.
- **Public "coming soon" (2026-06-11).** The channel page shows in-pipeline
  videos (`queued`/`processing`/`needs_review`) as thumbnails with a "Lesson
  coming soon" badge, so a channel with nothing published yet still looks alive.
  Security: replaced an initial SECURITY DEFINER view (advisor ERROR) with
  **column-level grants** — `anon` can read only safe metadata columns of
  `videos` (never `transcript`, `needs_review_notes`, `ai_confidence`, …) for
  published + upcoming rows (migration `public_video_metadata_column_grants`).
  Because of this, anon queries must select explicit columns, NOT `*` (a `*`
  select 401s for anon now — see `TeacherPage` published query).
- **Channel management (2026-06-11).** ChannelManage has **Re-sync** (re-runs
  `connect-channel` for the teacher's `youtube_channel_id` to discover + queue
  new uploads) and **Remove channel** (owner-only delete, inline confirm; RLS
  `owner_can_delete_teacher`; FK cascades wipe videos/activities). Hardening
  TODO: `connect-channel` reuses an existing teacher by `youtube_channel_id`
  WITHOUT checking the caller owns it — a logged-in user could trigger a sync
  on someone else's channel (no data leak, but wasted processing). Add an
  ownership check before re-sync of an already-owned teacher.
- **Onboarding reveal (2026-06-12).** `/connect` is a two-part wizard: a form
  (channel + **category** picker + **target-audience** level) then a staged
  "magical" reveal — Finding (channel "Found" card) → Importing (real
  thumbnails cascade in) → Creating (live progress; thumbnails get an emerald
  ring/check as each lesson publishes, amber dot for needs_review), driven by
  real connect + polling the videos table. Category/audience save to
  `teachers.category` + `teachers.target_audience` (new columns, owner-write
  RLS) — collected now, **used later** for non-language activity types +
  audience-tuned generation (categories other than `language` are selectable
  but marked "more soon"; the pipeline still generates language-style
  activities for them today). Reveal keyframes (`animate-rise/pop/glow`) in
  index.css, reduced-motion safe.
- **Creator onboarding** lives at `/connect` (`src/pages/Connect.tsx`, behind
  `RequireAuth`): enter a channel → `connect-channel` indexes it → the page
  polls the public published count to show "N of M lessons ready" as **pg_cron
  builds them** (no browser-driven processing / no open endpoint). Landing CTAs
  point here.
- **Autonomous pipeline (pg_cron + pg_net, 2026-06-10).** Two cron jobs (in
  `cron.job`): `drain-processing-queue` (every minute → POSTs `process-videos`
  via `net.http_post`) and `sync-demo-channel` (every 6h → `sync-channel`).
  With `SUPADATA_API_KEY` set, the whole loop runs hands-off: connect/queue a
  video and it self-publishes within ~a minute. Verified end-to-end. SQL kept
  in `supabase/migrations/20260610_pg_cron_autonomous_pipeline.sql` for
  reference (migrations are applied via the Supabase MCP, not a tracked dir).
  Inspect runs: `select * from cron.job_run_details order by start_time desc`.
- **Make it personal (free-write)** is a frontend-only activity synthesized
  from a lesson's flashcard terms (`VideoCard.parseActivities`): the learner
  writes a sentence using a target word, gets AI feedback via
  `evaluate-sentence`, and can save sentences. Upgrade path: make it an
  AI-generated, pipeline-stored activity with bespoke prompts.

Visit `http://localhost:5173/demo-teacher` to see the public page rendering.

## The YouTube caption blocker — RESOLVED (2026-06-09), read before touching transcripts

Old state: every real video went to `needs_review` because the Edge Function
couldn't fetch captions. Diagnosis confirmed and extended:

- **YouTube's gating is IP-reputation-based (BotGuard / PO tokens).** From
  datacenter IPs — including Supabase Edge eu-west-2 — even correctly-formed
  Innertube requests return `LOGIN_REQUIRED: "Sign in to confirm you're not
  a bot"`. Proven with a throwaway `yt-test` function (now a 410 stub —
  delete it from the dashboard when convenient). Do NOT attempt more
  scraping from Edge; it cannot work without residential egress.
- **The old watch-page scrape is ALSO dead from residential IPs now**: the
  `ytInitialPlayerResponse` caption URLs return empty 200 bodies without a
  `pot` parameter. So "it works from Sean's machine" stopped being true.
- **What DOES work (from residential IPs only):** Innertube
  `/youtubei/v1/player` with properly-formed `IOS` or `ANDROID` mobile-app
  client contexts (correct clientVersion + matching User-Agent +
  `contentCheckOk`). The earlier session's Innertube attempts failed because
  the client contexts were malformed — `WEB` genuinely returns UNPLAYABLE,
  but IOS/ANDROID return `OK` plus caption tracks whose URLs serve content.

**Architecture now in place** (mirrors the `AIProvider` pattern):

- `_shared/transcript-types.ts` — `TranscriptProvider` interface (the seam)
- `_shared/innertube-transcript-provider.ts` — the working Innertube fetch;
  free, residential-IP-only, fails fast with a clear diag from Edge
- `_shared/supadata-provider.ts` — hosted service (supadata.ai), works from
  Edge; activates automatically when `SUPADATA_API_KEY` is set in Supabase
  secrets (NOT yet set — Sean needs to sign up if he wants serverless ingestion)
- `_shared/transcript-factory.ts` — ordered chain: supadata (if key) → innertube
- `process-videos` accepts pre-fetched transcripts in the POST body:
  `{ transcripts: { [videoId]: { text, language? } } }`
- `scripts/ingest-local.mjs` — **the current working path.** Run
  `node scripts/ingest-local.mjs` from any residential connection: it syncs
  the catalogue, drains the queue batch by batch, fetching transcripts
  locally via Innertube for whatever the server couldn't get and pushing
  them back. This is how all current published videos got there.

Caveat: the channel's videos only have **English auto-generated (ASR)**
caption tracks — no manual Welsh captions. The generation prompt already
compensates (conservative with low-resource languages, confidence scoring),
and detected language correctly comes out as Welsh, but transcript quality
is a known ceiling; Whisper or teacher-uploaded transcripts (Phase 2) lift it.

## Files to know about

- `README.md` — project overview + Phase 1 deploy steps
- `src/ai/` does not exist — AI code lives Edge-side, in
  `supabase/functions/_shared/`
- `supabase/functions/_shared/ai-types.ts` — `AIProvider` interface
  (the seam; do not bypass)
- `supabase/functions/_shared/openai-provider.ts` — working
- `supabase/functions/_shared/anthropic-provider.ts` — stub; throws on call
- `supabase/functions/_shared/schemas.ts` — Zod schemas for activity
  payloads (mirrored at `src/lib/activity-schemas.ts` for the browser)
- `supabase/functions/_shared/prompts.ts` — provider-agnostic prompt strings
- `supabase/functions/_shared/youtube.ts` — YouTube Data API client
  (metadata only; captions live behind `TranscriptProvider`)
- `supabase/functions/_shared/transcript-*.ts` + `innertube-transcript-provider.ts`
  + `supadata-provider.ts` — transcript acquisition (see blocker section above)
- `supabase/functions/_shared/pipeline.ts` — shared pipeline pieces
  (processVideoRow, demo-teacher upsert, hardcoded Phase 1 constants)
- `supabase/functions/sync-channel/index.ts` — catalogue indexer + queue policy
- `supabase/functions/process-videos/index.ts` — queue worker
- `scripts/ingest-local.mjs` — local ingestion runner (sync + drain +
  residential-IP transcript fetch/push)
- `src/pages/TeacherPage.tsx` — public mobile-first feed
- `src/components/FlashcardDeck.tsx` — swipeable + tap-to-flip deck
- `src/components/Quiz.tsx` — multiple-choice quiz
- `.env.local` — VITE_* vars, gitignored (Supabase URL + publishable key)

## How to redeploy the function

Sean does NOT have the Supabase CLI linked; I have been deploying via the
MCP tool `mcp__claude_ai_Supabase__deploy_edge_function`. The path convention
that works:

- `entrypoint_path: "index.ts"`
- file names: `"index.ts"` for the entrypoint, `"../_shared/<file>"` for the
  shared modules. All 12 files must be sent every deploy (the tool replaces
  the entire source).

Because the file array is large, I've been delegating the deploy call to a
general-purpose subagent to keep my own context clean.

## How to invoke the function

```bash
curl -X POST -H "Content-Type: application/json" -d '{}' \
  https://nyekhfvkaujfrfulofmg.supabase.co/functions/v1/ingest-channel
```

Response includes per-video `diag` strings — use them to debug.

## Open tasks (as of 2026-06-09, post-unblock)

1. **Set `SUPADATA_API_KEY`** (Sean has the key) in Supabase Edge Function
   secrets — the provider chain picks it up automatically, no redeploy. This
   is the one thing blocking the `/connect` flow from producing *published*
   lessons server-side (right now connected videos go to `needs_review`).
   Until then, `node scripts/ingest-local.mjs` is the working ingestion path.
1b. ~~Gate connect-channel behind auth~~, ~~pg_cron~~, ~~teacher dashboard~~ all
   DONE. Remaining: **Whisper transcription** (the big one — see content-quality
   note below), **Google sign-in**, the **transcript-correction loop** in the
   dashboard (let creators paste a correct transcript for a needs_review video),
   and a **sync-all-teachers** cron (current sync cron is demo-only, so connected
   channels other than the demo won't auto-discover new uploads yet).
1d. **Content quality / low-resource languages (learned 2026-06-11).** A real
   creator connected an Irish channel (`UCuEia7cE8Wm8yMCPMFT5CbA`): 0 published,
   all needs_review. Root cause — the videos only have **English ASR captions of
   spoken Irish** (garbled noise), so the AI output is unreliable and correctly
   scores <0.6 confidence. There's no Irish caption track to prefer. The fix is
   NOT lowering the threshold (would publish junk) — it's better transcripts:
   **Whisper with the target language** (transcribe the actual audio) and/or
   teacher-supplied transcripts. The auto-caption approach works well for
   high-resource languages (Spanish/French/etc., good captions) but is marginal
   for Irish/Welsh taught via immersion video. Also a cost note: every video
   costs ~2 OpenAI calls even when it lands in needs_review (hidden), so
   connecting low-caption channels spends money for nothing — worth a guard.
1c. Low-severity advisor left open: `pg_net` is installed in the `public`
   schema. Moving it (`alter extension pg_net set schema extensions`) risks
   breaking the `net.http_post` calls in the cron jobs — do it carefully and
   re-verify cron afterwards.
2. Delete the decommissioned `yt-test` and `ingest-channel` Edge Functions
   from the dashboard (both are 410 stubs).
3. ~~Render `gap_fill` and `matching`~~ DONE (2026-06-10). All five activity
   types now render. Expanding a lesson shows an **activity picker** (tiles);
   the learner chooses one, does it in a focused view, and is handed to the
   next. Completion is tracked per-device in `localStorage`
   (`lingua:done:<videoId>`) with checkmarks + an "N done" badge. New
   interactive components: `GapFill` (word-bank), `Matching` (tap-to-pair),
   `QuickPractice` (extracted). `FlashcardDeck`/`Quiz` gained `onComplete`.
4. The remaining 52 `not_processed` videos: teacher opt-in is the policy.
   To process more now, flip rows to `queued` in SQL and run the local
   runner (or just wait for the Phase 2 dashboard selection UI).
5. **Not yet done**, but were in the brief — defer to Phase 2 unless asked:
   - Teacher auth + dashboard
   - OAuth channel linking
   - Supplementary content upload
   - needs_review queue UI
   - pg_cron schedule for ingestion

## Vercel deploy (blank-page fix, 2026-06-11)

Symptom: Vercel showed a blank paper-coloured page. Cause: the `VITE_*` vars
are inlined at build time and weren't set on Vercel, so `supabase.ts` produced
an unconfigured client. Fixes shipped: `supabase.ts` no longer throws at import
(flags `isSupabaseConfigured`); `AppGate` renders a "Configuration needed"
screen + an ErrorBoundary instead of a blank page; `vercel.json` adds SPA
rewrites. **Sean still needs to**: set `VITE_SUPABASE_URL` +
`VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel env vars and redeploy, then add the
Vercel URL to Supabase Auth Redirect URLs + Site URL (see README). Values are
in local `.env.local`.

## Things Sean has said to remember

- **Mobile-first is non-negotiable**; desktop is secondary.
- **AI provider must stay swappable** — never bypass `AIProvider`.
- **He plans to deploy the frontend to Vercel** — secrets must stay in env
  vars, never in code.
- **Don't ask for API keys in chat.** Tell him to set them directly in
  Supabase / Vercel and confirm; placeholder is fine in code.
- He writes detailed briefs and wants execution + clear flags, not
  re-litigation of decided architecture.

## Git state

`git init` was run, no commit yet. ~30 files staged. Worth committing
before any new direction — pre-handover snapshot. Don't auto-commit;
ask Sean first.
