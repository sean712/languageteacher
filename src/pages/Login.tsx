import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Login() {
  const location = useLocation();
  // Where to land after clicking the magic link (defaults to the dashboard).
  const next =
    (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle',
  );
  const [error, setError] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('sending');
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}${next}` },
    });
    if (err) {
      setStatus('error');
      setError(err.message);
      return;
    }
    setStatus('sent');
  };

  return (
    <main className="min-h-dvh lg:grid lg:grid-cols-2 bg-paper-100 text-ink-900">
      {/* Form side */}
      <div className="flex flex-col min-h-dvh lg:min-h-0">
        <header className="px-5 sm:px-8 h-16 flex items-center">
          <Link to="/" className="font-display text-xl font-semibold tracking-tight">
            Lingua
          </Link>
        </header>

        <div className="flex-1 flex items-center px-5 sm:px-8 pb-16">
          <div className="w-full max-w-sm mx-auto animate-rise">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-600">
              Creator sign-in
            </span>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-3">
              Welcome back.
            </h1>
            <p className="text-ink-500 mt-3 leading-relaxed">
              Enter your email and we’ll send a one-click sign-in link — no
              password to remember.
            </p>

            {status === 'sent' ? (
              <div className="mt-8 rounded-2xl border border-emerald-100 bg-emerald-50 p-6 animate-rise">
                <div className="w-11 h-11 rounded-full bg-emerald-500 text-paper-50 grid place-items-center text-lg">
                  ✓
                </div>
                <h2 className="font-display text-xl font-medium text-emerald-700 mt-3">
                  Check your email
                </h2>
                <p className="text-sm text-ink-600 mt-2 leading-relaxed">
                  We sent a sign-in link to <strong>{email}</strong>. Open it on
                  this device to continue.
                </p>
                <button
                  type="button"
                  onClick={() => setStatus('idle')}
                  className="mt-4 text-sm font-medium text-emerald-600 hover:text-emerald-700"
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <form onSubmit={send} className="mt-8 flex flex-col gap-4">
                <label className="block">
                  <span className="text-sm font-medium">Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoCapitalize="off"
                    autoCorrect="off"
                    className="mt-1.5 w-full rounded-xl border border-paper-300 bg-paper-50 px-4 py-3 text-[0.95rem] transition-colors focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                  />
                </label>
                {status === 'error' && error && (
                  <p className="text-sm text-red-700">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={!email.trim() || status === 'sending'}
                  className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl bg-emerald-600 text-paper-50 font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40"
                >
                  {status === 'sending' ? 'Sending…' : 'Send me a sign-in link'}
                </button>
                <p className="text-xs text-ink-400">Google sign-in is coming soon.</p>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Brand side — desktop only. */}
      <aside className="hidden lg:flex relative overflow-hidden bg-ink-900 text-paper-100 flex-col justify-between p-12">
        <div
          aria-hidden
          className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-emerald-600/25 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl"
        />
        <span className="font-display text-lg font-semibold relative">Lingua</span>
        <div className="relative max-w-md">
          <p className="font-display text-3xl xl:text-4xl font-semibold leading-[1.15] tracking-tight">
            Your channel is a course
            <span className="text-emerald-400"> waiting to happen.</span>
          </p>
          <p className="text-paper-300 mt-4 leading-relaxed">
            Lingua turns your YouTube videos into interactive lessons —
            automatically — so your audience does more than watch.
          </p>
        </div>
        <p className="relative text-sm text-paper-300/70">
          Built for educators. Made for learners.
        </p>
      </aside>
    </main>
  );
}
