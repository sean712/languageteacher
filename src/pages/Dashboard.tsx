import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import type { TeacherRow } from '../lib/database.types';
import CreatorHeader from '../components/CreatorHeader';

interface ChannelSummary {
  teacher: TeacherRow;
  published: number;
  needs_review: number;
  working: number; // queued + processing
  not_processed: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<ChannelSummary[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: teachers } = await supabase
        .from('teachers')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      const summaries: ChannelSummary[] = [];
      for (const t of (teachers ?? []) as TeacherRow[]) {
        const counts = await statusCounts(t.id);
        summaries.push({ teacher: t, ...counts });
      }
      if (!cancelled) setChannels(summaries);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <main className="min-h-dvh bg-paper-100 text-ink-900">
      <CreatorHeader />
      <section className="max-w-3xl mx-auto px-5 sm:px-8 pt-8 sm:pt-12 pb-20">
        <div className="flex items-end justify-between gap-4 animate-rise">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Your channels
            </h1>
            <p className="text-ink-500 mt-1 text-sm">
              Manage the lessons generated from your YouTube channels.
            </p>
          </div>
          <Link
            to="/connect"
            className="flex-shrink-0 px-4 py-2.5 rounded-xl bg-emerald-600 text-paper-50 text-sm font-medium hover:bg-emerald-700 hover:-translate-y-0.5 transition-all"
          >
            Connect channel
          </Link>
        </div>

        {channels === null ? (
          <div className="mt-8 flex flex-col gap-3">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-[4.75rem] rounded-2xl border border-paper-300/70 bg-paper-50 animate-pulse"
              />
            ))}
          </div>
        ) : channels.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-paper-300/70 bg-paper-50 p-10 text-center animate-rise">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 grid place-items-center text-xl mx-auto">
              ✨
            </div>
            <h2 className="font-display text-xl font-medium mt-4">No channels yet</h2>
            <p className="text-ink-500 mt-2 text-sm max-w-sm mx-auto">
              Connect a YouTube channel and Lingua will turn its videos into
              interactive lessons — automatically.
            </p>
            <Link
              to="/connect"
              className="inline-flex mt-5 px-5 py-3 rounded-xl bg-emerald-600 text-paper-50 font-medium hover:bg-emerald-700 transition-colors"
            >
              Connect your first channel
            </Link>
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-3">
            {channels.map((c, i) => (
              <ChannelCard key={c.teacher.id} summary={c} index={i} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function ChannelCard({ summary, index }: { summary: ChannelSummary; index: number }) {
  const { teacher, published, needs_review, working, not_processed } = summary;
  return (
    <Link
      to={`/dashboard/${teacher.slug}`}
      style={{ animationDelay: `${index * 70}ms` }}
      className="animate-rise rounded-2xl border border-paper-300/70 bg-paper-50 p-4 hover:border-ink-400 hover:shadow-[0_14px_30px_-20px_rgba(26,25,22,0.35)] transition-all flex items-center gap-4"
    >
      {teacher.avatar_url ? (
        <img
          src={teacher.avatar_url}
          alt=""
          className="w-12 h-12 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 font-display font-semibold text-lg grid place-items-center flex-shrink-0">
          {teacher.display_name[0]?.toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="font-medium truncate">{teacher.display_name}</h3>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs">
          <Stat n={published} label="published" tone="emerald" />
          <Stat n={needs_review} label="need review" tone="amber" />
          {working > 0 && <Stat n={working} label="working" tone="ink" />}
          <Stat n={not_processed} label="not started" tone="muted" />
        </div>
      </div>
      <span aria-hidden className="text-ink-400">→</span>
    </Link>
  );
}

function Stat({
  n,
  label,
  tone,
}: {
  n: number;
  label: string;
  tone: 'emerald' | 'amber' | 'ink' | 'muted';
}) {
  const colors = {
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    ink: 'text-ink-700',
    muted: 'text-ink-400',
  }[tone];
  return (
    <span className={colors}>
      <span className="font-semibold">{n}</span> {label}
    </span>
  );
}

async function statusCounts(teacherId: string) {
  const countFor = async (statuses: string[]) => {
    const { count } = await supabase
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', teacherId)
      .in('status', statuses);
    return count ?? 0;
  };
  const [published, needs_review, working, not_processed] = await Promise.all([
    countFor(['published']),
    countFor(['needs_review']),
    countFor(['queued', 'processing']),
    countFor(['not_processed']),
  ]);
  return { published, needs_review, working, not_processed };
}
