import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import type { TeacherRow, VideoRow } from '../lib/database.types';
import CreatorHeader from '../components/CreatorHeader';

type Load = 'loading' | 'ready' | 'not_found';
type Filter = 'all' | 'published' | 'needs_review' | 'working';

// Statuses with generated content / in-flight, shown in the management list.
const ACTIVE = ['published', 'needs_review', 'processing', 'queued', 'failed'];
const GENERATE_BATCH = 10;

export default function ChannelManage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [load, setLoad] = useState<Load>('loading');
  const [teacher, setTeacher] = useState<TeacherRow | null>(null);
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [notProcessed, setNotProcessed] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [resync, setResync] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [resyncMsg, setResyncMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async (teacherId: string) => {
    const [{ data: vids }, { count: np }] = await Promise.all([
      supabase
        .from('videos')
        .select('*')
        .eq('teacher_id', teacherId)
        .in('status', ACTIVE)
        .order('youtube_published_at', { ascending: false, nullsFirst: false })
        .limit(200),
      supabase
        .from('videos')
        .select('id', { count: 'exact', head: true })
        .eq('teacher_id', teacherId)
        .eq('status', 'not_processed'),
    ]);
    setVideos((vids ?? []) as VideoRow[]);
    setNotProcessed(np ?? 0);
  }, []);

  useEffect(() => {
    if (!user || !slug) return;
    let cancelled = false;
    (async () => {
      const { data: t } = await supabase
        .from('teachers')
        .select('*')
        .ilike('slug', slug)
        .maybeSingle();
      if (cancelled) return;
      // Ownership check — RLS lets anyone read teachers, so verify here.
      if (!t || (t as TeacherRow).user_id !== user.id) {
        setLoad('not_found');
        return;
      }
      setTeacher(t as TeacherRow);
      await refresh((t as TeacherRow).id);
      if (!cancelled) setLoad('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [user, slug, refresh]);

  const setStatus = async (
    video: VideoRow,
    status: string,
    extra: Record<string, unknown> = {},
  ) => {
    setBusy((b) => new Set(b).add(video.id));
    const { error } = await supabase
      .from('videos')
      .update({ status, ...extra })
      .eq('id', video.id);
    if (!error && teacher) await refresh(teacher.id);
    setBusy((b) => {
      const n = new Set(b);
      n.delete(video.id);
      return n;
    });
  };

  const generateMore = async () => {
    if (!teacher) return;
    const { data: next } = await supabase
      .from('videos')
      .select('id')
      .eq('teacher_id', teacher.id)
      .eq('status', 'not_processed')
      .order('youtube_published_at', { ascending: false, nullsFirst: false })
      .limit(GENERATE_BATCH);
    const ids = (next ?? []).map((v) => v.id);
    if (ids.length) {
      await supabase.from('videos').update({ status: 'queued' }).in('id', ids);
      await refresh(teacher.id);
    }
  };

  // Re-run the catalogue sync to pick up new uploads (reuses connect-channel,
  // which reuses this teacher and queues newly-discovered videos).
  const resyncChannel = async () => {
    if (!teacher?.youtube_channel_id) return;
    setResync('syncing');
    setResyncMsg(null);
    const { data, error } = await supabase.functions.invoke('connect-channel', {
      body: { channel: teacher.youtube_channel_id },
    });
    const res = data as { new_videos?: number; queued_now?: number; error?: string } | null;
    if (error || res?.error) {
      setResync('error');
      setResyncMsg(res?.error ?? 'Sync failed — please try again.');
      return;
    }
    setResync('done');
    setResyncMsg(
      res?.new_videos
        ? `Found ${res.new_videos} new video(s); ${res.queued_now ?? 0} queued.`
        : 'Up to date — no new videos.',
    );
    await refresh(teacher.id);
  };

  const removeChannel = async () => {
    if (!teacher) return;
    setDeleting(true);
    const { error } = await supabase.from('teachers').delete().eq('id', teacher.id);
    if (error) {
      setDeleting(false);
      setConfirmDelete(false);
      return;
    }
    navigate('/dashboard');
  };

  const counts = useMemo(() => {
    const c = { published: 0, needs_review: 0, working: 0 };
    for (const v of videos) {
      if (v.status === 'published') c.published++;
      else if (v.status === 'needs_review') c.needs_review++;
      else if (v.status === 'queued' || v.status === 'processing') c.working++;
    }
    return c;
  }, [videos]);

  const filtered = useMemo(() => {
    const byStatus = (v: VideoRow) =>
      filter === 'all'
        ? true
        : filter === 'working'
        ? v.status === 'queued' || v.status === 'processing'
        : v.status === filter;
    // Surface the ones needing attention first.
    const rank = (s: string) =>
      s === 'needs_review' ? 0 : s === 'failed' ? 1 : s === 'published' ? 2 : 3;
    return videos
      .filter(byStatus)
      .sort((a, b) => rank(a.status) - rank(b.status));
  }, [videos, filter]);

  if (load === 'loading') {
    return (
      <Shell>
        <p className="text-ink-400 py-16 text-center">Loading…</p>
      </Shell>
    );
  }
  if (load === 'not_found' || !teacher) {
    return (
      <Shell>
        <div className="py-16 text-center">
          <h1 className="font-display text-2xl font-semibold">
            Channel not found
          </h1>
          <p className="text-ink-500 mt-2">
            This channel doesn't exist or isn't yours.
          </p>
          <Link
            to="/dashboard"
            className="inline-block mt-5 text-emerald-600 font-medium"
          >
            ← Back to dashboard
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Link to="/dashboard" className="text-sm text-ink-500 hover:text-ink-900">
        ← Dashboard
      </Link>
      <div className="flex items-start justify-between gap-4 mt-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold tracking-tight truncate">
            {teacher.display_name}
          </h1>
          <Link
            to={`/${teacher.slug}`}
            className="text-sm text-emerald-600 hover:text-emerald-700"
          >
            View public page · /{teacher.slug} ↗
          </Link>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={resyncChannel}
            disabled={resync === 'syncing'}
            className="px-3.5 py-2 rounded-lg border border-paper-300 text-sm font-medium text-ink-700 hover:border-ink-400 transition-colors disabled:opacity-50"
          >
            {resync === 'syncing' ? 'Syncing…' : 'Re-sync'}
          </button>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-ink-400 hover:text-red-700"
            >
              Remove channel
            </button>
          ) : null}
        </div>
      </div>

      {resyncMsg && (
        <p
          className={`mt-2 text-sm ${resync === 'error' ? 'text-red-700' : 'text-ink-500'}`}
        >
          {resyncMsg}
        </p>
      )}

      {confirmDelete && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-ink-700">
            Remove <strong>{teacher.display_name}</strong> and all its generated
            lessons? This can't be undone. (Your YouTube videos are not
            affected.)
          </p>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={removeChannel}
              disabled={deleting}
              className="px-4 py-2 rounded-lg bg-red-600 text-paper-50 text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {deleting ? 'Removing…' : 'Yes, remove'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="px-4 py-2 rounded-lg border border-paper-300 text-sm font-medium text-ink-700 hover:border-ink-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Status communication — this is what the creator was missing. */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile n={counts.published} label="Published" tone="emerald" />
        <Tile n={counts.needs_review} label="Need review" tone="amber" />
        <Tile n={counts.working} label="Working" tone="ink" />
        <Tile n={notProcessed} label="Not started" tone="muted" />
      </div>

      {counts.published === 0 && counts.needs_review > 0 && (
        <p className="mt-4 text-sm text-ink-600 bg-amber-50 border border-amber-100 rounded-xl p-3">
          Nothing's published yet because every generated lesson was flagged
          for review (usually low confidence from poor auto-captions). Review
          and publish any that look good below, or regenerate them.
        </p>
      )}

      {notProcessed > 0 && (
        <button
          type="button"
          onClick={generateMore}
          className="mt-4 px-4 py-2.5 rounded-xl border border-paper-300 text-sm font-medium text-ink-700 hover:border-ink-400 transition-colors"
        >
          Generate {Math.min(GENERATE_BATCH, notProcessed)} more from the
          backlog ({notProcessed} not started)
        </button>
      )}

      <div className="mt-6 flex gap-2 overflow-x-auto no-scrollbar">
        {(['all', 'needs_review', 'published', 'working'] as Filter[]).map(
          (f) => (
            <FilterChip
              key={f}
              label={
                f === 'all'
                  ? 'All'
                  : f === 'needs_review'
                  ? 'Need review'
                  : f === 'published'
                  ? 'Published'
                  : 'Working'
              }
              active={filter === f}
              onClick={() => setFilter(f)}
            />
          ),
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        {filtered.length === 0 ? (
          <p className="text-ink-400 text-sm py-10 text-center">
            Nothing here yet.
          </p>
        ) : (
          filtered.map((v) => (
            <VideoRowItem
              key={v.id}
              video={v}
              busy={busy.has(v.id)}
              onReview={() => navigate(`/dashboard/${slug}/review/${v.id}`)}
              onPublish={() =>
                setStatus(v, 'published', {
                  published_at: new Date().toISOString(),
                })
              }
              onUnpublish={() => setStatus(v, 'needs_review')}
              onRegenerate={() => setStatus(v, 'queued')}
            />
          ))
        )}
      </div>
    </Shell>
  );
}

function VideoRowItem({
  video,
  busy,
  onReview,
  onPublish,
  onUnpublish,
  onRegenerate,
}: {
  video: VideoRow;
  busy: boolean;
  onReview: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onRegenerate: () => void;
}) {
  const working = video.status === 'queued' || video.status === 'processing';
  const reviewable =
    video.status === 'needs_review' || video.status === 'published';
  const reason =
    (video.needs_review_notes as { reason?: string } | null)?.reason ??
    (video.ai_confidence != null && Number(video.ai_confidence) < 0.6
      ? `Low confidence (${video.ai_confidence})`
      : null);

  return (
    <div className="rounded-xl border border-paper-300/70 bg-paper-50 p-3 flex gap-3">
      {video.thumbnail_url && (
        <img
          src={video.thumbnail_url}
          alt=""
          className="w-24 h-16 rounded-lg object-cover flex-shrink-0 bg-paper-200"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h3 className="text-sm font-medium leading-snug line-clamp-2 flex-1">
            {video.title ?? 'Untitled'}
          </h3>
          <StatusBadge status={video.status} />
        </div>
        {video.status === 'needs_review' && reason && (
          <p className="text-xs text-amber-700 mt-1">{reason}</p>
        )}
        <div className="flex flex-wrap gap-2 mt-2">
          {busy || working ? (
            <span className="text-xs text-ink-400">
              {busy ? 'Updating…' : 'Generating…'}
            </span>
          ) : (
            <>
              {reviewable && (
                <Action label="Review" primary={video.status === 'needs_review'} onClick={onReview} />
              )}
              {video.status === 'needs_review' && (
                <Action label="Publish" onClick={onPublish} />
              )}
              {video.status === 'published' && (
                <Action label="Unpublish" onClick={onUnpublish} />
              )}
              {(video.status === 'needs_review' ||
                video.status === 'published' ||
                video.status === 'failed') && (
                <Action label="Regenerate" onClick={onRegenerate} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Action({
  label,
  primary,
  onClick,
}: {
  label: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
        primary
          ? 'bg-emerald-600 text-paper-50 hover:bg-emerald-700'
          : 'border border-paper-300 text-ink-700 hover:border-ink-400'
      }`}
    >
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    published: 'bg-emerald-50 text-emerald-700',
    needs_review: 'bg-amber-100 text-amber-800',
    processing: 'bg-paper-200 text-ink-700',
    queued: 'bg-paper-200 text-ink-700',
    failed: 'bg-red-50 text-red-700',
  };
  const label: Record<string, string> = {
    published: 'Published',
    needs_review: 'Needs review',
    processing: 'Processing',
    queued: 'Queued',
    failed: 'Failed',
  };
  return (
    <span
      className={`flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${map[status] ?? 'bg-paper-200 text-ink-600'}`}
    >
      {label[status] ?? status}
    </span>
  );
}

function Tile({
  n,
  label,
  tone,
}: {
  n: number;
  label: string;
  tone: 'emerald' | 'amber' | 'ink' | 'muted';
}) {
  const color = {
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    ink: 'text-ink-900',
    muted: 'text-ink-400',
  }[tone];
  return (
    <div className="rounded-xl border border-paper-300/70 bg-paper-50 p-3">
      <div className={`font-display text-2xl font-semibold ${color}`}>{n}</div>
      <div className="text-xs text-ink-500 mt-0.5">{label}</div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-sm border transition-colors ${
        active
          ? 'bg-ink-900 border-ink-900 text-paper-50'
          : 'bg-paper-50 border-paper-300 text-ink-700 hover:border-ink-400'
      }`}
    >
      {label}
    </button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-paper-100 text-ink-900">
      <CreatorHeader />
      <section className="max-w-3xl mx-auto px-5 sm:px-8 pt-6 sm:pt-10 pb-20 animate-rise">
        {children}
      </section>
    </main>
  );
}
