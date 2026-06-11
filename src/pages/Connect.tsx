import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import CreatorHeader from '../components/CreatorHeader';

interface ConnectResult {
  teacher_slug: string;
  teacher_id: string;
  channel_title: string;
  channel_video_count: number;
  queued_now: number;
  queue_depth: number;
}

type Phase = 'form' | 'connecting' | 'processing' | 'done' | 'error';

const POLL_MS = 5000;
const MAX_POLLS = 48; // ~4 minutes

export default function Connect() {
  const navigate = useNavigate();
  const [channel, setChannel] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConnectResult | null>(null);
  const [built, setBuilt] = useState(0);
  const cancelled = useRef(false);

  const target = result?.queue_depth ?? 0;

  const publishedCount = async (teacherId: string) => {
    const { count } = await supabase
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', teacherId)
      .eq('status', 'published');
    return count ?? 0;
  };

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channel.trim()) return;
    cancelled.current = false;
    setPhase('connecting');
    setError(null);
    setBuilt(0);

    // 1. Resolve + create teacher + index catalogue (queues the latest videos).
    //    The user's JWT is attached automatically by supabase-js.
    const { data, error: connErr } = await supabase.functions.invoke(
      'connect-channel',
      { body: { channel: channel.trim(), display_name: displayName.trim() || undefined } },
    );
    const res = data as (ConnectResult & { error?: string }) | null;
    if (connErr || !res || res.error) {
      setPhase('error');
      setError(res?.error ?? 'Could not connect that channel. Check the ID or @handle.');
      return;
    }
    setResult(res);

    if (res.queue_depth === 0) {
      setPhase('done');
      return;
    }

    // 2. Lessons are built by the cron worker. Watch them appear by polling the
    //    public published count — no client-side processing, no open endpoints.
    setPhase('processing');
    const baseline = await publishedCount(res.teacher_id);
    for (let i = 0; i < MAX_POLLS && !cancelled.current; i++) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (cancelled.current) return;
      const now = await publishedCount(res.teacher_id);
      const done = Math.min(Math.max(now - baseline, 0), res.queue_depth);
      setBuilt(done);
      if (done >= res.queue_depth) break;
    }
    if (!cancelled.current) setPhase('done');
  };

  const goToPage = () => result && navigate(`/${result.teacher_slug}`);

  return (
    <main className="min-h-dvh bg-paper-100 text-ink-900">
      <CreatorHeader />

      <section className="max-w-2xl mx-auto px-5 sm:px-8 pt-8 sm:pt-14 pb-20">
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-600">
          Connect a channel
        </span>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-3">
          Turn a YouTube channel into lessons.
        </h1>
        <p className="text-ink-500 mt-3 leading-relaxed">
          Paste a channel ID, URL or @handle. Lingua imports the catalogue and
          builds activities from the most recent videos.
        </p>

        {(phase === 'form' || phase === 'error') && (
          <form onSubmit={run} className="mt-8 flex flex-col gap-4">
            <label className="block">
              <span className="text-sm font-medium">YouTube channel</span>
              <input
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                placeholder="@handle or youtube.com/@handle"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="mt-1.5 w-full rounded-xl border border-paper-300 bg-paper-50 px-4 py-3 text-[0.95rem] focus:outline-none focus:border-ink-400"
              />
              <span className="block text-xs text-ink-400 mt-1.5">
                Best to use the channel's @handle or URL — a name can match the
                wrong channel, and a pasted ID might be a featured channel.
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium">
                Display name{' '}
                <span className="text-ink-400 font-normal">(optional)</span>
              </span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Defaults to the channel name"
                className="mt-1.5 w-full rounded-xl border border-paper-300 bg-paper-50 px-4 py-3 text-[0.95rem] focus:outline-none focus:border-ink-400"
              />
            </label>

            {phase === 'error' && error && (
              <p className="text-sm text-red-700">{error}</p>
            )}

            <button
              type="submit"
              disabled={!channel.trim()}
              className="mt-1 inline-flex items-center justify-center px-6 py-3.5 rounded-xl bg-emerald-600 text-paper-50 font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40"
            >
              Connect channel
            </button>
            <p className="text-xs text-ink-400">
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
        )}

        {phase === 'connecting' && (
          <StatusCard title="Importing the catalogue…">
            <Spinner />
            <p className="text-sm text-ink-500 mt-3">
              Reading the channel and indexing its videos.
            </p>
          </StatusCard>
        )}

        {phase === 'processing' && result && (
          <StatusCard title={`Building lessons from ${result.channel_title}`}>
            <p className="text-sm text-ink-500">
              Indexed {result.channel_video_count} videos. Generating activities
              for the latest {target}…
            </p>
            <Progress value={built} max={target} />
            <p className="text-sm text-ink-700 mt-2">
              {built} of {target} lessons ready
            </p>
            {built > 0 && (
              <button
                type="button"
                onClick={goToPage}
                className="mt-4 text-sm font-medium text-emerald-600 hover:text-emerald-700"
              >
                View the page now →
              </button>
            )}
          </StatusCard>
        )}

        {phase === 'done' && result && (
          <StatusCard title="Your channel is connected 🎉">
            <p className="text-sm text-ink-500">
              {result.channel_video_count} videos indexed
              {target > 0 ? `, ${built} of ${target} lessons ready` : ''}. Any
              still generating will appear shortly — new uploads are added
              automatically.
            </p>
            <div className="mt-5 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={goToPage}
                className="inline-flex items-center justify-center px-5 py-3 rounded-xl bg-emerald-600 text-paper-50 font-medium hover:bg-emerald-700 transition-colors"
              >
                View your page →
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhase('form');
                  setChannel('');
                  setDisplayName('');
                  setResult(null);
                }}
                className="inline-flex items-center justify-center px-5 py-3 rounded-xl border border-paper-300 font-medium text-ink-700 hover:border-ink-400 transition-colors"
              >
                Connect another
              </button>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/dashboard/${result.teacher_slug}`)}
              className="mt-3 text-sm font-medium text-emerald-600 hover:text-emerald-700"
            >
              Manage this channel in your dashboard →
            </button>
          </StatusCard>
        )}
      </section>
    </main>
  );
}

function StatusCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-8 rounded-2xl border border-paper-300/70 bg-paper-50 p-6">
      <h2 className="font-display text-xl font-medium">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Progress({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="mt-3 h-2 rounded-full bg-paper-200 overflow-hidden">
      <div
        className="h-full bg-emerald-500 transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block w-6 h-6 rounded-full border-2 border-paper-300 border-t-emerald-600 animate-spin" />
  );
}
