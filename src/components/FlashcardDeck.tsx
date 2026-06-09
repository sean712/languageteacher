import { useRef, useState } from 'react';
import type { FlashcardsPayload } from '../lib/activity-schemas';

type Props = { payload: FlashcardsPayload };

const SWIPE_THRESHOLD = 60;

export default function FlashcardDeck({ payload }: Props) {
  const cards = payload.items;
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [dragX, setDragX] = useState(0);
  const startX = useRef<number | null>(null);

  if (cards.length === 0) {
    return <p className="text-sm text-gray-500">No flashcards.</p>;
  }

  const card = cards[index];
  const atStart = index === 0;
  const atEnd = index === cards.length - 1;

  const advance = (dir: 1 | -1) => {
    setFlipped(false);
    setIndex((i) =>
      dir === 1 ? Math.min(cards.length - 1, i + 1) : Math.max(0, i - 1),
    );
  };

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    setDragX(e.touches[0].clientX - startX.current);
  };
  const onTouchEnd = () => {
    if (Math.abs(dragX) > SWIPE_THRESHOLD) {
      if (dragX < 0 && !atEnd) advance(1);
      else if (dragX > 0 && !atStart) advance(-1);
    }
    setDragX(0);
    startX.current = null;
  };

  return (
    <div className="select-none">
      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
        <span>Flashcards</span>
        <span>
          {index + 1} / {cards.length}
        </span>
      </div>

      <div
        className="relative h-56 sm:h-64 touch-pan-y"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          className="absolute inset-0 w-full h-full"
          style={{
            transform: `translateX(${dragX}px)`,
            transition: dragX === 0 ? 'transform 200ms ease' : 'none',
            perspective: '1000px',
          }}
        >
          <div
            className="relative w-full h-full"
            style={{
              transformStyle: 'preserve-3d',
              transition: 'transform 350ms',
              transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            }}
          >
            <CardFace side="front">
              <div className="text-2xl sm:text-3xl font-semibold text-center px-4">
                {card.term}
              </div>
              {card.confidence !== undefined && card.confidence < 0.6 && (
                <div className="absolute top-3 right-3 text-[10px] uppercase tracking-wide bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  low confidence
                </div>
              )}
            </CardFace>
            <CardFace side="back">
              <div className="text-xl sm:text-2xl font-medium text-center px-4">
                {card.translation}
              </div>
              {card.example && (
                <div className="text-sm text-gray-500 mt-3 text-center px-4">
                  {card.example}
                </div>
              )}
            </CardFace>
          </div>
        </button>
      </div>

      <div className="flex items-center justify-between mt-4 gap-3">
        <button
          type="button"
          onClick={() => advance(-1)}
          disabled={atStart}
          className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-white/10 text-sm font-medium disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          className="flex-1 py-3 rounded-xl bg-brand-600 text-white text-sm font-medium"
        >
          {flipped ? 'Show term' : 'Reveal'}
        </button>
        <button
          type="button"
          onClick={() => advance(1)}
          disabled={atEnd}
          className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-white/10 text-sm font-medium disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function CardFace({
  side,
  children,
}: {
  side: 'front' | 'back';
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute inset-0 rounded-2xl bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 shadow-sm flex items-center justify-center"
      style={{
        backfaceVisibility: 'hidden',
        transform: side === 'back' ? 'rotateY(180deg)' : undefined,
      }}
    >
      {children}
    </div>
  );
}
