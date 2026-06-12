import type { ActivityRow, VideoRow } from '../lib/database.types';
import YouTubeEmbed from './YouTubeEmbed';
import LessonActivities, { parseActivities } from './LessonActivities';

// A focused lesson: the source video stays in constant view beside the
// activities on desktop (sticky left column), and stacks above them on mobile.
export default function LessonView({
  video,
  activities,
}: {
  video: VideoRow;
  activities: ActivityRow[];
}) {
  const count = parseActivities(activities).length;
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-8 lg:items-start">
      {/* Video + title — sticky on desktop so it follows the activities. */}
      <div className="lg:sticky lg:top-4">
        <YouTubeEmbed videoId={video.youtube_video_id} title={video.title} />
        <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight mt-4">
          {video.title ?? 'Untitled lesson'}
        </h2>
        <div className="flex items-center gap-2 mt-1.5 text-sm text-ink-400">
          {video.type === 'short' && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-ink-900/80 text-paper-50">
              Short
            </span>
          )}
          {video.language && <span className="capitalize">{video.language}</span>}
          {count > 0 && (
            <span>· {count} {count === 1 ? 'activity' : 'activities'}</span>
          )}
        </div>
      </div>

      {/* Activities. */}
      <div className="mt-6 lg:mt-0">
        <LessonActivities video={video} activities={activities} />
      </div>
    </div>
  );
}
