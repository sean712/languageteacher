import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import HeroAnimation from '../components/HeroAnimation';

// Landing page. Design intent (Sean, 2026-07-19): premium and innovative but
// classy — contrast and craft, not shine. Brass (gold-*) appears only in
// hairlines, numerals and eyebrow labels; dark sections use pine, not black;
// every section shares the same max-w-6xl grid so edges align page-long.
export default function Home() {
  return (
    <div className="min-h-dvh bg-paper-100 text-ink-900 overflow-x-clip">
      <SiteNav />
      <Hero />
      <Ribbon />
      <HowItWorks />
      <Showcase />
      <ValueProps />
      <RevShare />
      <Footer />
    </div>
  );
}

const CONTAINER = 'max-w-6xl mx-auto px-5 sm:px-8';

function SiteNav() {
  const { session } = useAuth();
  return (
    <header className={`${CONTAINER} h-18 sm:h-20 flex items-center justify-between`}>
      <Link to="/" className="font-display text-[1.35rem] font-semibold tracking-tight">
        Lingua<span className="text-emerald-500">.</span>
      </Link>
      <nav className="flex items-center gap-1 sm:gap-2 text-sm">
        <Link
          to="/demo-teacher"
          className="hidden sm:inline-flex px-3 py-2 rounded-lg text-ink-700 hover:text-ink-900 hover:bg-paper-200/60 transition-colors"
        >
          Live demo
        </Link>
        <Link
          to={session ? '/dashboard' : '/login'}
          className="px-3 py-2 rounded-lg text-ink-700 hover:text-ink-900 hover:bg-paper-200/60 transition-colors"
        >
          {session ? 'Dashboard' : 'Log in'}
        </Link>
        <Link
          to={session ? '/dashboard' : '/connect'}
          className="px-4 py-2.5 rounded-full bg-ink-900 text-paper-50 font-medium hover:bg-pine-900 transition-colors"
        >
          {session ? 'My channels' : 'Get started'}
        </Link>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative">
      {/* Texture: faint dot grid + a soft emerald wash, both fading out. */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-[34rem] bg-dotgrid" />
      <div
        aria-hidden
        className="absolute -top-40 right-[-10%] w-[36rem] h-[36rem] rounded-full -z-0"
        style={{
          background:
            'radial-gradient(circle, rgba(22,128,92,0.07) 0%, transparent 65%)',
        }}
      />

      <div className={`${CONTAINER} relative pt-10 sm:pt-16 pb-16 sm:pb-24`}>
        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-14 items-center">
          <div>
            <span className="animate-rise eyebrow text-gold-600">
              For YouTube educators
            </span>

            <h1
              className="animate-rise font-display font-semibold tracking-tight text-balance text-[2.9rem] leading-[1.02] sm:text-[4.4rem] sm:leading-[0.98] mt-6"
              style={{ animationDelay: '60ms' }}
            >
              Turn your videos into a{' '}
              <em className="text-emerald-600 font-semibold">living course.</em>
            </h1>

            <p
              className="animate-rise mt-7 text-lg sm:text-xl text-ink-700 leading-relaxed max-w-lg"
              style={{ animationDelay: '120ms' }}
            >
              Lingua reads your channel and builds interactive lessons from
              every video — flashcards, quizzes, pronunciation, an AI tutor.
              Your audience stops watching and starts learning.
            </p>

            <div
              className="animate-rise mt-9 flex flex-col sm:flex-row gap-3 sm:items-center"
              style={{ animationDelay: '180ms' }}
            >
              <Link
                to="/connect"
                className="inline-flex items-center justify-center px-7 py-4 rounded-full bg-emerald-600 text-paper-50 font-medium hover:bg-emerald-700 transition-colors shadow-[0_10px_30px_-12px_rgba(14,106,75,0.5)]"
              >
                Connect your channel
              </Link>
              <Link
                to="/demo-teacher"
                className="group inline-flex items-center justify-center gap-2 px-5 py-4 rounded-full font-medium text-ink-900 border border-ink-900/15 hover:border-ink-900/40 transition-colors"
              >
                See a live example
                <span aria-hidden className="group-hover:translate-x-0.5 transition-transform">
                  →
                </span>
              </Link>
            </div>

            {/* Product truths, set like a masthead fact row. */}
            <dl
              className="animate-rise mt-12 grid grid-cols-3 max-w-lg divide-x divide-paper-300/80"
              style={{ animationDelay: '240ms' }}
            >
              {[
                ['Whole catalogue', 'imported in minutes'],
                ['Five activities', 'built per lesson'],
                ['Every upload', 'published on its own'],
              ].map(([t, b]) => (
                <div key={t} className="px-3 sm:px-4 first:pl-0 last:pr-0">
                  <dt className="font-display text-[0.95rem] sm:text-lg font-semibold leading-tight">
                    {t}
                  </dt>
                  <dd className="text-[0.7rem] sm:text-[0.8rem] text-ink-500 mt-1 leading-snug">
                    {b}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="animate-rise" style={{ animationDelay: '160ms' }}>
            <HeroAnimation />
          </div>
        </div>
      </div>
    </section>
  );
}

function Ribbon() {
  return (
    <section className="border-y border-paper-300/70 bg-paper-50">
      <div className={`${CONTAINER} py-5 flex items-center justify-center gap-4 text-center`}>
        <Diamond />
        <p className="font-display text-[1.05rem] sm:text-lg text-ink-700">
          Built for creators teaching{' '}
          <em className="text-ink-900">languages</em> today —{' '}
          <span className="text-ink-500">music, code and more soon.</span>
        </p>
        <Diamond />
      </div>
    </section>
  );
}

function Diamond() {
  return (
    <span
      aria-hidden
      className="hidden sm:block w-1.5 h-1.5 rotate-45 bg-gold-400 flex-shrink-0"
    />
  );
}

function HowItWorks() {
  const steps = [
    {
      n: '01',
      title: 'Connect your channel',
      body: 'Link your YouTube channel once — with Google, in one tap. Lingua imports your whole back catalogue. No re-uploading, no editing, nothing to maintain.',
    },
    {
      n: '02',
      title: 'Lingua does the work',
      body: 'Every video is read, transcribed and turned into flashcards, quizzes, gap-fills, matching and speaking practice — in the language you teach, automatically.',
    },
    {
      n: '03',
      title: 'Your audience practises',
      body: 'Learners get a beautiful page at your name, on any phone. When you upload, a new lesson appears by itself. Your channel quietly becomes a school.',
    },
  ];
  return (
    <section className={`${CONTAINER} py-20 sm:py-28`}>
      <div className="grid lg:grid-cols-[0.85fr_1.15fr] gap-10 lg:gap-20">
        <div>
          <span className="eyebrow text-gold-600">How it works</span>
          <h2 className="font-display text-3xl sm:text-[2.75rem] sm:leading-[1.08] font-semibold tracking-tight text-balance mt-4">
            From upload to interactive lesson, hands-free.
          </h2>
          <p className="text-ink-500 leading-relaxed mt-5 max-w-sm">
            You keep making videos the way you always have. Lingua turns each
            one into something your audience can actually do.
          </p>
        </div>

        <ol className="lg:pt-2">
          {steps.map((s, i) => (
            <li
              key={s.n}
              className={`grid grid-cols-[4.5rem_1fr] sm:grid-cols-[5.5rem_1fr] gap-5 sm:gap-8 py-8 ${
                i > 0 ? 'border-t border-paper-300/70' : 'pt-0'
              }`}
            >
              <span className="font-display text-[2.6rem] sm:text-5xl font-normal text-gold-500 leading-none select-none">
                {s.n}
              </span>
              <div>
                <h3 className="font-display text-xl sm:text-2xl font-medium">{s.title}</h3>
                <p className="text-ink-500 leading-relaxed mt-2.5">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// Real product surfaces, recreated faithfully — the innovation is easier to
// show than to claim. Decorative only (aria-hidden interactions).
function Showcase() {
  return (
    <section className="bg-paper-50 border-y border-paper-300/70">
      <div className={`${CONTAINER} py-20 sm:py-28`}>
        <div className="max-w-xl">
          <span className="eyebrow text-gold-600">What learners get</span>
          <h2 className="font-display text-3xl sm:text-[2.75rem] sm:leading-[1.08] font-semibold tracking-tight text-balance mt-4">
            Watching becomes doing.
          </h2>
          <p className="text-ink-500 leading-relaxed mt-5">
            Every lesson opens into real practice — swipeable flashcards with
            native-quality audio, quizzes, gap-fills and an AI tutor that knows
            the video inside out.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-5 sm:gap-6 mt-12 items-start">
          {/* Flashcard */}
          <MockCard label="Flashcards · 3 of 12">
            <div className="py-7 text-center relative">
              <div className="font-display text-[2rem] font-semibold">Bore da</div>
              <div className="text-sm text-ink-500 mt-1.5">Good morning</div>
              <span
                aria-hidden
                className="absolute bottom-0 right-1 w-9 h-9 rounded-full grid place-items-center text-emerald-600 bg-emerald-50"
              >
                <SpeakerGlyph />
              </span>
            </div>
            <MockCaption>Tap any word to hear it spoken.</MockCaption>
          </MockCard>

          {/* Quiz */}
          <MockCard label="Quiz · question 2 of 6">
            <p className="text-[0.95rem] font-medium mt-1">
              How would you say “thank you”?
            </p>
            <div className="flex flex-col gap-2 mt-3 text-sm">
              <span className="rounded-lg border border-emerald-500 bg-emerald-50 text-emerald-700 font-medium px-3 py-2.5">
                Diolch ✓
              </span>
              <span className="rounded-lg border border-paper-300 text-ink-500 px-3 py-2.5">
                Croeso
              </span>
              <span className="rounded-lg border border-paper-300 text-ink-500 px-3 py-2.5">
                Nos da
              </span>
            </div>
            <MockCaption>Generated from the video, not a template.</MockCaption>
          </MockCard>

          {/* AI tutor */}
          <MockCard label="AI tutor">
            <div className="flex flex-col gap-2.5 mt-1 text-sm">
              <span className="self-end max-w-[85%] rounded-2xl rounded-br-md bg-ink-900 text-paper-50 px-3.5 py-2.5">
                When do I use “bore da” vs “nos da”?
              </span>
              <span className="self-start max-w-[90%] rounded-2xl rounded-bl-md bg-paper-100 border border-paper-300/70 px-3.5 py-2.5 leading-relaxed">
                “Bore da” is for the morning — like in the video’s greeting.
                “Nos da” says goodnight when leaving.
              </span>
            </div>
            <MockCaption>Grounded in each lesson’s transcript.</MockCaption>
          </MockCard>
        </div>
      </div>
    </section>
  );
}

function MockCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-paper-50 border border-paper-300/80 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_24px_50px_-24px_rgba(23,23,18,0.28)] p-5">
      <div className="text-[11px] uppercase tracking-wider text-ink-400">{label}</div>
      {children}
    </div>
  );
}

function MockCaption({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-ink-400 border-t border-paper-300/60 mt-4 pt-3">
      {children}
    </p>
  );
}

function SpeakerGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
      <path d="M15.5 8.5a5 5 0 010 7" />
      <path d="M18.5 5.5a9.5 9.5 0 010 13" />
    </svg>
  );
}

function ValueProps() {
  const props = [
    {
      title: 'Practice makes them stay',
      body: 'Watching is passive. Doing is what makes learning stick — and what brings your audience back to you, not the algorithm.',
    },
    {
      title: 'Zero extra work',
      body: 'No question-writing, no spreadsheets, no new tools to learn. Publish a video; the lesson builds itself while you sleep.',
    },
    {
      title: 'Your name on the door',
      body: 'A dedicated space at your own handle — your videos, your lessons, your brand on every card.',
    },
    {
      title: 'Made for the phone',
      body: 'Swipeable, tappable, fast. Designed for the device your audience already watches you on.',
    },
  ];
  return (
    <section className={`${CONTAINER} py-20 sm:py-28`}>
      <span className="eyebrow text-gold-600">Why creators use Lingua</span>
      <h2 className="font-display text-3xl sm:text-[2.75rem] sm:leading-[1.08] font-semibold tracking-tight text-balance mt-4 max-w-xl">
        You already made the content. Get more from it.
      </h2>
      <div className="grid sm:grid-cols-2 gap-x-14 gap-y-10 mt-12">
        {props.map((p) => (
          <div key={p.title} className="border-t border-paper-300/80 pt-5">
            <h3 className="font-display text-xl sm:text-[1.35rem] font-medium">{p.title}</h3>
            <p className="text-ink-500 leading-relaxed mt-2.5 max-w-md">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// The money section — creators earn a share of learner subscriptions.
// Dark pine, brass hairlines: the premium close, with the CTA inside it.
function RevShare() {
  const points = [
    {
      title: 'Learners subscribe',
      body: 'Premium practice — AI feedback, tutoring and more — is a paid subscription for your audience.',
    },
    {
      title: 'You earn a share',
      body: 'Revenue is shared with creators, driven by how much learners practise with your lessons.',
    },
    {
      title: 'Paid out monthly',
      body: 'Transparent engagement numbers, straight to your bank. Your content keeps working after upload day.',
    },
  ];
  return (
    <section className="bg-pine-950 bg-pine-lines text-paper-100">
      <div className={`${CONTAINER} py-20 sm:py-28`}>
        <div className="flex items-center gap-3">
          <span className="eyebrow text-gold-400">For creators</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-paper-100/70 border border-paper-100/25 rounded-full px-2.5 py-1">
            Payouts launching soon
          </span>
        </div>

        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-12 lg:gap-20 mt-6">
          <div>
            <h2 className="font-display text-4xl sm:text-[3.4rem] sm:leading-[1.03] font-semibold tracking-tight text-balance">
              Your teaching
              <br />
              should <em className="text-gold-400 font-semibold">earn.</em>
            </h2>
            <p className="text-paper-100/70 text-lg leading-relaxed mt-6 max-w-md">
              Lingua isn’t just a tool — it’s a way for your back catalogue to
              pay you. When learners subscribe to practise, the creators whose
              lessons they use share in that revenue.
            </p>
            <div className="mt-9 flex flex-col sm:flex-row gap-3 sm:items-center">
              <Link
                to="/connect"
                className="inline-flex items-center justify-center px-7 py-4 rounded-full bg-emerald-500 text-paper-50 font-medium hover:bg-emerald-600 transition-colors"
              >
                Connect your channel
              </Link>
              <Link
                to="/demo-teacher"
                className="group inline-flex items-center justify-center gap-2 px-5 py-4 rounded-full font-medium text-paper-100 border border-paper-100/25 hover:border-paper-100/60 transition-colors"
              >
                Explore the demo
                <span aria-hidden className="group-hover:translate-x-0.5 transition-transform">
                  →
                </span>
              </Link>
            </div>
            <p className="text-sm text-paper-100/50 mt-6">
              Free to connect · Early creators get in before payouts launch
            </p>
          </div>

          <ol className="lg:pt-3">
            {points.map((p, i) => (
              <li
                key={p.title}
                className={`grid grid-cols-[3rem_1fr] gap-5 py-7 ${
                  i > 0 ? 'border-t border-paper-100/12' : 'pt-0'
                }`}
              >
                <span className="font-display text-3xl text-gold-400/90 leading-none select-none">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-display text-xl font-medium">{p.title}</h3>
                  <p className="text-paper-100/60 leading-relaxed mt-2">{p.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-pine-950 text-paper-100 border-t border-paper-100/10">
      <div className={`${CONTAINER} py-10 flex flex-col sm:flex-row items-center justify-between gap-4`}>
        <div className="text-center sm:text-left">
          <span className="font-display text-lg font-semibold">
            Lingua<span className="text-emerald-500">.</span>
          </span>
          <p className="text-sm text-paper-100/50 mt-0.5">
            Every video, a lesson.
          </p>
        </div>
        <nav className="flex items-center gap-6 text-sm text-paper-100/60">
          <Link to="/demo-teacher" className="hover:text-paper-100 transition-colors">
            Live demo
          </Link>
          <Link to="/connect" className="hover:text-paper-100 transition-colors">
            For creators
          </Link>
          <Link to="/login" className="hover:text-paper-100 transition-colors">
            Log in
          </Link>
        </nav>
        <span className="text-sm text-paper-100/40">
          © {new Date().getFullYear()} Lingua
        </span>
      </div>
    </footer>
  );
}
