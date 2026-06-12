import { useEffect, useState } from 'react';

// A looping, in-page hero animation telling the core story:
// Connect a channel → import its videos → lessons are generated.
// Built with live DOM + CSS transitions (crisp, responsive, on-brand, light),
// reusing the paper/ink/emerald system. Respects prefers-reduced-motion.

const PHASES = ['Connect', 'Import', 'Create'] as const;
const STEP_MS = 2600;

// Stylised video tiles (no external images → no flicker on loop).
const TILES = [
  'from-emerald-700 to-ink-900',
  'from-ink-800 to-ink-900',
  'from-emerald-600 to-emerald-800',
  'from-ink-700 to-emerald-900',
  'from-emerald-800 to-ink-900',
  'from-ink-900 to-emerald-900',
];

export default function HeroAnimation() {
  const [phase, setPhase] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) {
      setReduced(true);
      setPhase(2); // show the composed end-state, no motion
      return;
    }
    const id = setInterval(() => setPhase((p) => (p + 1) % PHASES.length), STEP_MS);
    return () => clearInterval(id);
  }, []);

  const found = phase >= 1; // channel resolved
  const importing = phase >= 1;
  const creating = phase >= 2;

  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-4 bg-gradient-to-tr from-emerald-50/60 to-transparent rounded-[2rem] -z-10"
      />
      <div className="rounded-2xl bg-paper-50 border border-paper-300/70 shadow-[0_1px_0_rgba(0,0,0,0.02),0_18px_40px_-18px_rgba(26,25,22,0.25)] p-4 sm:p-5">
        {/* Connect bar — morphs from input to a 'found' channel card. */}
        <div className="relative h-14">
          {/* input state */}
          <div
            className="absolute inset-0 flex items-center gap-2 transition-all duration-500"
            style={{ opacity: found ? 0 : 1, transform: found ? 'translateY(-6px)' : 'none' }}
          >
            <div className="flex-1 rounded-lg border border-paper-300 bg-paper-100/70 px-3 h-10 flex items-center text-sm text-ink-500">
              youtube.com/@baldwelshteacher
              {!reduced && <span className="ml-0.5 w-px h-4 bg-ink-400 animate-pulse" />}
            </div>
            <span
              className={`px-3 h-10 rounded-lg bg-emerald-600 text-paper-50 text-sm font-medium flex items-center ${
                !found && !reduced ? 'animate-glow' : ''
              }`}
            >
              Connect
            </span>
          </div>
          {/* found state */}
          <div
            className="absolute inset-0 flex items-center gap-3 transition-all duration-500"
            style={{ opacity: found ? 1 : 0, transform: found ? 'none' : 'translateY(6px)' }}
          >
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center font-display font-semibold">
              B
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink-900 leading-tight">
                BaldWelshTeacher
              </p>
              <p className="text-xs text-emerald-600">✓ Found · 78 videos</p>
            </div>
          </div>
        </div>

        {/* Divider label that reflects the current phase. */}
        <div className="flex items-center gap-3 my-3.5">
          <span className="h-px flex-1 bg-paper-300/80" />
          <span className="text-[11px] uppercase tracking-wider text-ink-400 transition-colors">
            {creating ? 'Lingua generates' : importing ? 'Importing library' : 'Paste a channel'}
          </span>
          <span className="h-px flex-1 bg-paper-300/80" />
        </div>

        {/* Stage area — fixed height so the card never jumps. */}
        <div className="relative h-52">
          {/* Thumbnails layer */}
          <div
            className="grid grid-cols-3 gap-2 transition-all duration-500"
            style={{
              opacity: importing ? (creating ? 0.25 : 1) : 0,
              transform: creating ? 'scale(0.96)' : 'none',
              filter: creating ? 'blur(1px)' : 'none',
            }}
          >
            {TILES.map((g, i) => (
              <div
                key={i}
                className={`relative aspect-video rounded-lg bg-gradient-to-br ${g} overflow-hidden transition-all`}
                style={{
                  opacity: importing ? 1 : 0,
                  transform: importing ? 'none' : 'translateY(10px) scale(0.9)',
                  transitionDuration: '500ms',
                  transitionDelay: importing && !reduced ? `${i * 80}ms` : '0ms',
                }}
              >
                <span className="absolute inset-0 grid place-items-center text-paper-50/80">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </div>
            ))}
          </div>

          {/* Generated activities layer (overlays the dimmed thumbnails). */}
          <div
            className="absolute inset-0 flex flex-col gap-2.5 transition-all duration-500"
            style={{
              opacity: creating ? 1 : 0,
              transform: creating ? 'none' : 'translateY(14px)',
              pointerEvents: 'none',
            }}
          >
            <div className="rounded-xl border border-paper-300/70 bg-paper-50 p-3 shadow-sm">
              <div className="flex items-center justify-between text-[11px] text-ink-400">
                <span>Flashcards</span>
                <span>1 / 12</span>
              </div>
              <div className="font-display text-2xl font-medium text-center py-1.5">
                Bore da
              </div>
              <div className="text-center text-xs text-ink-500">Good morning</div>
            </div>
            <div className="rounded-xl border border-paper-300/70 bg-paper-50 p-3 shadow-sm">
              <p className="text-sm font-medium mb-2">How do you say “thank you”?</p>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <span className="rounded-md border border-emerald-500 bg-emerald-50 text-emerald-700 font-medium px-2 py-1.5">
                  Diolch
                </span>
                <span className="rounded-md border border-paper-300/70 text-ink-500 px-2 py-1.5">
                  Croeso
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Process stepper — names the story explicitly. */}
        <div className="flex items-center gap-2 mt-4">
          {PHASES.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1 last:flex-none">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-5 h-5 rounded-full grid place-items-center text-[10px] font-medium transition-colors duration-300 ${
                    i < phase
                      ? 'bg-emerald-500 text-paper-50'
                      : i === phase
                      ? 'bg-ink-900 text-paper-50'
                      : 'bg-paper-200 text-ink-400'
                  }`}
                >
                  {i < phase ? '✓' : i + 1}
                </span>
                <span
                  className={`text-[11px] transition-colors duration-300 ${
                    i <= phase ? 'text-ink-700' : 'text-ink-400'
                  }`}
                >
                  {label}
                </span>
              </div>
              {i < PHASES.length - 1 && (
                <span
                  className={`h-px flex-1 transition-colors duration-300 ${
                    i < phase ? 'bg-emerald-400' : 'bg-paper-300'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
