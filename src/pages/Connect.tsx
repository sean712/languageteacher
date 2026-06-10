import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface ConnectResult {
  teacher_slug: string;
  channel_title: string;
  channel_video_count: number;
  queued_now: number;
  queue_depth: number;
}

type Phase = 'form' | 'connecting' | 'processing' | 'done' | 'error';

const PROCESS_BATCH = 5;
const MAX_BATCHES = 30;

export default function Connect() {
  const navigate = useNavigate();
  const [channel, setChannel] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConnectResult | null>(null);
  const [processed, setProcessed] = useState(0);
  const cancelled = useRef(false);

  // How many lessons we'll build now = everything currently queued for this
  // channel (covers a fresh connect and re-connecting with pending videos).
  const target = result?.queue_depth ?? 0;

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channel.trim()) return;
    cancelled.current = false;
    setPhase('connecting');
    setError(null);
    setProcessed(0);

    // 1. Resolve + create teacher + index catalogue.
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

    // 2. Drive the queue from the browser (works server-side once
    //    SUPADATA_API_KEY is set). Cron will replace this for hands-off runs.
    if (res.queue_depth === 0) {
      setPhase('done');
      return;
    }
    setPhase('processing');
    let done = 0;
    for (let i = 0; i < MAX_BATCHES && !cancelled.current; i++) {
      const { data: pData, error: pErr } = await supabase.functions.invoke(
        'process-videos',
        { body: { batch_size: PROCESS_BATCH } },
      );
      const p = pData as
        | { processed?: unknown[]; remaining_queued?: number; error?: string }
        | null;
      if (pErr || !p || p.error) break; // leave the rest for a later run
      done += p.processed?.length ?? 0;
      setProcessed(Math.min(done, res.queue_depth));
      if ((p.remaining_queued ?? 0) === 0 || done >= res.queue_depth) break;
    }
    if (!cancelled.current) setPhase('done');
  };

  const goToPage = () => result && navigate(`/${result.teacher_slug}`);

  return (
    <main className="min-h-dvh bg-paper-100 text-ink-900">
      <header className="max-w-2xl mx-auto px-5 sm:px-8 h-16 flex items-center">
        <Link to="/" className="font-display text-xl font-semibold tracking-tight">
          Lingua
        </Link>
      </header>

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
                placeholder="@channel, UC… ID, or youtube.com/@channel"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="mt-1.5 w-full rounded-xl border border-paper-300 bg-paper-50 px-4 py-3 text-[0.95rem] focus:outline-none focus:border-ink-400"
              />
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
            <Progress value={processed} max={target} />
            <p className="text-sm text-ink-700 mt-2">
              {processed} of {target} lessons built
            </p>
            {processed > 0 && (
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
              {target > 0 ? `, ${processed} lessons built` : ''}. New uploads
              will be added automatically on the next sync.
            </p>
            <div className="mt-5 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={goToPage}
                className="inline-flex items-center justify-center px-5 py-3 rounded-xl bg-emerald-600 text-paper-50 font-medium hover:bg-emerald-700 transition-colors"
              >
                View your page →
              </button>
              <Link
                to="/connect"
                onClick={() => {
                  setPhase('form');
                  setChannel('');
                  setDisplayName('');
                  setResult(null);
                }}
                className="inline-flex items-center justify-center px-5 py-3 rounded-xl border border-paper-300 font-medium text-ink-700 hover:border-ink-400 transition-colors"
              >
                Connect another
              </Link>
            </div>
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
  children: React.ReactNode;
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
