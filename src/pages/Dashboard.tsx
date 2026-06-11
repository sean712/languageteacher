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
        <div className="flex items-end justify-between gap-4">
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
            className="flex-shrink-0 px-4 py-2.5 rounded-xl bg-emerald-600 text-paper-50 text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            Connect channel
          </Link>
        </div>

        {channels === null ? (
          <p className="text-ink-400 py-16 text-center">Loading…</p>
        ) : channels.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-paper-300/70 bg-paper-50 p-8 text-center">
            <h2 className="font-display text-xl font-medium">No channels yet</h2>
            <p className="text-ink-500 mt-2 text-sm">
              Connect a YouTube channel and Lingua will build lessons from it.
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
            {channels.map((c) => (
              <ChannelCard key={c.teacher.id} summary={c} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function ChannelCard({ summary }: { summary: ChannelSummary }) {
  const { teacher, published, needs_review, working, not_processed } = summary;
  return (
    <Link
      to={`/dashboard/${teacher.slug}`}
      className="rounded-2xl border border-paper-300/70 bg-paper-50 p-4 hover:border-ink-400 transition-colors flex items-center gap-4"
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
