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
    `batch_size: 0` = push-only.
  - `evaluate-sentence` — learner-facing AI tutor. POST `{ word, translation?,
    language, level?, sentence }` → `{ rating, feedback, correction? }`. Called
    from the browser via `supabase.functions.invoke` (has CORS). Goes through
    `AIProvider.evaluateSentence` (added to the seam), so the OpenAI key stays
    server-side. ⚠️ unauthenticated + per-call OpenAI cost — needs rate-limiting
    before any public launch (only a 600-char cap guards it now).
  - `ingest-channel` — DEPRECATED 410 stub (was v5); delete from dashboard.
- **Secrets set in Supabase dashboard**: `AI_PROVIDER=openai`, `OPENAI_API_KEY`,
  `YOUTUBE_API_KEY`. (Sean pasted his OpenAI key in chat early on — he was told
  to rotate it; assume he has or will.) `SUPADATA_API_KEY` NOT set yet.
- **Frontend** — Vite + React 19 + TS + Tailwind v4 + react-router-dom v7.
  Build + typecheck green; dev server on port 5173. Editorial design
  ("paper/ink/emerald", Fraunces serif). The public teacher page groups
  published videos into CEFR level sections with a sticky filter bar; each
  lesson opens an **activity picker** (flashcards, matching, gap-fill, quiz,
  quick-practice, plus **Make it personal**). Completion + saved sentences
  live in `localStorage` (`lingua:done:<videoId>`, `lingua:saved:<videoId>`).
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

1. **For serverless (cron-able) ingestion**: Sean signs up at supadata.ai and
   sets `SUPADATA_API_KEY` in Supabase Edge Function secrets — the provider
   chain picks it up automatically, no redeploy needed. Until then,
   `node scripts/ingest-local.mjs` is the ingestion path.
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
