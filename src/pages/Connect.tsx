import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { signInWithGoogle, storeProviderTokens } from '../lib/google';
import CreatorHeader from '../components/CreatorHeader';
import LanguageInput from '../components/LanguageInput';

interface ConnectResult {
  teacher_slug: string;
  teacher_id: string;
  channel_title: string;
  channel_video_count: number;
  queued_now: number;
  queue_depth: number;
}

interface PreviewVideo {
  id: string;
  title: string | null;
  thumbnail_url: string | null;
  status: string;
}

type Phase = 'form' | 'reveal' | 'error';
type Stage = 'finding' | 'importing' | 'creating' | 'done';

const CATEGORIES = [
  { id: 'language', label: 'Language learning', icon: '🗣️', live: true },
  { id: 'music', label: 'Music', icon: '🎵' },
  { id: 'coding', label: 'Coding & tech', icon: '💻' },
  { id: 'cooking', label: 'Cooking', icon: '🍳' },
  { id: 'fitness', label: 'Fitness', icon: '🏋️' },
  { id: 'academic', label: 'Academic', icon: '📚' },
  { id: 'business', label: 'Business', icon: '💼' },
  { id: 'other', label: 'Something else', icon: '✨' },
] as const;

const AUDIENCES = [
  { id: 'beginners', label: 'Beginners' },
  { id: 'intermediate', label: 'Improvers' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'all', label: 'All levels' },
] as const;

const STAGES: { id: Stage; label: string }[] = [
  { id: 'finding', label: 'Finding' },
  { id: 'importing', label: 'Importing' },
  { id: 'creating', label: 'Creating' },
];

const POLL_MS = 4000;
const MAX_POLLS = 90; // ~6 minutes
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Form choices stashed across the Google OAuth round-trip (the redirect to
// Google unloads the page, so React state doesn't survive).
const GOOGLE_STASH_KEY = 'lingua:connect-google';

export default function Connect() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [params] = useSearchParams();
  const returningFromGoogle = params.get('via') === 'google';
  const googleRan = useRef(false);
  const [channel, setChannel] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [audience, setAudience] = useState<string | null>(null);
  const [targetLanguage, setTargetLanguage] = useState('');

  const [phase, setPhase] = useState<Phase>('form');
  const [stage, setStage] = useState<Stage>('finding');
  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<ConnectResult | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [videos, setVideos] = useState<PreviewVideo[]>([]);
  const cancelled = useRef(false);

  useEffect(() => () => { cancelled.current = true; }, []);

  const target = result?.queue_depth ?? 0;
  const ready = videos.filter((v) => v.status === 'published').length;

  const loadVideos = async (teacherId: string) => {
    const { data } = await supabase
      .from('videos')
      .select('id,title,thumbnail_url,status')
      .eq('teacher_id', teacherId)
      .in('status', ['queued', 'processing', 'published', 'needs_review', 'failed'])
      .order('youtube_published_at', { ascending: false, nullsFirst: false })
      .limit(24);
    return (data ?? []) as PreviewVideo[];
  };

  // Shared connect flow. `body` is either { channel, display_name? } (manual)
  // or { via: 'google', display_name? }. Category/audience come as arguments
  // because the Google return leg restores them from sessionStorage and can't
  // rely on state having flushed.
  const runConnect = async (
    body: Record<string, unknown>,
    cat: string | null,
    aud: string | null,
  ) => {
    cancelled.current = false;
    setError(null);
    setPhase('reveal');
    setStage('finding');

    // Stage 1 — find the channel (real resolve + index happens here).
    const { data, error: connErr } = await supabase.functions.invoke('connect-channel', {
      body,
    });
    if (cancelled.current) return;
    const res = data as (ConnectResult & { error?: string }) | null;
    if (connErr || !res || res.error) {
      setError(res?.error ?? 'We couldn’t find that channel. Try the @handle or full URL.');
      setPhase('error');
      return;
    }
    setResult(res);

    // Persist category + audience (owner update via RLS); fetch the avatar.
    if (cat && aud) {
      await supabase
        .from('teachers')
        .update({ category: cat, target_audience: { level: aud } })
        .eq('id', res.teacher_id);
    }
    const { data: t } = await supabase
      .from('teachers')
      .select('avatar_url')
      .eq('id', res.teacher_id)
      .maybeSingle();
    if (cancelled.current) return;
    setAvatar((t as { avatar_url: string | null } | null)?.avatar_url ?? null);

    // Let the "found" reveal land before moving on.
    await sleep(1600);
    if (cancelled.current) return;

    // Stage 2 — import: show the real thumbnails cascading in.
    setStage('importing');
    setVideos(await loadVideos(res.teacher_id));
    await sleep(2200);
    if (cancelled.current) return;

    // Stage 3 — create: poll as the cron worker publishes lessons.
    setStage('creating');
    if (res.queue_depth === 0) {
      setStage('done');
      return;
    }
    for (let i = 0; i < MAX_POLLS && !cancelled.current; i++) {
      await sleep(POLL_MS);
      if (cancelled.current) return;
      const vids = await loadVideos(res.teacher_id);
      setVideos(vids);
      const terminal = vids.filter((v) =>
        ['published', 'needs_review', 'failed'].includes(v.status),
      ).length;
      if (terminal >= res.queue_depth) break;
    }
    if (!cancelled.current) setStage('done');
  };

  // The language category requires the teaching language — it's what the AI
  // pins generation to (teachers.target_language), so connecting without it
  // would silently fall back to detection.
  const needsLanguage = category === 'language' && !targetLanguage.trim();

  const run = (e: React.FormEvent) => {
    e.preventDefault();
    if (!channel.trim() || !category || !audience || needsLanguage) return;
    void runConnect(
      {
        channel: channel.trim(),
        display_name: displayName.trim() || undefined,
        target_language: targetLanguage.trim() || undefined,
      },
      category,
      audience,
    );
  };

  // Google path, departure leg: stash the form choices (the redirect unloads
  // the page), then send the creator to Google's consent screen with YouTube
  // scopes. They come back to /connect?via=google.
  const linkWithGoogle = async () => {
    if (!category || !audience || needsLanguage) {
      setError(
        needsLanguage
          ? 'Tell us which language you teach first — then link with Google.'
          : 'Pick a category and audience first — then link with Google.',
      );
      setPhase('error');
      return;
    }
    sessionStorage.setItem(
      GOOGLE_STASH_KEY,
      JSON.stringify({
        category,
        audience,
        displayName: displayName.trim(),
        targetLanguage: targetLanguage.trim(),
      }),
    );
    const { error: err } = await signInWithGoogle('/connect?via=google', {
      youtube: true,
    });
    if (err) {
      setError(err.message);
      setPhase('error');
    }
  };

  // Google path, return leg: persist the provider tokens server-side, then
  // connect using them (the server finds the channel via mine=true — no
  // typing, and ownership is proven).
  useEffect(() => {
    if (!returningFromGoogle || googleRan.current || authLoading || !session) {
      return;
    }
    googleRan.current = true;
    const stash = JSON.parse(
      sessionStorage.getItem(GOOGLE_STASH_KEY) ?? '{}',
    ) as {
      category?: string;
      audience?: string;
      displayName?: string;
      targetLanguage?: string;
    };
    sessionStorage.removeItem(GOOGLE_STASH_KEY);
    if (stash.category) setCategory(stash.category);
    if (stash.audience) setAudience(stash.audience);
    if (stash.displayName) setDisplayName(stash.displayName);
    if (stash.targetLanguage) setTargetLanguage(stash.targetLanguage);
    void (async () => {
      await storeProviderTokens(session);
      await runConnect(
        {
          via: 'google',
          display_name: stash.displayName || undefined,
          target_language: stash.targetLanguage || undefined,
        },
        stash.category ?? null,
        stash.audience ?? null,
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when the session lands
  }, [returningFromGoogle, authLoading, session]);

  const goToPage = () => result && navigate(`/${result.teacher_slug}`);
  const goToDashboard = () => result && navigate(`/dashboard/${result.teacher_slug}`);

  return (
    <main className="min-h-dvh bg-paper-100 text-ink-900 overflow-x-clip">
      <CreatorHeader />
      <section className="max-w-2xl mx-auto px-5 sm:px-8 pt-8 sm:pt-12 pb-24">
        {phase === 'form' || phase === 'error' ? (
          <ConnectForm
            channel={channel}
            setChannel={setChannel}
            displayName={displayName}
            setDisplayName={setDisplayName}
            category={category}
            setCategory={setCategory}
            audience={audience}
            setAudience={setAudience}
            targetLanguage={targetLanguage}
            setTargetLanguage={setTargetLanguage}
            error={phase === 'error' ? error : null}
            onSubmit={run}
            onGoogle={linkWithGoogle}
          />
        ) : (
          <Reveal
            stage={stage}
            result={result}
            avatar={avatar}
            videos={videos}
            target={target}
            ready={ready}
            categoryLabel={CATEGORIES.find((c) => c.id === category)?.label ?? ''}
            onViewPage={goToPage}
            onDashboard={goToDashboard}
          />
        )}
      </section>
    </main>
  );
}

function ConnectForm({
  channel, setChannel, displayName, setDisplayName,
  category, setCategory, audience, setAudience,
  targetLanguage, setTargetLanguage, error, onSubmit, onGoogle,
}: {
  channel: string; setChannel: (v: string) => void;
  displayName: string; setDisplayName: (v: string) => void;
  category: string | null; setCategory: (v: string) => void;
  audience: string | null; setAudience: (v: string) => void;
  targetLanguage: string; setTargetLanguage: (v: string) => void;
  error: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onGoogle: () => void;
}) {
  const languageMissing = category === 'language' && !targetLanguage.trim();
  const choicesReady = Boolean(category && audience) && !languageMissing;
  const ready = channel.trim() && choicesReady;
  return (
    <form onSubmit={onSubmit} className="animate-rise">
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-600">
        Connect a channel
      </span>
      <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-3">
        Let’s bring your channel to life.
      </h1>
      <p className="text-ink-500 mt-3 leading-relaxed">
        Tell us a little about it, then watch Lingua turn your videos into
        interactive lessons — automatically.
      </p>

      <fieldset className="mt-8">
        <legend className="text-sm font-medium">What’s your channel about?</legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
          {CATEGORIES.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                category === c.id
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-paper-300 bg-paper-50 hover:border-ink-400'
              }`}
            >
              <span className="text-xl">{c.icon}</span>
              <span className="block text-sm font-medium mt-1 leading-tight">{c.label}</span>
              {!('live' in c) && (
                <span className="block text-[10px] text-ink-400 mt-0.5">More soon</span>
              )}
            </button>
          ))}
        </div>
        {category && category !== 'language' && (
          <p className="text-xs text-ink-500 mt-2">
            We’re starting with language learning — tailored lesson types for this
            category are coming soon, and we’ll set you up first.
          </p>
        )}
        {category === 'language' && (
          <label className="block mt-4 animate-rise">
            <span className="text-sm font-medium">Which language do you teach?</span>
            <LanguageInput value={targetLanguage} onChange={setTargetLanguage} />
            <span className="block text-xs text-ink-400 mt-1.5">
              Lessons are built in this language — even from videos where you
              mostly speak English.
            </span>
          </label>
        )}
      </fieldset>

      <fieldset className="mt-6">
        <legend className="text-sm font-medium">Who’s it for?</legend>
        <div className="flex flex-wrap gap-2 mt-2">
          {AUDIENCES.map((a) => (
            <button
              type="button"
              key={a.id}
              onClick={() => setAudience(a.id)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                audience === a.id
                  ? 'border-ink-900 bg-ink-900 text-paper-50'
                  : 'border-paper-300 bg-paper-50 text-ink-700 hover:border-ink-400'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block mt-6">
        <span className="text-sm font-medium">
          Display name <span className="text-ink-400 font-normal">(optional)</span>
        </span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Defaults to the channel name"
          className="mt-1.5 w-full rounded-xl border border-paper-300 bg-paper-50 px-4 py-3 text-[0.95rem] focus:outline-none focus:border-ink-400"
        />
      </label>

      {error && <p className="text-sm text-red-700 mt-5">{error}</p>}

      {/* Primary path: Google proves channel ownership and unlocks the
          creator's own caption tracks — the best transcripts we can get. */}
      <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
        <h2 className="font-medium">Link with Google</h2>
        <p className="text-sm text-ink-600 mt-1 leading-relaxed">
          Sign in with the Google account that owns your channel — we’ll find
          it automatically, verify it’s yours, and use your real caption
          tracks for the most accurate lessons.
        </p>
        <button
          type="button"
          onClick={onGoogle}
          disabled={!choicesReady}
          className="mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-emerald-600 text-paper-50 font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40"
        >
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
            <path fill="#fff" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" opacity=".9"/>
            <path fill="#fff" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48zM10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19zM24 9.5c3.54 0 6.7 1.22 9.19 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" opacity=".9"/>
          </svg>
          ✨ Connect my channel
        </button>
        {!choicesReady && (
          <p className="text-xs text-ink-400 mt-2">
            {languageMissing
              ? 'Tell us which language you teach above first.'
              : 'Choose a category and audience above first.'}
          </p>
        )}
      </div>

      <div className="mt-6 flex items-center gap-3 text-xs text-ink-400">
        <span className="h-px flex-1 bg-paper-300" />
        or add it manually
        <span className="h-px flex-1 bg-paper-300" />
      </div>

      <label className="block mt-5">
        <span className="text-sm font-medium">YouTube channel</span>
        <input
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          placeholder="@handle or youtube.com/@handle"
          autoCapitalize="off" autoCorrect="off" spellCheck={false}
          className="mt-1.5 w-full rounded-xl border border-paper-300 bg-paper-50 px-4 py-3 text-[0.95rem] focus:outline-none focus:border-ink-400"
        />
        <span className="block text-xs text-ink-400 mt-1.5">
          Use the channel’s @handle or URL — a name can match the wrong channel.
        </span>
      </label>

      <button
        type="submit"
        disabled={!ready}
        className="mt-5 w-full sm:w-auto inline-flex items-center justify-center px-7 py-3.5 rounded-xl border border-ink-900 text-ink-900 font-medium hover:bg-ink-900 hover:text-paper-50 transition-colors disabled:opacity-40"
      >
        Bring it to life
      </button>
      <p className="text-xs text-ink-400 mt-3">
        Testing tip: try{' '}
        <button
          type="button"
          onClick={() => setChannel('UCK8WMyvZ1sFlhxie5tlaIdQ')}
          className="text-emerald-600 underline underline-offset-2"
        >
          the Welsh demo channel
        </button>
        .
      </p>
    </form>
  );
}

function Reveal({
  stage, result, avatar, videos, target, ready, categoryLabel, onViewPage, onDashboard,
}: {
  stage: Stage;
  result: ConnectResult | null;
  avatar: string | null;
  videos: PreviewVideo[];
  target: number;
  ready: number;
  categoryLabel: string;
  onViewPage: () => void;
  onDashboard: () => void;
}) {
  const stageIndex = stage === 'done' ? 3 : STAGES.findIndex((s) => s.id === stage);

  return (
    <div>
      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STAGES.map((s, i) => {
          const done = i < stageIndex;
          const active = i === stageIndex;
          return (
            <div key={s.id} className="flex items-center gap-2 flex-1 last:flex-none">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-6 h-6 rounded-full grid place-items-center text-xs font-medium transition-colors ${
                    done
                      ? 'bg-emerald-500 text-paper-50'
                      : active
                      ? 'bg-ink-900 text-paper-50'
                      : 'bg-paper-200 text-ink-400'
                  }`}
                >
                  {done ? '✓' : i + 1}
                </span>
                <span className={`text-xs ${active || done ? 'text-ink-900' : 'text-ink-400'}`}>
                  {s.label}
                </span>
              </div>
              {i < STAGES.length - 1 && (
                <span className={`h-px flex-1 ${done ? 'bg-emerald-400' : 'bg-paper-300'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Finding */}
      {stage === 'finding' && !result && (
        <div className="mt-12 flex flex-col items-center text-center">
          <span className="w-12 h-12 rounded-full border-2 border-paper-300 border-t-emerald-600 animate-spin" />
          <h2 className="font-display text-2xl font-semibold mt-6">Finding your channel…</h2>
          <p className="text-ink-500 mt-1 text-sm">Searching YouTube and reading your library.</p>
        </div>
      )}

      {/* Found channel card — persists from 'finding' onward once resolved */}
      {result && (
        <div className="mt-8 rounded-2xl border border-paper-300/70 bg-paper-50 p-5 flex items-center gap-4 animate-rise">
          {avatar ? (
            <img src={avatar} alt="" className="w-16 h-16 rounded-full object-cover ring-1 ring-paper-300" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-emerald-50 ring-1 ring-emerald-100 grid place-items-center font-display text-2xl text-emerald-600">
              {result.channel_title[0]?.toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-emerald-600 text-sm">✓ Found</span>
            </div>
            <h2 className="font-display text-xl font-semibold truncate">{result.channel_title}</h2>
            <p className="text-sm text-ink-500">
              {result.channel_video_count} videos
              {categoryLabel ? ` · ${categoryLabel}` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Importing / Creating header */}
      {result && stage !== 'finding' && (
        <div className="mt-8">
          <h3 className="font-display text-xl font-medium">
            {stage === 'importing'
              ? 'Importing your library…'
              : stage === 'creating'
              ? 'Creating your lessons…'
              : '✨ Your space is live'}
          </h3>
          <p className="text-sm text-ink-500 mt-1">
            {stage === 'importing'
              ? `Pulling in ${result.channel_video_count} videos.`
              : stage === 'creating'
              ? `Turning the latest ${target} into interactive lessons. You can explore as they appear.`
              : `${ready} lesson${ready === 1 ? '' : 's'} ready${
                  ready < target ? `, ${target - ready} still cooking` : ''
                }. New uploads are added automatically.`}
          </p>

          {(stage === 'creating' || stage === 'done') && target > 0 && (
            <div className="mt-3">
              <div className="h-2 rounded-full bg-paper-200 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-700"
                  style={{ width: `${Math.round((ready / target) * 100)}%` }}
                />
              </div>
              <p className="text-sm text-ink-700 mt-2">{ready} of {target} lessons ready</p>
            </div>
          )}

          {/* Thumbnail grid */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 mt-5">
            {videos.map((v, i) => (
              <ThumbTile key={v.id} video={v} index={i} />
            ))}
          </div>

          {/* CTAs — available throughout creating, prominent when done */}
          <div className="mt-7 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={onViewPage}
              className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl bg-emerald-600 text-paper-50 font-medium hover:bg-emerald-700 transition-colors"
            >
              View your page →
            </button>
            <button
              type="button"
              onClick={onDashboard}
              className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl border border-paper-300 font-medium text-ink-700 hover:border-ink-400 transition-colors"
            >
              Go to dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ThumbTile({ video, index }: { video: PreviewVideo; index: number }) {
  const ready = video.status === 'published';
  const attention = video.status === 'needs_review' || video.status === 'failed';
  const working = !ready && !attention;
  return (
    <div
      className={`relative aspect-video rounded-lg overflow-hidden bg-paper-200 animate-rise ${
        ready ? 'ring-2 ring-emerald-500' : ''
      }`}
      style={{ animationDelay: `${Math.min(index * 60, 900)}ms` }}
    >
      {video.thumbnail_url && (
        <img
          src={video.thumbnail_url}
          alt=""
          className={`w-full h-full object-cover transition-opacity duration-500 ${
            working ? 'opacity-50' : 'opacity-100'
          }`}
        />
      )}
      {working && <div className="absolute inset-0 animate-pulse bg-ink-900/10" />}
      {ready && (
        <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-emerald-500 text-paper-50 grid place-items-center text-[11px] animate-pop">
          ✓
        </span>
      )}
      {attention && (
        <span className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-paper-50" />
      )}
    </div>
  );
}
