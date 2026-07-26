# Roadmap

Each phase ends with the same gate: lint, typecheck, tests, fix every failure, summarise the
changes, commit. No skipped tests.

---

## Phase 1 — Foundation ✅ Complete

Architecture, documentation, navigation, database schema and fictional seed data.

**Delivered**

- Expo SDK 54 + React Native 0.81 + React 19, TypeScript strict with
  `noUncheckedIndexedAccess`, ESLint 9 flat config, Prettier, Jest + RNTL
- Ten documentation files
- 19 tables across 8 migrations: enums, constraints, triggers, and RLS on every table
- Fictional catalog: 10 cards across all 10 required archetypes, 5 issuers, 9 reward
  programs, 14 merchants, 13 categories, 3 provenance sources
- Typed Supabase schema mirroring the migrations
- Expo Router tree with all 16 screens
- Design system: tokens, light and dark themes, accessible primitives
- `money.ts` and `capWindow.ts` implemented and tested
- Engine contracts (`types.ts`) defining the Phase 3 interface
- Redaction layer and telemetry abstraction
- 393 tests across 10 suites

**Deliberately not built yet:** authentication, engine evaluation, live queries. Screen
regions awaiting a later phase say so on screen, with the phase named. No fabricated reward
figure appears anywhere.

---

## Phase 2 — Authentication and wallet management ✅ Complete

**Delivered — auth**

- Registration with the Zod schema, email confirmation, and disclaimer acceptance recorded
  against `disclaimers_accepted_version`
- Sign in, sign out, password reset (with an enumeration-safe response)
- Session in the device keystore; route guard in `app/_layout.tsx`
- `AuthProvider` clears the Query cache whenever the signed-in user changes

**Delivered — wallet**

- Catalog search with headline rates and verification dates
- Add a card: nickname, optional last four, account open date, preferred flag
- **Device-side encryption for the last four** (`src/lib/lastFour.ts`) — AES-256-GCM via
  `@noble/ciphers`, key in SecureStore, key id recorded for rotation
- Custom card creation, owned by the user, rate stored as `user_reported`
- Wallet list with archive, restore, reorder and exclude-from-recommendations
- Card details from real data, showing each rule's rate and verification state

**Corrected from the Phase 1 plan.** This document previously said the last four digits
would be encrypted with "`expo-crypto` AES-GCM". That was wrong: `expo-crypto` provides
randomness and digests only, and React Native has no dependable `crypto.subtle`. Phase 2
uses `@noble/ciphers` — audited, dependency-free, pure TypeScript, identical on Hermes and
in Node — with `expo-crypto` supplying the key and nonce bytes.

**Also delivered:** a migration making `card_products.issuer_id` nullable with a new
`custom_issuer_name`. Without it the custom-card flow could not work at all, because
`issuers` is writable only by catalog editors, so a member could never satisfy the
foreign key.

**Deferred to Phase 7:** data export and account deletion. Both are listed on the Settings
screen as not-yet-built rather than silently missing.

**Not yet done:** RLS _integration_ tests against real Postgres. The structural assertions
in `schema.test.ts` prove the policies exist and are shaped correctly; proving User A
cannot read User B's wallet needs a live database, and is scheduled for Phase 7.

---

## Phase 3 — Deterministic rewards engine ✅ Complete

The heart of the product. Built before any UI depends on it.

- `evaluate.ts` — the twelve steps from [REWARDS_ENGINE.md](REWARDS_ENGINE.md)
- `conditions.ts` — condition matching, AND across rows, OR within arrays
- `caps.ts` — remaining-cap resolution against `reward_usage`
- `stacking.ts` — stack groups and `is_stackable`
- `valuation.ts` — program → unit → default resolution, honouring a zero valuation
- `rank.ts` — ranking and the five-level tie-break
- `explain.ts` — deterministic explanation assembly
- `confidence.ts` — the weakest-link confidence calculation

**Exit criteria — met.** The full matrix passes. `src/domain/rewards/` is at **99.0%
statements and 95.7% branches**; `jest.config.js` now enforces 95/92 there and 95/92 across
`src/domain/`, up from the Phase 1 placeholder of 40/30.

Purity is enforced rather than asserted. `src/domain/purity.test.ts` reads every domain
module as source text and fails on `Date.now()`, a no-argument `new Date()`,
`Math.random()`, `fetch`, a Supabase import, a React import, `process.env`, filesystem
access or a `console` call — plus two behavioural checks that the engine is reproducible and
depends on `asOf` rather than the wall clock.

**One design note worth recording.** Cap fall-through needed no special case. Because the
winner within a `stackGroup` is chosen by _resulting value_ rather than by priority, an
exhausted 6% rule with no `postCapRate` simply scores zero and the card's own 1% base rule
wins the group on merit. The spec's "fall through to the base rule" behaviour falls out of
the ranking.

---

## Phase 4 — Purchase form and recommendation UI

- Purchase form with React Hook Form + Zod: merchant, amount, category, channel, country,
  currency, payment method, notes
- Quick-category buttons (already rendering from the shared taxonomy)
- Merchant autocomplete against the catalog
- **Classifier** (`src/domain/classifier/`): exact merchant → known MCC → user-selected →
  inferred, emitting match kind, confidence and the coding warning
- Optional natural-language entry: an LLM turns free text into structured fields, validated
  by the same schema. **It produces no rates.**
- Results screen: winner in green, runner-up beside it, ineligible cards with reasons
- Details screen: the full breakdown, step by step, with provenance
- Home dashboard: top cards by category, recently evaluated merchants

**Exit criteria:** the specification example works end to end — $120 grocery at a
supermarket with Apple Pay returns the 6% card at $7.20 with the runner-up at $6.00. Every
figure traceable to a database record. Screen-reader pass on the results screen.

---

## Phase 5 — Offers, caps and preferences

- Offer entry and management; expiring-offer alerts on the dashboard
- Cap tracker: progress bars, "resets in N days", cap alerts
- `recordRewardUsage` on accepted recommendations
- Rotating-category activation reminders
- Reward preferences: per-program valuations, cash-back-only mode, minimum switch benefit
- Live recomputation when a valuation changes, so the effect is visible

**Exit criteria:** changing a valuation demonstrably changes the ranking. Cap alerts fire at
the right thresholds. Offers affect recommendations.

---

## Phase 6 — Administrative catalog and verification

- Role-gated access (`catalog_editor`, `admin`) — enforced by RLS, not by hiding the screen
- Rule editor covering every condition field
- Condition builder for MCC ranges and merchant include/exclude lists
- Verification workflow: source URL, verified date, append to `verification_history`
- Automatic staleness flagging past the freshness window
- Audit-history viewer
- Bulk import with a validation report

**Exit criteria:** an editor can create, verify and retire a rule. A `member` is refused by
the database, not merely by the UI. Every write is audited.

---

## Phase 7 — Review and hardening

**Security**

- Full [SECURITY.md](SECURITY.md) checklist walked
- **RLS integration tests against real Postgres** — the cross-user matrix in TESTING.md
- Dependency audit; secret scan over history
- Application-level rate limiting

**Accessibility**

- VoiceOver and TalkBack passes on every screen
- Dynamic type at the largest OS setting
- Contrast re-verified; reduced-motion respected

**Quality**

- Coverage thresholds raised to their real targets
- `public.cap_period_window()` cross-checked against `resolveCapWindow()` over a year
- Documentation reconciled with the shipped code

**Exit criteria:** no known security or accessibility defect. All tests pass with no skips.

---

## Out of scope — permanently

Not "later". These are product boundaries, and the app is designed around their absence.

| Excluded                                             | Why                                             |
| ---------------------------------------------------- | ----------------------------------------------- |
| **Payment processing**                               | WalletWise advises; it never moves money        |
| **Bank login or credential aggregation**             | Requires holding banking credentials. Refused.  |
| **Website scraping of issuer pages**                 | Fragile, hostile, and unnecessary               |
| **Storing full card numbers, CVV, PIN or passwords** | No legitimate use here                          |
| **Automatic transaction import**                     | Would require the two rows above                |
| **Card application or affiliate referrals**          | Would corrupt the recommendation's incentives   |
| **Credit score features**                            | Different product, different regulatory posture |

That last one is worth stating explicitly: the moment a recommendation is influenced by a
referral fee, the product is worthless. Rankings depend only on the user's own numbers.

---

## Considered, deferred

Ranked by value per unit of risk. None affect the determinism guarantee.

**Likely next**

- **Real card catalog** with verified sources, replacing the fictional seed data. The single
  biggest step to usefulness — and a genuine research effort, since every rate needs a
  citation and a verification date.
- Widget or share-sheet entry, so a recommendation takes one tap at the till
- Multi-currency purchase entry with an FX rate, rather than USD-only amounts
- Household or shared wallets

**Plausible**

- Annual-fee amortisation, as an opt-in view — it needs a spending profile, and a bad
  estimate here is worse than none
- Category-spend insights derived from confirmed recommendations
- "What card should I get next?" gap analysis, with no referral links
- Community rate submissions feeding the verification queue, never the catalog directly

**Unlikely, but interesting**

- Offline recommendation from a cached snapshot — the engine is already pure, so this is
  mostly a caching problem
- Apple Wallet pass ordering hints
- Automatic staleness detection from public issuer feeds, still human-reviewed
