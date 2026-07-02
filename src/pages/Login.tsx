import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { signInWithGoogle } from '../lib/google';

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

  const google = async () => {
    setError(null);
    const { error: err } = await signInWithGoogle(next);
    if (err) {
      setStatus('error');
      setError(err.message);
    }
    // On success the browser navigates to Google — nothing more to do here.
  };

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
              Sign in
            </span>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-3">
              Welcome to Lingua.
            </h1>
            <p className="text-ink-500 mt-3 leading-relaxed">
              Continue with Google, or get a one-click sign-in link by email —
              no password to remember. Save lessons, track progress, and
              manage your channels.
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
              <>
              <button
                type="button"
                onClick={google}
                className="mt-8 w-full inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl border border-paper-300 bg-paper-50 font-medium hover:bg-paper-200 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.7 1.22 9.19 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                Continue with Google
              </button>
              <div className="mt-6 flex items-center gap-3 text-xs text-ink-400">
                <span className="h-px flex-1 bg-paper-300" />
                or use email
                <span className="h-px flex-1 bg-paper-300" />
              </div>
              <form onSubmit={send} className="mt-6 flex flex-col gap-4">
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
              </form>
              </>
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
            Where watching
            <span className="text-emerald-400"> becomes learning.</span>
          </p>
          <p className="text-paper-300 mt-4 leading-relaxed">
            Save lessons, track your progress, and practise with the creators
            you follow.
          </p>
        </div>
        <p className="relative text-sm text-paper-300/70">
          Built for educators. Made for learners.
        </p>
      </aside>
    </main>
  );
}
