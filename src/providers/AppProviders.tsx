/**
 * Composed application providers.
 *
 * Order matters: safe-area first (layout), then theme (everything visual reads it), then
 * the on-device store, then the in-memory result.
 *
 * There is no query client and no auth provider, because there is no server. WalletWise
 * reads a bundled catalog and computes on the device, so the only asynchronous work in
 * the whole app is one storage read at startup — which `LocalStoreProvider` does, once.
 * A fetch-and-cache layer here would model a race that cannot happen.
 *
 * `LastResultProvider` is innermost: it holds a recommendation that belongs to one
 * purchase, so it must be remounted by anything above it rather than outlive it.
 */
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LastResultProvider } from '@/features/local/LastResult';
import { LocalStoreProvider } from '@/features/local/LocalStore';
import { ThemeProvider } from '@/theme/ThemeProvider';

export function AppProviders({ children }: { readonly children: ReactNode }) {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <LocalStoreProvider>
          <LastResultProvider>{children}</LastResultProvider>
        </LocalStoreProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
