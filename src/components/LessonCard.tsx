import type { ActivityRow, VideoRow } from '../lib/database.types';
import { parseActivities, useCompleted } from './LessonActivities';

// A browsable lesson tile for the grid: thumbnail on top, title + meta below.
// Vertical layout works well in a multi-column grid on wider screens.
export default function LessonCard({
  video,
  activities,
  onOpen,
}: {
  video: VideoRow;
  activities: ActivityRow[];
  onOpen: (id: string) => void;
}) {
  const parsed = parseActivities(activities);
  const [completed] = useCompleted(video.id);
  const doneCount = parsed.filter((p) => completed.has(p.type)).length;
  const allDone = parsed.length > 0 && doneCount === parsed.length;

  return (
    <button
      type="button"
      onClick={() => onOpen(video.id)}
      className="group text-left rounded-2xl border border-paper-300/70 bg-paper-50 overflow-hidden flex flex-col transition-shadow hover:shadow-[0_14px_30px_-20px_rgba(26,25,22,0.35)]"
    >
      <div className="relative aspect-video bg-paper-200">
        {video.thumbnail_url && (
          <img
            src={video.thumbnail_url}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
          />
        )}
        {video.type === 'short' && (
          <span className="absolute top-2 left-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-ink-900/80 text-paper-50">
            Short
          </span>
        )}
        {allDone && (
          <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-emerald-500 text-paper-50 grid place-items-center text-xs">
            ✓
          </span>
        )}
        <span className="absolute inset-0 bg-ink-900/0 group-hover:bg-ink-900/5 transition-colors" />
      </div>
      <div className="p-3.5 flex-1 flex flex-col">
        <h3 className="text-[0.95rem] font-medium leading-snug line-clamp-2">
          {video.title ?? 'Untitled lesson'}
        </h3>
        <div className="flex items-center gap-2 mt-2 text-xs text-ink-400">
          {video.language && <span className="capitalize">{video.language}</span>}
          {parsed.length > 0 && (
            <span>
              · {parsed.length} {parsed.length === 1 ? 'activity' : 'activities'}
            </span>
          )}
          {doneCount > 0 && (
            <span className="text-emerald-600 font-medium">
              · {allDone ? 'all done' : `${doneCount} done`}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
