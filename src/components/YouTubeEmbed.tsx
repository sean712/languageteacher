import { useState } from 'react';

type Props = { videoId: string; title?: string | null };

// Lazy YouTube embed: shows a thumbnail "facade" with a play button and only
// loads the real iframe player on tap. Avoids pulling a heavy iframe (and
// YouTube cookies) for every lesson until the viewer actually wants to watch.
// Uses youtube-nocookie.com (privacy-enhanced mode). Embedding is the
// ToS-sanctioned way to show YouTube content — creator ads/monetization intact.
export default function YouTubeEmbed({ videoId, title }: Props) {
  const [playing, setPlaying] = useState(false);
  const thumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return (
    <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-ink-900">
      {playing ? (
        <iframe
          className="absolute inset-0 w-full h-full"
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
          title={title ?? 'Video'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label="Play video"
          className="group absolute inset-0 w-full h-full"
        >
          <img
            src={thumb}
            alt={title ?? ''}
            loading="lazy"
            className="w-full h-full object-cover"
          />
          <span className="absolute inset-0 bg-ink-900/20 group-hover:bg-ink-900/10 transition-colors" />
          <span className="absolute inset-0 grid place-items-center">
            <span className="w-16 h-12 rounded-xl bg-red-600/95 grid place-items-center shadow-lg group-hover:scale-105 transition-transform">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
