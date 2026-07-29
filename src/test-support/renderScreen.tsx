/**
 * Render helper for route components.
 *
 * A screen needs the theme (colours and type) and safe-area insets (`Screen` reads
 * them). Building that stack by hand in each test invites one of them to be quietly
 * forgotten, at which point the failure looks like a bug in the screen.
 *
 * There is no query client, because the app has no server. `LocalStoreProvider` is
 * deliberately **not** included either: a test that needs stored state should say what
 * that state is, and the screens that read it are tested with the hook stubbed. A
 * harness that silently supplied an empty wallet would make "no cards" the invisible
 * default for every assertion.
 *
 * Safe-area metrics are supplied explicitly rather than measured, so layout is the same
 * on every machine.
 */
import type { ReactElement, ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/theme/ThemeProvider';

/** iPhone-ish insets. Fixed, so a snapshot of padding cannot drift. */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export function ScreenHarness({
  children,
  scheme = 'light',
}: {
  readonly children: ReactNode;
  readonly scheme?: 'light' | 'dark';
}) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider initialPreference={scheme}>{children}</ThemeProvider>
    </SafeAreaProvider>
  );
}

export function renderScreen(
  ui: ReactElement,
  options: { readonly scheme?: 'light' | 'dark' } = {},
): RenderResult {
  return render(<ScreenHarness scheme={options.scheme}>{ui}</ScreenHarness>);
}
