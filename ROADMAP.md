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

## Phase 4 — Purchase form and recommendation UI ✅ Complete

**Delivered — the pure layer**

- **Classifier** (`src/domain/classifier/`): exact merchant → known MCC → user-selected →
  inferred → unknown, emitting match kind, confidence, alternatives and the coding warning.
  A known merchant's own coding **outranks** the user's category choice, because the issuer
  decides the coding; the disagreement is surfaced rather than hidden.
- **Free-text parser** (`src/domain/purchaseText/`): amount, payment method, channel,
  category and merchant out of a sentence. Deterministic, conservative, and it produces no
  rate. Tapping a phone and tapping a card are distinguished, because a mobile-wallet bonus
  turns on exactly that difference.

**Delivered — the data boundary**

- `api/snapshot.ts` materialises the engine's entire input in one query, then hands a pure
  function a fully-formed snapshot
- `lib/int4range.ts` converts Postgres's canonicalised `[5411,5412)` back to the inclusive
  `[5411, 5411]` the engine expects — without it every MCC range would be one code wider
- `api/recommendations.ts` records the query and persists the answer, including every card
  that did **not** qualify, so an old answer stays explainable

**Delivered — the screens**

- Purchase assistant: free-text box, merchant autocomplete, amount, thirteen category chips,
  channel, payment method, country, currency, notes
- Results screen: winner in green, runner-up beside it with the gap in dollars, remaining
  eligible cards, and every ineligible card with its reason
- Details screen: the full breakdown row by row, the rule that won, what that rule required,
  the other rules considered on the same card, how the category was decided, and the source's
  verification state
- Home dashboard: top card per category (the real engine, run against a $100 reference
  purchase) and recently evaluated merchants

**Exit criteria — met.** `src/features/recommendations/specificationExample.test.ts` runs the
specification's own example end to end against the fictional seed catalog: $120 of groceries
at a supermarket returns the 6% card at **$7.20**, with the activated 5% rotating-category
card as runner-up at **$6.00** and the advantage reported as **$1.20**. Every figure is
traced in the test to the seed rule that produced it. The results and details screens each
have a screen-reader suite asserting composed labels, text alongside every colour, and honest
empty states.

**Two engine defects found and fixed by the new tests.**

1. `compareCandidates` ranked on the zero-floored net value, so abroad two cards whose
   rewards were both wiped out by a foreign transaction fee tied — even when one lost
   $1.80 less. Ranking now falls through to the pre-floor figure, while display still never
   shows a negative reward.
2. The explanation stated only the gap to the runner-up ("$1.20 more"), leaving the user to
   do the subtraction. It now states the runner-up's own figure too, as the specification
   asks.

**Deliberately not built.** The optional natural-language path is the deterministic parser
in `src/domain/purchaseText/`, not a model call. A model would be permitted here — the two
allowed uses in CLAUDE.md cover exactly this — but a parser that can be unit-tested against
hand-checked expectations is better for the same job, and it cannot fail closed into a
guessed rate. The model-backed variant, behind a server-side key, is Phase 7.

**Known limitation, stated on screen.** The workings behind a recommendation are held in
memory only, because `RecommendationResult` carries the full rule-and-cap snapshot each
figure was derived from and that snapshot is deliberately not persisted. Opening the results
or details screen after a restart therefore finds nothing, and says so, rather than
reconstructing a breakdown from parts we chose not to store.

---

## Phase 5 — Offers, caps and preferences ✅ Complete

**Delivered — the pure layer** (three new modules under `src/domain/rewards/`)

- `capProgress.ts` — cap progress across the whole wallet: consumed, remaining,
  utilisation, days until reset, and a three-level status. `ample` → `nearly_reached` at 80%
  → `exhausted` at 100%.
- `reminders.ts` — the two things that expire quietly: a rotating period that is running but
  not activated, and an offer inside its final fortnight. One derivation feeds both the
  "categories now" list and the activation reminder, so they cannot disagree.
- `usage.ts` — what an accepted recommendation does to a cap. Derived from the breakdown the
  engine already produced, never recomputed from a rate.

**Delivered — the data layer**

- `features/offers/api` — enter, activate, redeem and delete an offer
- `features/preferences/api` — per-program valuations, the two wallet-wide switches, and the
  wallet's programs joined to the user's figures
- `features/caps/api` — `recordRewardUsage`, a user-typed cap correction, and
  rotating-bonus activation

**Delivered — the screens**

- Offers (Screen 12): live and finished offers, and a form validated by the same
  `userOfferSchema` the API trusts
- Reward preferences (Screen 13): a figure per reward currency, cash-back-only, the minimum
  switch benefit, and a **live impact card** that re-ranks the wallet as soon as a figure is
  saved
- Card details (Screen 11): per-card cap progress and activation, replacing its placeholders
- Dashboard: activation reminders, cap alerts and expiring offers — each rendering _nothing_
  when there is nothing to say, so a section appearing is itself the signal

**Exit criteria — met, and each is a test.**

- _Changing a valuation changes the ranking._
  `features/preferences/valuationRanking.test.ts` runs preference rows → `buildValuation` →
  `evaluateWallet`. On a $100 restaurant purchase a 4x-points card is worth $6.00 at 1.5¢ and
  wins; at 0.5¢ it is worth $2.00 and loses to a 3% cash card. The flip is pinned either side
  of the 0.75¢ break-even.
- _Cap alerts fire at the right thresholds._ `capProgress.test.ts` asserts 79.98% → ample,
  exactly 80% → warning, 99.9% → still warning, 100% and 110% → exhausted.
- _Offers affect recommendations._ `features/offers/offerImpact.test.ts` turns a losing 1%
  card into the winner with a $10 credit, and pins the six reasons an offer must _not_ apply.

**Two engine defects the new tests found and fixed.**

1. **An unactivated offer was counted.** `bestOffer` added the value of an offer the user had
   not activated, so a $60 purchase was reported as worth $10.60 when it would actually earn
   $0.60. Activation now gates the money — matching how an unactivated rotating _rule_ was
   always treated — and the offer is surfaced as an actionable warning instead.
2. **A catalog default outranked the user's own figure.** `buildValuation` folded catalog
   program defaults into `byProgramId` before reading the user's rows, and
   `resolveCentsPerUnit` checks `byProgramId` first — so a user who set "all my points are
   worth 0.4¢" was silently overruled by the catalog's 1¢. The four-level precedence is now
   flattened explicitly, with the reasoning recorded in the function.

**A deliberate limitation, stated in the code.** Only the _primary_ rule's cap is recorded
when a purchase is confirmed. Two stacked capped rules would leave the secondary cap looking
emptier than it is. The persisted breakdown carries one `appliedRuleId`, and inferring the
rest would mean re-deriving a calculation instead of reading one.

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
