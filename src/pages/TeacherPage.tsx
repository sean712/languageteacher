import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
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
      <main className="min-h-dvh flex items-center justify-center text-gray-500">
        Loading…
      </main>
    );
  }

  if (state === 'not_found') {
    return (
      <main className="min-h-dvh flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Teacher not found</h1>
          <p className="text-gray-500 mt-2">No teacher with slug “{teacherSlug}”.</p>
        </div>
      </main>
    );
  }

  if (state === 'error' || !teacher) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-6 text-center">
        <p className="text-red-600">Something went wrong loading this page.</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh pb-24 bg-white dark:bg-[#0b0b0f]">
      <header className="px-5 pt-8 pb-6 bg-gradient-to-b from-brand-50 to-transparent dark:from-brand-700/20">
        <div className="flex items-center gap-4">
          {teacher.avatar_url ? (
            <img
              src={teacher.avatar_url}
              alt=""
              className="w-14 h-14 rounded-full object-cover"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-xl">
              {teacher.display_name[0]?.toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-semibold truncate">
              {teacher.display_name}
            </h1>
            {teacher.bio && (
              <p className="text-sm text-gray-500 truncate">{teacher.bio}</p>
            )}
          </div>
        </div>
      </header>

      {feed.length > 0 && (
        <nav
          aria-label="Filter lessons"
          className="sticky top-0 z-10 bg-white/90 dark:bg-[#0b0b0f]/90 backdrop-blur border-b border-gray-100 dark:border-white/10 px-3 sm:px-5 py-2 flex gap-2 overflow-x-auto [scrollbar-width:none]"
        >
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
          <span className="mx-1 my-auto h-5 w-px flex-shrink-0 bg-gray-200 dark:bg-white/10" />
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
        </nav>
      )}

      <section className="px-3 sm:px-5 mt-2 flex flex-col gap-4">
        {feed.length === 0 ? (
          <p className="text-center text-gray-500 py-12">
            No published lessons yet — check back soon.
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-gray-500 py-12">
            Nothing matches those filters yet.
          </p>
        ) : (
          sections.map((section) => (
            <div key={section.level} className="flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mt-3 first:mt-1">
                {section.level === OTHER_LEVEL ? 'More' : `Level ${section.level}`}
                <span className="ml-2 font-normal text-gray-400">
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
      className={`flex-shrink-0 rounded-full px-3 py-1 text-sm border transition-colors ${
        active
          ? 'bg-brand-600 border-brand-600 text-white'
          : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 active:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );
}
