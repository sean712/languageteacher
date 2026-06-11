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
      options: {
        emailRedirectTo: `${window.location.origin}${next}`,
      },
    });
    if (err) {
      setStatus('error');
      setError(err.message);
      return;
    }
    setStatus('sent');
  };

  return (
    <main className="min-h-dvh bg-paper-100 text-ink-900">
      <header className="max-w-2xl mx-auto px-5 sm:px-8 h-16 flex items-center">
        <Link to="/" className="font-display text-xl font-semibold tracking-tight">
          Lingua
        </Link>
      </header>

      <section className="max-w-md mx-auto px-5 sm:px-8 pt-12 sm:pt-20">
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-600">
          Creator sign-in
        </span>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-3">
          Log in to Lingua.
        </h1>
        <p className="text-ink-500 mt-3 leading-relaxed">
          Enter your email and we'll send you a one-click sign-in link. No
          password needed.
        </p>

        {status === 'sent' ? (
          <div className="mt-8 rounded-2xl border border-emerald-100 bg-emerald-50 p-6">
            <h2 className="font-display text-xl font-medium text-emerald-700">
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
                className="mt-1.5 w-full rounded-xl border border-paper-300 bg-paper-50 px-4 py-3 text-[0.95rem] focus:outline-none focus:border-ink-400"
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
            <p className="text-xs text-ink-400">
              Google sign-in is coming soon.
            </p>
          </form>
        )}
      </section>
    </main>
  );
}
