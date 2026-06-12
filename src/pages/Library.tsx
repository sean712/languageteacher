import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import type { ActivityRow } from '../lib/database.types';
import { parseActivities } from '../components/LessonActivities';

interface FollowedChannel {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
}

interface SavedLesson {
  id: string;
  title: string | null;
  thumbnail_url: string | null;
  type: string | null;
  teacher_slug: string;
}

interface ProgressLesson extends SavedLesson {
  done: number;
  total: number;
}

export default function Library() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [channels, setChannels] = useState<FollowedChannel[] | null>(null);
  const [lessons, setLessons] = useState<SavedLesson[] | null>(null);
  const [progress, setProgress] = useState<ProgressLesson[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: follows } = await supabase
        .from('followed_channels')
        .select('teachers(id,slug,display_name,avatar_url)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      const { data: saves } = await supabase
        .from('saved_lessons')
        .select('videos(id,title,thumbnail_url,type,teachers(slug))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (cancelled) return;

      type FollowRow = { teachers: FollowedChannel | null };
      setChannels(
        ((follows ?? []) as unknown as FollowRow[])
          .map((r) => r.teachers)
          .filter((t): t is FollowedChannel => Boolean(t)),
      );

      type SaveRow = {
        videos:
          | {
              id: string;
              title: string | null;
              thumbnail_url: string | null;
              type: string | null;
              teachers: { slug: string } | null;
            }
          | null;
      };
      setLessons(
        ((saves ?? []) as unknown as SaveRow[])
          .map((r) => r.videos)
          .filter((v): v is NonNullable<SaveRow['videos']> => Boolean(v))
          .map((v) => ({
            id: v.id,
            title: v.title,
            thumbnail_url: v.thumbnail_url,
            type: v.type,
            teacher_slug: v.teachers?.slug ?? '',
          })),
      );

      // Recently practised — lessons with completion progress.
      const { data: prog } = await supabase
        .from('lesson_progress')
        .select('done_activities, videos(id,title,thumbnail_url,type,teachers(slug))')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(12);
      type ProgRow = {
        done_activities: string[] | null;
        videos:
          | {
              id: string;
              title: string | null;
              thumbnail_url: string | null;
              type: string | null;
              teachers: { slug: string } | null;
            }
          | null;
      };
      const progRows = ((prog ?? []) as unknown as ProgRow[]).filter((r) => r.videos);
      const progIds = progRows.map((r) => r.videos!.id);
      // Map each lesson to the set of activity types it actually offers, so we
      // can show done/total accurately (done = completed types that exist).
      const typesByVideo = new Map<string, Set<string>>();
      if (progIds.length) {
        const { data: acts } = await supabase
          .from('activities')
          .select('id,video_id,type,payload,status,created_at')
          .in('video_id', progIds);
        const byVideo = new Map<string, ActivityRow[]>();
        for (const a of (acts ?? []) as ActivityRow[]) {
          byVideo.set(a.video_id, [...(byVideo.get(a.video_id) ?? []), a]);
        }
        for (const id of progIds) {
          typesByVideo.set(
            id,
            new Set(parseActivities(byVideo.get(id) ?? []).map((p) => p.type)),
          );
        }
      }
      if (cancelled) return;
      setProgress(
        progRows.map((r) => {
          const v = r.videos!;
          const types = typesByVideo.get(v.id) ?? new Set<string>();
          const doneTypes = (r.done_activities ?? []).filter((t) => types.has(t));
          return {
            id: v.id,
            title: v.title,
            thumbnail_url: v.thumbnail_url,
            type: v.type,
            teacher_slug: v.teachers?.slug ?? '',
            done: doneTypes.length,
            total: types.size,
          };
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const empty =
    channels !== null &&
    lessons !== null &&
    progress !== null &&
    channels.length === 0 &&
    lessons.length === 0 &&
    progress.length === 0;

  return (
    <main className="min-h-dvh bg-paper-100 text-ink-900">
      <header className="border-b border-paper-300/60 bg-paper-50">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between">
          <Link to="/" className="font-display text-lg font-semibold tracking-tight">
            Lingua
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {user?.email && (
              <span className="text-ink-400 hidden sm:inline">{user.email}</span>
            )}
            <button
              type="button"
              onClick={async () => {
                await signOut();
                navigate('/');
              }}
              className="text-ink-600 hover:text-ink-900"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-5 sm:px-8 pt-8 sm:pt-12 pb-20">
        <h1 className="font-display text-3xl font-semibold tracking-tight animate-rise">
          Your library
        </h1>
        <p className="text-ink-500 mt-1 text-sm animate-rise">
          Channels you follow and lessons you’ve saved.
        </p>

        {empty ? (
          <div className="mt-10 rounded-2xl border border-paper-300/70 bg-paper-50 p-10 text-center animate-rise">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 grid place-items-center text-xl mx-auto">
              ★
            </div>
            <h2 className="font-display text-xl font-medium mt-4">
              Nothing saved yet
            </h2>
            <p className="text-ink-500 mt-2 text-sm max-w-sm mx-auto">
              Follow a channel or save a lesson and it’ll show up here, across
              all your devices.
            </p>
            <Link
              to="/demo-teacher"
              className="inline-flex mt-5 px-5 py-3 rounded-xl bg-emerald-600 text-paper-50 font-medium hover:bg-emerald-700 transition-colors"
            >
              Explore a channel
            </Link>
          </div>
        ) : (
          <>
            <Section title="Following" empty={channels?.length === 0}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {(channels ?? []).map((c, i) => (
                  <Link
                    key={c.id}
                    to={`/${c.slug}`}
                    style={{ animationDelay: `${i * 50}ms` }}
                    className="animate-rise rounded-2xl border border-paper-300/70 bg-paper-50 p-4 flex flex-col items-center text-center hover:border-ink-400 hover:shadow-[0_14px_30px_-20px_rgba(26,25,22,0.35)] transition-all"
                  >
                    {c.avatar_url ? (
                      <img
                        src={c.avatar_url}
                        alt=""
                        className="w-14 h-14 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 grid place-items-center font-display font-semibold text-xl">
                        {c.display_name[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm font-medium mt-2 line-clamp-2">
                      {c.display_name}
                    </span>
                  </Link>
                ))}
              </div>
            </Section>

            <Section title="Recently practised" empty={progress?.length === 0}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {(progress ?? []).map((l, i) => {
                  const complete = l.total > 0 && l.done >= l.total;
                  return (
                    <Link
                      key={l.id}
                      to={`/${l.teacher_slug}?l=${l.id}`}
                      style={{ animationDelay: `${i * 50}ms` }}
                      className="animate-rise rounded-2xl border border-paper-300/70 bg-paper-50 overflow-hidden flex flex-col hover:shadow-[0_14px_30px_-20px_rgba(26,25,22,0.35)] transition-shadow"
                    >
                      <div className="relative aspect-video bg-paper-200">
                        {l.thumbnail_url && (
                          <img
                            src={l.thumbnail_url}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        )}
                        <span
                          className={`absolute bottom-2 right-2 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                            complete
                              ? 'bg-emerald-500 text-paper-50'
                              : 'bg-ink-900/80 text-paper-50'
                          }`}
                        >
                          {complete ? '✓ Done' : `${l.done}/${l.total || '–'}`}
                        </span>
                      </div>
                      <div className="p-3.5">
                        <h3 className="text-[0.95rem] font-medium leading-snug line-clamp-2">
                          {l.title ?? 'Untitled lesson'}
                        </h3>
                        {l.total > 0 && (
                          <div className="mt-2 h-1.5 rounded-full bg-paper-200 overflow-hidden">
                            <div
                              className="h-full bg-emerald-500"
                              style={{ width: `${Math.round((l.done / l.total) * 100)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </Section>

            <Section title="Saved lessons" empty={lessons?.length === 0}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {(lessons ?? []).map((l, i) => (
                  <Link
                    key={l.id}
                    to={`/${l.teacher_slug}?l=${l.id}`}
                    style={{ animationDelay: `${i * 50}ms` }}
                    className="animate-rise group rounded-2xl border border-paper-300/70 bg-paper-50 overflow-hidden flex flex-col hover:shadow-[0_14px_30px_-20px_rgba(26,25,22,0.35)] transition-shadow"
                  >
                    <div className="relative aspect-video bg-paper-200">
                      {l.thumbnail_url && (
                        <img
                          src={l.thumbnail_url}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      )}
                      {l.type === 'short' && (
                        <span className="absolute top-2 left-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-ink-900/80 text-paper-50">
                          Short
                        </span>
                      )}
                    </div>
                    <div className="p-3.5">
                      <h3 className="text-[0.95rem] font-medium leading-snug line-clamp-2">
                        {l.title ?? 'Untitled lesson'}
                      </h3>
                    </div>
                  </Link>
                ))}
              </div>
            </Section>
          </>
        )}
      </section>
    </main>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty?: boolean;
  children: React.ReactNode;
}) {
  if (empty) return null;
  return (
    <div className="mt-9">
      <h2 className="font-display text-lg font-medium mb-3">{title}</h2>
      {children}
    </div>
  );
}
