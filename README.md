# Lingua

A platform where language teachers who post on YouTube link their channel, and
the system auto-generates mobile-first learning activities (flashcards, quizzes,
gap-fill, matching, quick-practice) from their videos. Each teacher gets a
public page at `/<slug>`.

Working name: **lingua**. Project folder: `Languageteacher`.

## Phase 1 scope

- Supabase schema + RLS for teachers, videos, content uploads, activities
- Provider-agnostic AI abstraction (OpenAI implemented, Anthropic stubbed)
- YouTube → transcript → activity pipeline as a Supabase Edge Function
  (`ingest-channel`), running against one hardcoded channel
- Public mobile-first teacher page rendering flashcards + quiz

No teacher auth, no learner accounts, no payments yet.

## Stack

- Vite + React 19 + TypeScript + Tailwind CSS v4 (frontend)
- Supabase: Postgres + Auth + Edge Functions + Storage
- OpenAI (swappable via `AI_PROVIDER` env var)
- YouTube Data API v3 + public watch-page caption scrape

## Local setup

```bash
npm install
cp .env.example .env.local   # already created; fill in any blanks
npm run dev
```

Visit `http://localhost:5173/demo-teacher` to see the teacher feed once the
pipeline has run at least once.

## Running the ingest pipeline

The pipeline lives in `supabase/functions/ingest-channel/`. Deploy and run:

```bash
# 1. Install the Supabase CLI (https://supabase.com/docs/guides/local-development)
# 2. Link your project
supabase link --project-ref nyekhfvkaujfrfulofmg

# 3. Set the function secrets (one-time)
supabase secrets set \
  AI_PROVIDER=openai \
  OPENAI_API_KEY=sk-... \
  YOUTUBE_API_KEY=AIza...

# 4. Deploy (use --no-verify-jwt for Phase 1 so cron/curl can call it
#    without a user token; tighten in Phase 2 with a shared secret header)
supabase functions deploy ingest-channel --no-verify-jwt

# 5. Trigger it
curl -X POST \
  https://nyekhfvkaujfrfulofmg.supabase.co/functions/v1/ingest-channel \
  -H "Content-Type: application/json" -d '{}'
```

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by
the Edge runtime.)

The first run will create the `demo-teacher` row, then process up to 5 recent
videos from the hardcoded channel.

## Repo layout

```
src/
  lib/
    supabase.ts            browser Supabase client
    activity-schemas.ts    Zod schemas (mirror of Edge Function copy)
    database.types.ts      hand-written DB types
  components/
    FlashcardDeck.tsx      swipe + tap-to-flip deck
    Quiz.tsx               multiple-choice quiz
    VideoCard.tsx          expandable feed item
  pages/
    Home.tsx
    TeacherPage.tsx        public /:teacher_slug page
supabase/
  functions/
    _shared/
      ai-types.ts          AIProvider interface (the seam)
      prompts.ts           provider-agnostic prompt strings
      schemas.ts           Zod schemas (Deno-side mirror)
      openai-provider.ts   OpenAI implementation
      anthropic-provider.ts Claude stub
      provider-factory.ts  env-driven selection
      youtube.ts           YouTube API client + caption scraper
    ingest-channel/
      index.ts             the pipeline endpoint
```

## Known limitations / follow-ups

- **Whisper fallback for long videos** isn't wired up — long videos with no
  YouTube captions go straight to `needs_review`. Adding it requires audio
  extraction (yt-dlp + ffmpeg) which can't run inside an Edge Function;
  needs a separate worker (Render / Fly / Cloud Run) in Phase 2.
- **Shorts detection** uses duration ≤ 60s only. The brief mentioned vertical
  aspect ratio too, but that isn't in the YouTube Data API response — would
  need to scrape it from the watch page if false positives become a problem.
- **Caption scraping** relies on the structure of YouTube's watch page; if
  YouTube changes it, swap in OAuth-based `captions.download` or a hosted
  transcript service.
- **SEO**: Vite is CSR-only, so the public teacher pages won't index well in
  Google. If teacher discoverability becomes a goal, port just the public
  routes to Next.js or Astro.
- **YouTube polling vs push**: the Phase-2 cron polls every channel. YouTube
  offers a free PubSubHubbub push feed which is more efficient — worth
  switching when adding multi-channel support.
- **Cron**: not wired up. To run on a schedule, set up a pg_cron job inside
  Supabase that hits the Edge Function URL, or use a GitHub Action.
