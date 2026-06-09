import { useEffect, useState } from 'react';
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

export default function TeacherPage() {
  const { teacherSlug } = useParams<{ teacherSlug: string }>();
  const [teacher, setTeacher] = useState<TeacherRow | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'not_found' | 'error'>(
    'loading',
  );

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
        .order('published_at', { ascending: false })
        .limit(20);

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

      <section className="px-3 sm:px-5 mt-2 flex flex-col gap-4">
        {feed.length === 0 ? (
          <p className="text-center text-gray-500 py-12">
            No published lessons yet — check back soon.
          </p>
        ) : (
          feed.map((item) => (
            <VideoCard
              key={item.video.id}
              video={item.video}
              activities={item.activities}
            />
          ))
        )}
      </section>
    </main>
  );
}
