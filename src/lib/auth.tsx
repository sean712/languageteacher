import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { storeProviderTokens } from './google';
import { syncLocalProgressToServer } from './progress';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const syncedRef = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // A Google sign-in that requested YouTube access carries provider
      // tokens on exactly this one session — persist them server-side now
      // (no-op for every other sign-in; see lib/google.ts).
      void storeProviderTokens(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Once per session: merge any anonymous local progress into the account.
  useEffect(() => {
    if (session?.user && !syncedRef.current) {
      syncedRef.current = true;
      syncLocalProgressToServer(session.user.id);
    }
  }, [session]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, loading, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
