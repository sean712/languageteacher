import { useLocation, useNavigate } from 'react-router-dom';
import type { ActivityRow, VideoRow } from '../lib/database.types';
import YouTubeEmbed from './YouTubeEmbed';
import LessonActivities, { parseActivities } from './LessonActivities';
import { useSavedLesson } from '../lib/learner';

// A focused lesson: the source video stays in constant view beside the
// activities on desktop (sticky left column), and stacks above them on mobile.
export default function LessonView({
  video,
  activities,
  showSave = true,
}: {
  video: VideoRow;
  activities: ActivityRow[];
  showSave?: boolean;
}) {
  const count = parseActivities(activities).length;
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-8 lg:items-start">
      {/* Video + title — sticky on desktop so it follows the activities. */}
      <div className="lg:sticky lg:top-4">
        <YouTubeEmbed videoId={video.youtube_video_id} title={video.title} />
        <div className="flex items-start justify-between gap-3 mt-4">
          <div className="min-w-0">
            <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">
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
          {showSave && <SaveButton videoId={video.id} />}
        </div>
      </div>

      {/* Activities. */}
      <div className="mt-6 lg:mt-0">
        <LessonActivities video={video} activities={activities} />
      </div>
    </div>
  );
}

function SaveButton({ videoId }: { videoId: string }) {
  const { saved, toggle, signedIn } = useSavedLesson(videoId);
  const navigate = useNavigate();
  const location = useLocation();

  const onClick = () => {
    if (!signedIn) {
      navigate('/login', { state: { from: location.pathname + location.search } });
      return;
    }
    toggle();
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
        saved
          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
          : 'border-paper-300 text-ink-700 hover:border-ink-400'
      }`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill={saved ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
      </svg>
      {saved ? 'Saved' : 'Save'}
    </button>
  );
}
