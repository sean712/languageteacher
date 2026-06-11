import { Component, type ReactNode } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';

// Renders a clear message instead of a blank page when the app can't start —
// either missing Supabase config (common on a fresh Vercel deploy) or an
// uncaught render error.
export default function AppGate({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured) {
    return (
      <Screen title="Configuration needed">
        <p>
          This deployment is missing its Supabase environment variables. Set
          both of these in your hosting provider (Vercel → Project → Settings →
          Environment Variables) and redeploy:
        </p>
        <ul className="font-mono text-sm mt-3 space-y-1">
          <li>VITE_SUPABASE_URL</li>
          <li>VITE_SUPABASE_PUBLISHABLE_KEY</li>
        </ul>
        <p className="mt-3 text-ink-500">
          They're inlined at build time, so a redeploy is required after adding
          them.
        </p>
      </Screen>
    );
  }
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('App crashed:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <Screen title="Something went wrong">
          <p>The app hit an unexpected error while loading.</p>
          <pre className="mt-3 text-xs bg-paper-200 rounded-lg p-3 overflow-auto">
            {this.state.error.message}
          </pre>
        </Screen>
      );
    }
    return this.props.children;
  }
}

function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-paper-100 text-ink-900 flex items-center justify-center px-6">
      <div className="max-w-md">
        <span className="font-display text-xl font-semibold tracking-tight">
          Lingua
        </span>
        <h1 className="font-display text-2xl font-semibold mt-4">{title}</h1>
        <div className="mt-3 text-ink-700 leading-relaxed">{children}</div>
      </div>
    </main>
  );
}
