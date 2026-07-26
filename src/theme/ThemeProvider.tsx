/**
 * Theme context.
 *
 * Follows the OS appearance setting by default, and lets the user override it on
 * the Settings screen. Dark mode is a first-class requirement, not an
 * afterthought, so it is exercised by the component tests in both schemes.
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
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { darkTheme, lightTheme, type Theme } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  readonly theme: Theme;
  readonly preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Non-sensitive, but SecureStore is already wired so there is no reason not to. */
const PREFERENCE_KEY = 'walletwise.theme.preference';

const isThemePreference = (value: string | null): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

export function ThemeProvider({
  children,
  initialPreference = 'system',
}: {
  readonly children: ReactNode;
  readonly initialPreference?: ThemePreference;
}) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await SecureStore.getItemAsync(PREFERENCE_KEY);
        if (!cancelled && isThemePreference(stored)) setPreferenceState(stored);
      } catch {
        // A missing or unreadable preference is not worth surfacing; the system
        // scheme is a perfectly good answer.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void SecureStore.setItemAsync(PREFERENCE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const resolved = preference === 'system' ? (systemScheme ?? 'light') : preference;
    return {
      theme: resolved === 'dark' ? darkTheme : lightTheme,
      preference,
      setPreference,
    };
  }, [preference, setPreference, systemScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const context = useContext(ThemeContext);
  // Falling back to the light theme keeps a component renderable in isolation
  // (in a test, or a Storybook-style harness) without a provider.
  return context?.theme ?? lightTheme;
}

export function useThemePreference(): {
  readonly preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
} {
  const context = useContext(ThemeContext);
  if (context === null) {
    return { preference: 'system', setPreference: () => undefined };
  }
  return { preference: context.preference, setPreference: context.setPreference };
}
