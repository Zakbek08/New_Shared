# API and data access

WalletWise has no bespoke backend. The client talks to Supabase over PostgREST, with RLS as
the authorisation layer. "API" here means the query contracts between the app and the
database.

**Status:** Phase 1 defines the contracts and ships the typed client. The hooks land with
their features in Phases 2-6.

---

## Access layers

```
Screen (app/)
   │  calls a hook, never a query
   ▼
Hook (src/features/*/hooks/)          TanStack Query: caching, retries, invalidation
   │  calls a typed function
   ▼
Query function (src/features/*/api/)  The only place Supabase is touched
   │
   ▼
Supabase client (src/lib/supabase.ts) Typed with Database, session in the keystore
   │
   ▼
Postgres + RLS                        Authorisation, non-negotiable
```

Rules:

- **A screen never imports the Supabase client.** It calls a hook.
- **A query function never contains business logic.** It fetches and maps; the domain layer
  decides.
- **Everything is typed through `Database`.** A column rename becomes a compile error.
- **Never pass a `user_id` from the client to scope a read.** RLS scopes it. A client-supplied
  filter is a suggestion; `auth.uid()` is the boundary.

---

## Client

```ts
import { getSupabaseClient } from '@/lib/supabase';

const supabase = getSupabaseClient(); // memoised, lazily constructed
```

| Setting                   | Value                       | Why                                                                                  |
| ------------------------- | --------------------------- | ------------------------------------------------------------------------------------ |
| `auth.storage`            | Chunked SecureStore adapter | Keystore-backed. AsyncStorage is unencrypted; a refresh token does not belong there. |
| `auth.flowType`           | `pkce`                      | Correct for a public client                                                          |
| `auth.detectSessionInUrl` | `false`                     | No URL bar on a device                                                               |
| `auth.autoRefreshToken`   | `true`                      |                                                                                      |
| `db.schema`               | `public`                    |                                                                                      |

SecureStore caps items at 2048 bytes and Supabase sessions can exceed that, so the adapter
splits values across `<key>__0…n` with a `<key>__count` key. A missing chunk reads back as
absent, so a partial write costs a sign-in rather than producing a corrupt session.

---

## Types

```ts
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database';

type UserCard = Tables<'user_cards'>;
type NewUserCard = TablesInsert<'user_cards'>;
```

Two deliberate type-level guards that codegen would not give you:

```ts
TablesUpdate<'users'>; // omits `role` — self-promotion fails at compile time
TablesInsert<'audit_logs'>; // `never` — written only by triggers
TablesUpdate<'purchase_queries'>; // `never` — immutable record
TablesUpdate<'verification_history'>; // `never` — append-only
```

---

## Query key convention

```ts
export const queryKeys = {
  catalog: {
    all: ['catalog'] as const,
    products: (search?: string) => ['catalog', 'products', search ?? ''] as const,
    product: (id: string) => ['catalog', 'product', id] as const,
    rules: (productId: string) => ['catalog', 'rules', productId] as const,
    categories: () => ['catalog', 'categories'] as const,
    merchants: (search: string) => ['catalog', 'merchants', search] as const,
  },
  wallet: {
    all: ['wallet'] as const,
    cards: () => ['wallet', 'cards'] as const,
    card: (id: string) => ['wallet', 'card', id] as const,
    snapshot: () => ['wallet', 'snapshot'] as const,
  },
  offers: { all: ['offers'] as const, active: () => ['offers', 'active'] as const },
  caps: { all: ['caps'] as const, forCard: (id: string) => ['caps', id] as const },
  preferences: { all: ['preferences'] as const },
  recommendations: {
    all: ['recommendations'] as const,
    recent: (limit: number) => ['recommendations', 'recent', limit] as const,
    detail: (id: string) => ['recommendations', id] as const,
  },
} as const;
```

Keys are hierarchical so `invalidateQueries({ queryKey: ['wallet'] })` clears the whole
subtree. Query keys never contain a user id — RLS already scopes the data, and putting the
id in the key would leak it into devtools and cache dumps.

## Query defaults

`src/providers/AppProviders.tsx`:

| Option                 | Value   | Reason                                               |
| ---------------------- | ------- | ---------------------------------------------------- |
| `staleTime`            | 5 min   | Catalog data changes slowly                          |
| `gcTime`               | 30 min  |                                                      |
| `retry` (queries)      | 1       | A flaky connection should not hammer the API         |
| `retry` (mutations)    | 0       | **Re-sending a wallet write is worse than an error** |
| `refetchOnWindowFocus` | `false` | Wrong idiom on mobile                                |

---

## Contracts by module

### Authentication (Phase 2)

```ts
signUp(input: RegistrationInput): Promise<{ userId: string }>
signIn(input: SignInInput): Promise<{ userId: string }>
signOut(): Promise<void>
requestPasswordReset(email: string): Promise<void>
getSession(): Promise<Session | null>
acceptDisclaimers(version: string): Promise<void>
```

The `public.users` profile row is created by the `on_auth_user_created` trigger — the client
does not insert it, and has no policy allowing it to.

### Card catalog (Phase 2)

```ts
searchCardProducts(query: string): Promise<CardProductSummary[]>
getCardProduct(id: string): Promise<CardProductDetail>
listMerchantCategories(): Promise<MerchantCategoryRow[]>
searchMerchants(query: string): Promise<MerchantRow[]>
```

`searchCardProducts` returns catalog rows plus the caller's own custom products, because
that is what the two `card_products` SELECT policies permit. No client-side filter is
needed or trusted.

### Wallet (Phase 2)

```ts
listUserCards(): Promise<UserCardWithProduct[]>
addUserCard(input: AddUserCardInput): Promise<UserCardRow>
updateUserCard(id: string, patch: TablesUpdate<'user_cards'>): Promise<UserCardRow>
archiveUserCard(id: string): Promise<void>
createCustomCardProduct(input: CustomCardProductInput): Promise<CardProductRow>
```

`addUserCard` encrypts `lastFour` on the device before insert. **Plaintext digits never
appear in a request body.** A custom product is always inserted with
`is_user_defined = true` and `created_by = auth.uid()`; the RLS `WITH CHECK` rejects
anything else.

### Wallet snapshot — the engine's input (Phase 3)

```ts
loadWalletSnapshot(): Promise<EvaluableCard[]>
```

The one query that matters for performance. It materialises everything the engine needs in a
single round trip, because the engine is pure and cannot fetch:

```
user_cards
  → card_products (fee, supported countries, program)
      → reward_rules (active only)
          → reward_rule_conditions
  → user_rule_enrollments
  → user_offers (available or enrolled, in window)
  → reward_usage (current windows)
user_reward_preferences
```

This is the **last impure step**. Everything downstream is deterministic.

### Purchase and recommendation (Phase 4)

```ts
classifyPurchase(input: PurchaseIntentInput): Promise<PurchaseIntent>
recordPurchaseQuery(intent: PurchaseIntent): Promise<PurchaseQueryRow>
persistRecommendation(
  queryId: string,
  result: RecommendationResult,
): Promise<RecommendationRow>
listRecentRecommendations(limit: number): Promise<RecommendationSummary[]>
getRecommendationDetail(id: string): Promise<RecommendationDetail>
markRecommendationAccepted(id: string): Promise<void>
```

The engine runs **between** `recordPurchaseQuery` and `persistRecommendation`, on the
device, as a pure function. There is no server-side recommendation endpoint and no reason
for one.

`persistRecommendation` writes the recommendation and all candidates — eligible and not —
so the detail screen can explain the answer later even after the catalog changes.

### Offers, caps, preferences (Phase 5)

```ts
listUserOffers(status?: OfferStatus): Promise<UserOfferRow[]>
createUserOffer(input: UserOfferInput): Promise<UserOfferRow>
markOfferEnrolled(id: string): Promise<void>

getCapProgress(userCardId: string): Promise<CapProgress[]>
recordRewardUsage(input: RecordUsageInput): Promise<void>

listRewardPreferences(): Promise<UserRewardPreferenceRow[]>
upsertRewardPreference(input: RewardPreferenceInput): Promise<UserRewardPreferenceRow>
```

`recordRewardUsage` upserts on `(user_card_id, reward_rule_id, period_start, period_end)`,
which is why that unique constraint exists.

### Administrative catalog (Phase 6)

```ts
upsertRewardRule(input: RewardRuleInput): Promise<RewardRuleRow>
upsertRuleCondition(input: RuleConditionInput): Promise<RewardRuleConditionRow>
recordVerification(input: VerificationInput): Promise<VerificationHistoryRow>
listAuditLog(filter: AuditFilter): Promise<AuditLogRow[]>
```

All gated on `can_edit_catalog()` **in the database**. Hiding the screen is a convenience;
the policy is the control.

---

## Error handling

```ts
export type DataError =
  | { kind: 'unauthenticated' }
  | { kind: 'forbidden' } // RLS refused — do not retry
  | { kind: 'not_found' }
  | { kind: 'validation'; issues: string[] }
  | { kind: 'conflict' } // unique violation
  | { kind: 'network' } // retryable
  | { kind: 'unknown' };
```

Map PostgREST codes at the query-function boundary so hooks and screens never see a raw
Postgres error. Rules:

- **Never surface a raw database message to the user.** It can echo input, and it leaks
  schema detail.
- **`forbidden` is not retryable.** RLS said no; asking again wastes a round trip.
- Log through `captureException`, which redacts — never `console.error` with a payload.

---

## Performance notes

- **One round trip per screen.** Nested selects over N+1 queries.
- **`loadWalletSnapshot` is the hot path.** It is one query, cached for the session, and
  invalidated on any wallet mutation.
- Indexes that matter: `user_cards_user_idx`, `reward_rules_active_idx`,
  `reward_rule_conditions_rule_idx`, `reward_usage_lookup_idx`, and GIN indexes on
  `merchants.aliases` plus the merchant-id arrays.
- `max_rows = 200` in `supabase/config.toml` caps any single response.
- The engine runs on the device over in-memory objects — a ten-card wallet is trivial work.
