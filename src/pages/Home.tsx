import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="min-h-dvh bg-paper-100 text-ink-900 overflow-x-clip">
      <SiteNav />
      <Hero />
      <LogoStrip />
      <HowItWorks />
      <ValueProps />
      <ShowcaseCTA />
      <Footer />
    </div>
  );
}

function SiteNav() {
  return (
    <header className="max-w-5xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
      <Link to="/" className="font-display text-xl font-semibold tracking-tight">
        Lingua
      </Link>
      <nav className="flex items-center gap-1 sm:gap-2 text-sm">
        <Link
          to="/demo-teacher"
          className="px-3 py-2 rounded-lg text-ink-700 hover:text-ink-900 hover:bg-paper-200/60 transition-colors"
        >
          View demo
        </Link>
        <Link
          to="/connect"
          className="px-3.5 py-2 rounded-lg bg-ink-900 text-paper-50 font-medium hover:bg-ink-700 transition-colors"
        >
          Connect channel
        </Link>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="max-w-5xl mx-auto px-5 sm:px-8 pt-12 sm:pt-20 pb-14">
      <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-10 items-center">
        <div>
          <span className="inline-flex items-center gap-2 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            For YouTube educators
          </span>

          <h1 className="font-display font-semibold tracking-tight text-[2.6rem] leading-[1.05] sm:text-6xl sm:leading-[1.02] mt-5">
            Turn your videos
            <br />
            into a{' '}
            <span className="text-emerald-600 italic">course.</span>
          </h1>

          <p className="mt-6 text-lg text-ink-700 leading-relaxed max-w-md">
            Lingua reads your YouTube channel and automatically builds
            flashcards, quizzes and practice from every lesson — so your
            audience does more than watch. They learn.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:items-center">
            <Link
              to="/connect"
              className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl bg-emerald-600 text-paper-50 font-medium hover:bg-emerald-700 transition-colors shadow-sm"
            >
              Connect your channel
            </Link>
            <Link
              to="/demo-teacher"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-3.5 rounded-xl text-ink-900 font-medium hover:bg-paper-200/70 transition-colors"
            >
              See a live example
              <span aria-hidden>→</span>
            </Link>
          </div>

          <p className="mt-5 text-sm text-ink-400">
            Free to start · No editing your videos · Works with your existing
            uploads
          </p>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

// A static "proof" mockup: one video on the left transforming into the
// activities Lingua generates from it. Purely decorative.
function HeroVisual() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 bg-gradient-to-tr from-emerald-50/60 to-transparent rounded-[2rem] -z-10" />
      <div className="rounded-2xl bg-paper-50 border border-paper-300/70 shadow-[0_1px_0_rgba(0,0,0,0.02),0_18px_40px_-18px_rgba(26,25,22,0.25)] p-4 sm:p-5">
        {/* source video */}
        <div className="flex gap-3 items-center">
          <div className="relative w-28 h-[4.5rem] rounded-lg bg-ink-900 overflow-hidden flex-shrink-0">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-700/40 to-ink-900" />
            <span className="absolute inset-0 grid place-items-center text-paper-50/90">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-900 leading-snug">
              Welsh greetings — your first 6 phrases
            </p>
            <p className="text-xs text-ink-400 mt-1">YouTube · 4:02</p>
          </div>
        </div>

        <div className="flex items-center gap-3 my-4">
          <span className="h-px flex-1 bg-paper-300/80" />
          <span className="text-[11px] uppercase tracking-wider text-ink-400">
            Lingua generates
          </span>
          <span className="h-px flex-1 bg-paper-300/80" />
        </div>

        {/* generated flashcard */}
        <div className="rounded-xl border border-paper-300/70 bg-paper-50 p-4">
          <div className="flex items-center justify-between text-[11px] text-ink-400 mb-2">
            <span>Flashcards</span>
            <span>1 / 12</span>
          </div>
          <div className="font-display text-2xl font-medium text-center py-3">
            Bore da
          </div>
          <div className="text-center text-sm text-ink-500">Good morning</div>
        </div>

        {/* generated quiz */}
        <div className="rounded-xl border border-paper-300/70 bg-paper-50 p-4 mt-3">
          <p className="text-sm font-medium mb-2.5">
            How do you say “thank you”?
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Option>Diolch</Option>
            <Option dim>Croeso</Option>
            <Option dim>Nos da</Option>
            <Option dim>Hwyl</Option>
          </div>
        </div>
      </div>
    </div>
  );
}

function Option({
  children,
  dim,
}: {
  children: React.ReactNode;
  dim?: boolean;
}) {
  return (
    <span
      className={`rounded-lg border px-3 py-2 ${
        dim
          ? 'border-paper-300/70 text-ink-500'
          : 'border-emerald-500 bg-emerald-50 text-emerald-700 font-medium'
      }`}
    >
      {children}
    </span>
  );
}

function LogoStrip() {
  return (
    <section className="max-w-5xl mx-auto px-5 sm:px-8 pb-6">
      <p className="text-center text-sm text-ink-400">
        Built for creators teaching{' '}
        <span className="text-ink-700">languages, music, code, anything</span>{' '}
        — one video at a time.
      </p>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: '01',
      title: 'Connect your channel',
      body: 'Link your YouTube channel once. Lingua imports your whole back catalogue in seconds — no re-uploading, no editing.',
    },
    {
      n: '02',
      title: 'We do the work',
      body: 'Every video is transcribed and turned into flashcards, quizzes, gap-fills and matching exercises — automatically, in the language you teach.',
    },
    {
      n: '03',
      title: 'Your audience practises',
      body: 'Learners get a clean, mobile-first page per channel. New uploads become new lessons on their own.',
    },
  ];
  return (
    <section className="max-w-5xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
      <SectionLabel>How it works</SectionLabel>
      <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-3 max-w-xl">
        From upload to interactive lesson, hands-free.
      </h2>
      <div className="grid sm:grid-cols-3 gap-px bg-paper-300/60 rounded-2xl overflow-hidden border border-paper-300/60 mt-10">
        {steps.map((s) => (
          <div key={s.n} className="bg-paper-100 p-6 sm:p-7">
            <div className="font-display text-emerald-600 text-lg">{s.n}</div>
            <h3 className="font-medium text-lg mt-3">{s.title}</h3>
            <p className="text-ink-500 text-sm leading-relaxed mt-2">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ValueProps() {
  const props = [
    {
      title: 'Give your audience more',
      body: 'Watching is passive. Practice is what makes content stick — and what keeps subscribers coming back to you, not the algorithm.',
    },
    {
      title: 'Completely automated',
      body: 'No spreadsheets, no manual question-writing. Publish a video; the lesson builds itself while you sleep.',
    },
    {
      title: 'Your brand, your page',
      body: 'A dedicated space at your own handle. Learners browse your lessons by level — your name on every one.',
    },
    {
      title: 'Built mobile-first',
      body: 'Fast, swipeable flashcards and quizzes designed for the phone, where your audience already watches.',
    },
  ];
  return (
    <section className="bg-paper-50 border-y border-paper-300/60">
      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
        <SectionLabel>Why creators use Lingua</SectionLabel>
        <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-3 max-w-xl">
          You already made the content. Get more from it.
        </h2>
        <div className="grid sm:grid-cols-2 gap-x-12 gap-y-10 mt-12">
          {props.map((p) => (
            <div key={p.title} className="border-t border-paper-300/70 pt-5">
              <h3 className="font-display text-xl font-medium">{p.title}</h3>
              <p className="text-ink-500 leading-relaxed mt-2">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ShowcaseCTA() {
  return (
    <section className="max-w-5xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
      <div className="rounded-3xl bg-ink-900 text-paper-100 px-7 sm:px-14 py-12 sm:py-16 text-center">
        <h2 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.05]">
          Your channel is a course
          <br className="hidden sm:block" /> waiting to happen.
        </h2>
        <p className="text-paper-300 mt-5 max-w-md mx-auto leading-relaxed">
          Connect your YouTube channel and watch your first lessons build
          themselves.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/connect"
            className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl bg-emerald-500 text-paper-50 font-medium hover:bg-emerald-600 transition-colors"
          >
            Connect your channel
          </Link>
          <Link
            to="/demo-teacher"
            className="inline-flex items-center justify-center gap-1.5 px-6 py-3.5 rounded-xl border border-paper-300/30 text-paper-100 font-medium hover:bg-paper-100/10 transition-colors"
          >
            Explore the demo
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="max-w-5xl mx-auto px-5 sm:px-8 pb-12">
      <div className="border-t border-paper-300/70 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-ink-400">
        <span className="font-display text-ink-700 font-semibold">Lingua</span>
        <span>© {new Date().getFullYear()} Lingua. Made for educators.</span>
      </div>
    </footer>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-600">
      {children}
    </span>
  );
}
