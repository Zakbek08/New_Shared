/**
 * Composed application providers.
 *
 * Order matters: safe-area first (layout), then theme (everything visual reads
 * it), then TanStack Query (data).
 */
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/features/auth/AuthProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';

/**
 * Query defaults tuned for reward data.
 *
 * Catalog data changes slowly, so a five-minute stale window avoids refetching
 * rules on every screen. `retry: 1` keeps a flaky connection from silently
 * hammering the API. Mutations never retry: re-sending a wallet write is worse
 * than surfacing an error.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export function AppProviders({ children }: { readonly children: ReactNode }) {
  // `useState` rather than a module-level constant so each mount (including each
  // test) gets an isolated cache.
  const [queryClient] = useState(createQueryClient);

  // AuthProvider sits *inside* QueryClientProvider because it clears the cache
  // when the signed-in user changes, which needs `useQueryClient`.
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>{children}</AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
