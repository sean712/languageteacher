import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import type { ActivityRow, TeacherRow, VideoRow } from '../lib/database.types';
import CreatorHeader from '../components/CreatorHeader';
import VideoCard from '../components/VideoCard';

type Load = 'loading' | 'ready' | 'not_found';

export default function ReviewVideo() {
  const { slug, videoId } = useParams<{ slug: string; videoId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [load, setLoad] = useState<Load>('loading');
  const [teacher, setTeacher] = useState<TeacherRow | null>(null);
  const [video, setVideo] = useState<VideoRow | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    if (!user || !slug || !videoId) return;
    let cancelled = false;
    (async () => {
      const { data: t } = await supabase
        .from('teachers')
        .select('*')
        .ilike('slug', slug)
        .maybeSingle();
      if (cancelled) return;
      if (!t || (t as TeacherRow).user_id !== user.id) {
        setLoad('not_found');
        return;
      }
      const { data: v } = await supabase
        .from('videos')
        .select('*')
        .eq('id', videoId)
        .eq('teacher_id', (t as TeacherRow).id)
        .maybeSingle();
      if (cancelled) return;
      if (!v) {
        setLoad('not_found');
        return;
      }
      const { data: acts } = await supabase
        .from('activities')
        .select('*')
        .eq('video_id', videoId);
      if (cancelled) return;
      setTeacher(t as TeacherRow);
      setVideo(v as VideoRow);
      setActivities((acts ?? []) as ActivityRow[]);
      setLoad('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [user, slug, videoId]);

  const setStatus = async (status: string, extra: Record<string, unknown> = {}) => {
    if (!video) return;
    setBusy(true);
    const { error } = await supabase
      .from('videos')
      .update({ status, ...extra })
      .eq('id', video.id);
    setBusy(false);
    if (!error) navigate(`/dashboard/${slug}`);
  };

  if (load === 'loading') {
    return (
      <Shell>
        <p className="text-ink-400 py-16 text-center">Loading…</p>
      </Shell>
    );
  }
  if (load === 'not_found' || !teacher || !video) {
    return (
      <Shell>
        <div className="py-16 text-center">
          <h1 className="font-display text-2xl font-semibold">Not found</h1>
          <Link
            to={`/dashboard/${slug ?? ''}`}
            className="inline-block mt-4 text-emerald-600 font-medium"
          >
            ← Back
          </Link>
        </div>
      </Shell>
    );
  }

  const confidence =
    video.ai_confidence != null ? Number(video.ai_confidence) : null;
  const hasActivities = activities.length > 0;

  return (
    <Shell>
      <Link
        to={`/dashboard/${teacher.slug}`}
        className="text-sm text-ink-500 hover:text-ink-900"
      >
        ← {teacher.display_name}
      </Link>

      <h1 className="font-display text-2xl font-semibold tracking-tight mt-3">
        {video.title ?? 'Untitled'}
      </h1>
      <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-ink-500">
        <span className="capitalize">{video.status.replace('_', ' ')}</span>
        {video.language && <span>· {video.language}</span>}
        {video.level && <span>· {video.level}</span>}
        {confidence != null && (
          <span>· AI confidence {Math.round(confidence * 100)}%</span>
        )}
      </div>

      {video.status === 'needs_review' && (
        <p className="mt-4 text-sm text-ink-600 bg-amber-50 border border-amber-100 rounded-xl p-3">
          This was held back from publishing. Preview what was generated below —
          if it looks good, publish it; if the source transcript is poor (see
          below), regenerating won't help much. A teacher-supplied transcript
          will be the fix once that's built.
        </p>
      )}

      {/* The authentic learner preview. */}
      <h2 className="font-display text-lg font-medium mt-7">
        What learners will see
      </h2>
      {hasActivities ? (
        <div className="mt-3">
          <VideoCard video={video} activities={activities} defaultOpen />
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-400">
          No activities were generated for this video.
        </p>
      )}

      {/* Source transcript — explains low confidence at a glance. */}
      {video.transcript && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowTranscript((s) => !s)}
            className="text-sm font-medium text-ink-600 hover:text-ink-900"
          >
            {showTranscript ? 'Hide' : 'Show'} source transcript
            <span className="text-ink-400 font-normal">
              {' '}
              · {video.transcript_source}
            </span>
          </button>
          {showTranscript && (
            <p className="mt-2 text-sm text-ink-500 leading-relaxed bg-paper-50 border border-paper-300/70 rounded-xl p-4 max-h-60 overflow-auto whitespace-pre-wrap">
              {video.transcript}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-8 flex flex-wrap gap-2 border-t border-paper-300/60 pt-5">
        {video.status !== 'published' && (
          <button
            type="button"
            disabled={busy || !hasActivities}
            onClick={() =>
              setStatus('published', { published_at: new Date().toISOString() })
            }
            className="px-5 py-2.5 rounded-xl bg-emerald-600 text-paper-50 text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40"
          >
            Publish
          </button>
        )}
        {video.status === 'published' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setStatus('needs_review')}
            className="px-5 py-2.5 rounded-xl border border-paper-300 text-sm font-medium text-ink-700 hover:border-ink-400 transition-colors"
          >
            Unpublish
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => setStatus('queued')}
          className="px-5 py-2.5 rounded-xl border border-paper-300 text-sm font-medium text-ink-700 hover:border-ink-400 transition-colors disabled:opacity-40"
        >
          Regenerate
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-paper-100 text-ink-900">
      <CreatorHeader />
      <section className="max-w-2xl mx-auto px-5 sm:px-8 pt-6 sm:pt-10 pb-20">
        {children}
      </section>
    </main>
  );
}
