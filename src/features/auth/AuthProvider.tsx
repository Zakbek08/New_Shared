/**
 * Session context.
 *
 * Owns exactly one thing: the current Supabase session, and keeping the Query
 * cache honest about it. When the user changes, every cached row belongs to the
 * previous user and must go — that clearing is the whole reason this provider
 * sits above `QueryClientProvider`'s consumers rather than being a plain hook.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';

import { getSupabaseClient } from '@/lib/supabase';
import { captureException } from '@/services/analytics';

export interface AuthContextValue {
  readonly session: Session | null;
  readonly userId: string | null;
  /** True until the persisted session has been read from the keystore. */
  readonly isInitialising: boolean;
  readonly isSignedIn: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [isInitialising, setIsInitialising] = useState(true);

  const handleSessionChange = useCallback(
    (next: Session | null, previousUserId: string | null) => {
      setSession(next);

      // A different user (including signing out) invalidates every cached row.
      // Reusing another user's cache would be a data-leak bug that RLS cannot
      // catch, because the data never leaves the device.
      if (next?.user.id !== previousUserId) {
        queryClient.clear();
      }
    },
    [queryClient],
  );

  useEffect(() => {
    let isMounted = true;
    let currentUserId: string | null = null;

    const supabase = getSupabaseClient();

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;
        currentUserId = data.session?.user.id ?? null;
        setSession(data.session);
      })
      .catch((cause: unknown) => {
        // A keystore read failure must not wedge the app on a splash screen;
        // treat it as "not signed in" and let the user sign in again.
        captureException(cause, { stage: 'auth_get_session' });
      })
      .finally(() => {
        if (isMounted) setIsInitialising(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!isMounted) return;
      const previous = currentUserId;
      currentUserId = next?.user.id ?? null;
      handleSessionChange(next, previous);
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [handleSessionChange]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      userId: session?.user.id ?? null,
      isInitialising,
      isSignedIn: session !== null,
    }),
    [session, isInitialising],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}

/**
 * Session state without requiring the provider.
 *
 * Lets a leaf component render in isolation — in a test, or a preview harness —
 * without a full provider tree.
 */
export function useOptionalAuth(): AuthContextValue {
  return (
    useContext(AuthContext) ?? {
      session: null,
      userId: null,
      isInitialising: false,
      isSignedIn: false,
    }
  );
}
