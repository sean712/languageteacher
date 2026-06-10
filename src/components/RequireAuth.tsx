import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

// Gate a route behind a logged-in creator. While the session is resolving we
// render nothing (brief); unauthenticated users are sent to /login with the
// intended destination so the magic link returns them here.
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="min-h-dvh flex items-center justify-center text-ink-400">
        Loading…
      </main>
    );
  }
  if (!session) {
    return (
      <Navigate to="/login" replace state={{ from: location.pathname }} />
    );
  }
  return <>{children}</>;
}
