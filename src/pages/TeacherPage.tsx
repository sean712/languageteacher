import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import type {
  ActivityRow,
  TeacherRow,
  VideoRow,
} from '../lib/database.types';
import VideoCard from '../components/VideoCard';

interface FeedItem {
  video: VideoRow;
  activities: ActivityRow[];
}

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const OTHER_LEVEL = 'Other';

type TypeFilter = 'all' | 'long' | 'short';

function levelOf(video: VideoRow): string {
  const lvl = video.level?.trim().toUpperCase() ?? '';
  return CEFR_ORDER.includes(lvl) ? lvl : OTHER_LEVEL;
}

export default function TeacherPage() {
  const { teacherSlug } = useParams<{ teacherSlug: string }>();
  const { user } = useAuth();
  const [teacher, setTeacher] = useState<TeacherRow | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'not_found' | 'error'>(
    'loading',
  );
  const [levelFilter, setLevelFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  useEffect(() => {
    if (!teacherSlug) return;
    let cancelled = false;

    (async () => {
      const { data: tRaw, error: tErr } = await supabase
        .from('teachers')
        .select('*')
        .ilike('slug', teacherSlug)
        .maybeSingle();

      if (cancelled) return;
      if (tErr) {
        setState('error');
        return;
      }
      if (!tRaw) {
        setState('not_found');
        return;
      }
      const t = tRaw as TeacherRow;
      setTeacher(t);

      const { data: videos, error: vErr } = await supabase
        .from('videos')
        .select('*')
        .eq('teacher_id', t.id)
        .eq('status', 'published')
        .order('youtube_published_at', { ascending: false, nullsFirst: false })
        .limit(200);

      if (cancelled) return;
      if (vErr) {
        setState('error');
        return;
      }

      const videoIds = ((videos ?? []) as VideoRow[]).map((v) => v.id);
      let activities: ActivityRow[] = [];
      if (videoIds.length) {
        const { data: a } = await supabase
          .from('activities')
          .select('*')
          .in('video_id', videoIds);
        activities = (a ?? []) as ActivityRow[];
      }

      const grouped: FeedItem[] = ((videos ?? []) as VideoRow[]).map((v) => ({
        video: v,
        activities: activities.filter((a) => a.video_id === v.id),
      }));

      setFeed(grouped);
      setState('ready');
    })();

    return () => {
      cancelled = true;
    };
  }, [teacherSlug]);

  const presentLevels = useMemo(() => {
    const set = new Set(feed.map((item) => levelOf(item.video)));
    return [...CEFR_ORDER, OTHER_LEVEL].filter((l) => set.has(l));
  }, [feed]);

  const filtered = useMemo(
    () =>
      feed.filter(
        (item) =>
          (typeFilter === 'all' || item.video.type === typeFilter) &&
          (levelFilter === null || levelOf(item.video) === levelFilter),
      ),
    [feed, levelFilter, typeFilter],
  );

  // With no level selected, show the feed grouped into level sections.
  const sections = useMemo(() => {
    if (levelFilter !== null) return [{ level: levelFilter, items: filtered }];
    return presentLevels
      .map((level) => ({
        level,
        items: filtered.filter((item) => levelOf(item.video) === level),
      }))
      .filter((s) => s.items.length > 0);
  }, [filtered, levelFilter, presentLevels]);

  if (state === 'loading') {
    return (
      <main className="min-h-dvh flex items-center justify-center text-ink-400">
        Loading…
      </main>
    );
  }

  if (state === 'not_found') {
    return (
      <main className="min-h-dvh flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            Teacher not found
          </h1>
          <p className="text-ink-500 mt-2">
            No teacher with handle “{teacherSlug}”.
          </p>
          <Link
            to="/"
            className="inline-block mt-5 text-emerald-600 font-medium hover:text-emerald-700"
          >
            ← Back to Lingua
          </Link>
        </div>
      </main>
    );
  }

  if (state === 'error' || !teacher) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-6 text-center">
        <p className="text-red-700">Something went wrong loading this page.</p>
      </main>
    );
  }

  const lessonCount = feed.length;
  const isOwner = Boolean(user && teacher.user_id && teacher.user_id === user.id);

  return (
    <main className="min-h-dvh pb-24 bg-paper-100 text-ink-900">
      <header className="border-b border-paper-300/60 bg-paper-50">
        <div className="max-w-2xl mx-auto px-5 sm:px-6">
          <div className="h-14 flex items-center justify-between">
            <Link
              to="/"
              className="font-display font-semibold tracking-tight text-ink-700 hover:text-ink-900"
            >
              Lingua
            </Link>
            {isOwner && (
              <Link
                to={`/dashboard/${teacher.slug}`}
                className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
              >
                Manage channel →
              </Link>
            )}
          </div>
          <div className="flex items-center gap-4 pb-7 pt-2">
            {teacher.avatar_url ? (
              <img
                src={teacher.avatar_url}
                alt=""
                className="w-16 h-16 rounded-full object-cover ring-1 ring-paper-300"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-emerald-50 ring-1 ring-emerald-100 flex items-center justify-center text-emerald-600 font-display font-semibold text-2xl">
                {teacher.display_name[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight truncate">
                {teacher.display_name}
              </h1>
              {teacher.bio ? (
                <p className="text-sm text-ink-500 mt-1 line-clamp-2">
                  {teacher.bio}
                </p>
              ) : null}
              {lessonCount > 0 && (
                <p className="text-xs text-ink-400 mt-1.5">
                  {lessonCount} interactive {lessonCount === 1 ? 'lesson' : 'lessons'}
                </p>
              )}
            </div>
          </div>
        </div>
      </header>

      {feed.length > 0 && (
        <nav
          aria-label="Filter lessons"
          className="sticky top-0 z-10 bg-paper-100/85 backdrop-blur border-b border-paper-300/60"
        >
          <div className="max-w-2xl mx-auto px-3 sm:px-6 py-2.5 flex gap-2 overflow-x-auto no-scrollbar">
            <FilterChip
              label="All levels"
              active={levelFilter === null}
              onClick={() => setLevelFilter(null)}
            />
            {presentLevels.map((level) => (
              <FilterChip
                key={level}
                label={level}
                active={levelFilter === level}
                onClick={() => setLevelFilter(levelFilter === level ? null : level)}
              />
            ))}
            <span className="mx-1 my-auto h-5 w-px flex-shrink-0 bg-paper-300" />
            <FilterChip
              label="Lessons"
              active={typeFilter === 'long'}
              onClick={() => setTypeFilter(typeFilter === 'long' ? 'all' : 'long')}
            />
            <FilterChip
              label="Shorts"
              active={typeFilter === 'short'}
              onClick={() => setTypeFilter(typeFilter === 'short' ? 'all' : 'short')}
            />
          </div>
        </nav>
      )}

      <section className="max-w-2xl mx-auto px-3 sm:px-6 mt-4 flex flex-col gap-4">
        {feed.length === 0 ? (
          <p className="text-center text-ink-400 py-16">
            No published lessons yet — check back soon.
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-ink-400 py-16">
            Nothing matches those filters yet.
          </p>
        ) : (
          sections.map((section) => (
            <div key={section.level} className="flex flex-col gap-4">
              <h2 className="flex items-baseline gap-2 mt-4 first:mt-1">
                <span className="font-display text-lg font-medium text-ink-900">
                  {section.level === OTHER_LEVEL ? 'More' : `Level ${section.level}`}
                </span>
                <span className="text-sm text-ink-400">
                  {section.items.length}
                </span>
              </h2>
              {section.items.map((item) => (
                <VideoCard
                  key={item.video.id}
                  video={item.video}
                  activities={item.activities}
                />
              ))}
            </div>
          ))
        )}
      </section>
    </main>
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
      aria-pressed={active}
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
