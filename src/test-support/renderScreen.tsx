/**
 * Render helper for route components.
 *
 * A screen needs the theme (colours and type), safe-area insets (`Screen` reads
 * them) and a query client (any hook that fetches or mutates). Building that stack
 * by hand in each test invites one of them to be quietly forgotten, at which point
 * the failure looks like a bug in the screen.
 *
 * Safe-area metrics are supplied explicitly rather than measured, so layout is the
 * same on every machine.
 */
import type { ReactElement, ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/theme/ThemeProvider';

/** iPhone-ish insets. Fixed, so a snapshot of padding cannot drift. */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * A query client with retries off.
 *
 * A test that exercises a failure path should see the failure once, immediately,
 * rather than waiting out a retry schedule.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function ScreenHarness({
  children,
  queryClient,
  scheme = 'light',
}: {
  readonly children: ReactNode;
  readonly queryClient?: QueryClient;
  readonly scheme?: 'light' | 'dark';
}) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider initialPreference={scheme}>
        <QueryClientProvider client={queryClient ?? createTestQueryClient()}>
          {children}
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export function renderScreen(
  ui: ReactElement,
  options: { readonly queryClient?: QueryClient; readonly scheme?: 'light' | 'dark' } = {},
): RenderResult {
  return render(
    <ScreenHarness queryClient={options.queryClient} scheme={options.scheme}>
      {ui}
    </ScreenHarness>,
  );
}
