/**
 * TanStack Query keys.
 *
 * Hierarchical, so `invalidateQueries({ queryKey: queryKeys.wallet.all })`
 * clears the whole wallet subtree in one call.
 *
 * No key contains a user id. RLS already scopes every read to `auth.uid()`, and
 * putting the id in a key would only leak it into devtools and cache dumps.
 */
export const queryKeys = {
  auth: {
    session: ['auth', 'session'] as const,
    profile: ['auth', 'profile'] as const,
  },
  catalog: {
    all: ['catalog'] as const,
    products: (search: string) => ['catalog', 'products', search] as const,
    product: (id: string) => ['catalog', 'product', id] as const,
    rules: (productId: string) => ['catalog', 'rules', productId] as const,
  },
  wallet: {
    all: ['wallet'] as const,
    cards: () => ['wallet', 'cards'] as const,
    card: (id: string) => ['wallet', 'card', id] as const,
  },
} as const;
