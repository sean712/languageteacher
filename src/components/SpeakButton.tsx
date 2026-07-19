import { useState } from 'react';
import { hasVoice, playTextToSpeech } from '../lib/audio-player';

// Speaker affordance for a target-language word/phrase. Renders nothing when
// there's no TTS voice for the language, so unmappable languages (e.g.
// Cornish) degrade to exactly the old UI. Must never be nested inside another
// <button> — place it as a sibling (invalid HTML + tap conflicts).
export default function SpeakButton({
  text,
  language,
  size = 'md',
  className = '',
}: {
  text: string;
  language: string | null | undefined;
  size?: 'md' | 'sm';
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  if (!hasVoice(language) || !text.trim()) return null;

  const onClick = async (e: React.MouseEvent) => {
    // Cards/tiles around this button have their own tap actions.
    e.stopPropagation();
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await playTextToSpeech(text, language!);
    } catch {
      // Non-fatal: pronunciation is an enhancement, never block the activity.
    } finally {
      setBusy(false);
    }
  };

  const dims = size === 'md' ? 'w-10 h-10' : 'w-8 h-8';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Listen to “${text}”`}
      title="Listen"
      className={`${dims} flex-shrink-0 inline-grid place-items-center rounded-full text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors ${className}`}
    >
      {busy ? <Spinner /> : <SpeakerIcon small={size === 'sm'} />}
    </button>
  );
}

function SpeakerIcon({ small }: { small: boolean }) {
  const s = small ? 16 : 20;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
      <path d="M15.5 8.5a5 5 0 010 7" />
      <path d="M18.5 5.5a9.5 9.5 0 010 13" />
    </svg>
  );
}

function Spinner() {
  return (
    <span className="w-4 h-4 rounded-full border-2 border-emerald-200 border-t-emerald-600 animate-spin" />
  );
}
