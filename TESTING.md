# Testing

## Principles

**Do not skip a test to make the build pass.** A failing test is information. Fix the code,
or fix the test's premise — and say which one you did and why.

**A reward figure needs a hand-checked expected value.** Write the arithmetic into the test
name or a comment so a reviewer can verify it on paper:

```ts
it('computes the specification example: 6% of $120 is $7.20', () => {
  expect(percentOf(120, 6)).toBe(7.2);
});
```

**Pin time explicitly.** The engine takes `asOf` as a parameter precisely so tests never
mock a clock. There is no `jest.useFakeTimers()` anywhere in this suite.

**Test the boundaries.** Cap exactly reached, cap partially remaining, cap exhausted, rule
expiring today, zero-dollar purchase, missing category, tied values. Bugs live at the edges,
and in a rewards engine an edge-case bug quietly costs the user money.

**Security and accessibility invariants are tested, not documented.** Credential rejection,
RLS coverage, log redaction and contrast ratios each have a suite. Those suites _are_ the
enforcement.

---

## Stack

| Tool                          | Role                                                     |
| ----------------------------- | -------------------------------------------------------- |
| Jest 29 + `jest-expo`         | Runner (Jest 29 is what `jest-expo@54` targets)          |
| React Native Testing Library  | Component tests, queried the way a user perceives the UI |
| `node:fs` in `schema.test.ts` | Structural assertions over the SQL migrations            |

```bash
npm test                  # all suites
npm run test:watch        # watch mode
npm run test:coverage     # with coverage
npx jest src/domain       # one directory
npx jest -t "cap"         # by test name
```

`jest.setup.ts` provides deterministic fake environment values and mocks `expo-secure-store`
and `expo-router`. It contains no real credentials.

---

## Phase 1 coverage — 10 suites

| Suite                                  | Tests | Covers                                                          |
| -------------------------------------- | ----- | --------------------------------------------------------------- |
| `src/database/schema.test.ts`          | 117   | Table presence, forbidden columns, RLS coverage, seed integrity |
| `src/theme/contrast.test.ts`           | 71    | WCAG AA on every rendered colour pair, both schemes             |
| `src/domain/schemas.test.ts`           | 58    | Credential rejection, purchase validation, rule constraints     |
| `src/domain/rewards/money.test.ts`     | 33    | Rounding, cash back, points, valuations, cap splitting, FX fees |
| `src/services/redaction.test.ts`       | 27    | Every redaction class, depth, cycles, masking                   |
| `src/lib/format.test.ts`               | 24    | Currency, units, rates, caps, dates                             |
| `src/domain/rewards/capWindow.test.ts` | 23    | All eight cap periods, boundaries, anniversary arithmetic       |
| `src/domain/categories.test.ts`        | 19    | The 13-category taxonomy, MCC mapping, ambiguity                |
| `src/components/Disclaimers.test.tsx`  | 13    | Disclaimer copy and accessible labelling                        |
| `src/components/ui/Button.test.tsx`    | 11    | Roles, states, touch targets, colour-independence               |

### What the security suites actually assert

`schemas.test.ts` — credential rejection, positively:

- Bare, spaced and hyphenated card numbers, and 13-digit numbers
- Card numbers embedded in a sentence
- CVV / CVC / security-code patterns, PIN and password patterns
- **And that ordinary text still passes** — `"Trattoria Nove — birthday dinner"`,
  `"Order #12345"`, `"Split with Sam, 50/50"`. A validator that rejects legitimate input is
  a bug, not extra safety.
- `lastFourSchema` accepts exactly four digits and rejects five, so a full number cannot be
  entered one keystroke at a time.

`schema.test.ts` — the schema's own invariants, read from the SQL:

- All 19 required tables exist, **and no others**
- No column named `card_number`, `pan`, `cvv`, `pin`, `password`, `expiry`, …
- Card digits appear in exactly two columns: `last_four_cipher`, `last_four_key_id`
- RLS enabled on all 19 tables, `FORCE`d on all 10 user-owned tables
- Every table has a policy; **every policy is scoped `TO authenticated`**
- `anon` revoked; owner reads scoped to `auth.uid()`
- `users_update_self` pins `role` — self-promotion is blocked
- No UPDATE/DELETE policy on append-only tables
- Every SECURITY DEFINER function pins `search_path`
- Seed data: exactly 10 fictional cards, all archetypes, no user-owned rows

The forbidden-column check requires a real SQL type keyword after the identifier, so a
comment that mentions `cvv` — of which there are several, deliberately — is not a false
positive. That precision was found the hard way: a looser regex matched a CHECK-constraint
body.

`redaction.test.ts` — that redaction is neither too weak nor too strong:

- Credentials and identifiers dropped, at any nesting depth
- Amounts coarsened (`120` → `"100-499"`), free text reduced to `"[16 chars]"`
- Card-like strings masked even under an innocuous key
- **Diagnostics preserved** — `ineligibilityCode`, `capPeriod`, `confidence`. Redaction that
  destroys everything makes telemetry useless and gets switched off.
- Cycles, depth limits, `Error` messages, `undefined`/function/symbol values

`contrast.test.ts` — WCAG 2.2 AA on the pairs the app actually renders:

- 23 body-text pairs at 4.5:1, 9 large-text and UI pairs at 3:1, in **both** schemes
- Plus: success, warning and danger stay measurably distinct from each other, so a token
  edit cannot quietly collapse two semantic states together

This suite earns its keep. It caught three real failures in the first palette: white on the
original teal was 4.46:1, the ghost-button label was 4.26:1, and the "strong" border was
2.11:1. All three now pass with margin.

---

## Phase 2 coverage — 7 further suites

Total after Phase 2: **539 tests across 17 suites.**

| Suite                                      | Tests | Covers                                                                 |
| ------------------------------------------ | ----- | ---------------------------------------------------------------------- |
| `src/lib/lastFour.test.ts`                 | 26    | Encryption round-trip, refusal of over-long input, key loss, tampering |
| `src/features/wallet/api/wallet.test.ts`   | 25    | Wallet mapping, ciphertext-only writes, custom-card rollback           |
| `src/features/catalog/api/catalog.test.ts` | 20    | Search, filter-injection safety, headline and verification ranking     |
| `src/features/auth/api/auth.test.ts`       | 20    | Sign-up/in/out, enumeration safety, disclaimer recording               |
| `src/lib/errors.test.ts`                   | 25    | SQLSTATE and auth-error mapping, retryability, message safety          |
| `src/components/ui/TextField.test.tsx`     | 16    | Accessible naming, live-region errors, touch targets                   |
| `src/lib/base64.test.ts`                   | 11    | Reference vectors, URL-safe alphabet, malformed input                  |

### What the Phase 2 security tests assert

`lastFour.test.ts` — the encryption boundary:

- Five digits, thirteen digits and a full 16-digit number are **all refused**, so a PAN
  cannot be entered one keystroke at a time.
- The rejection message does not echo the value, in case it _is_ a card number.
- The stored payload satisfies both database CHECK constraints — it matches the
  base64 shape and does **not** match the bare-digits guard.
- The plaintext never appears in the payload, and the same digits encrypt differently each
  time (fresh nonce).
- A missing key, a wrong key id, a tampered payload and malformed base64 all yield `null` —
  never four plausible-looking digits. GCM's authentication tag is what makes tampering
  detectable rather than silently wrong.
- A keystore failure returns `null` instead of throwing, so the card still saves.

`wallet.test.ts` — that writes carry ciphertext only:

- The insert payload contains the ciphertext and the key id, and `JSON.stringify` of the
  whole payload contains the digits nowhere.
- Both digit columns are null together, matching the DB constraint that requires it.
- `user_id` comes from the session, never from the caller.
- No `user_id` filter is sent on reads — RLS is the scope, and duplicating it in the client
  would let the two drift.
- A custom card is always `is_user_defined` + `created_by = auth.uid()`, with
  `is_fictional = false` so it never masquerades as demo data.
- The rate is stored `user_reported`, so confidence stays honest.
- When the rule insert fails, the orphan product is deleted — PostgREST has no client
  transaction, so the rollback has to be explicit or the wallet holds a card earning nothing.

`auth.test.ts` — enumeration safety:

- A wrong password and a non-existent account give the **same** message.
- A password reset for an unknown address resolves normally; only a rate limit surfaces.
- The password appears in no database write.

`errors.test.ts` — that raw database text never reaches a user:

- A unique-violation message naming `user_cards_pkey` becomes "That already exists."
- `forbidden` and `validation` are non-retryable; `network` and `rate_limited` are.

---

## Phase 3 coverage — 9 further suites

Total after Phase 3: **999 tests across 26 suites.** The matrix below is complete and
passing; counts are from `jest --json`, not estimated.

| Suite                                   | Tests | Covers                                                       |
| --------------------------------------- | ----- | ------------------------------------------------------------ |
| `src/domain/purity.test.ts`             | 195   | The determinism guarantee, enforced over every domain module |
| `src/domain/rewards/evaluate.test.ts`   | 92    | The full 14-category engine matrix, end to end               |
| `src/domain/rewards/conditions.test.ts` | 38    | AND/OR semantics, exclusions, windows, every rejection code  |
| `src/domain/rewards/confidence.test.ts` | 27    | Weakest-link confidence and its warnings                     |
| `src/domain/rewards/stacking.test.ts`   | 25    | Spend thresholds, mixed units, offer matching                |
| `src/domain/rewards/rank.test.ts`       | 24    | The five-level tie-break and the switch threshold            |
| `src/domain/rewards/explain.test.ts`    | 22    | Wording, and that no invented figure can appear              |
| `src/domain/rewards/caps.test.ts`       | 20    | Cap windows, consumption, resets, utilisation                |
| `src/domain/rewards/valuation.test.ts`  | 17    | Program → unit → zero resolution                             |

**Engine coverage: 99.0% statements, 95.7% branches, 100% functions.** `jest.config.js`
enforces 95/92 on `src/domain/rewards/` and on `src/domain/` as a whole.

### Purity is enforced, not asserted

`purity.test.ts` reads every module under `src/domain/` as _source text_ — so a violation is
caught even on a path no test happens to execute — and fails on:

`Date.now()` · a no-argument `new Date()` · `performance.now()` · `Math.random()` · any
crypto random source · `fetch` · a Supabase import · a React import · `process.env` ·
filesystem access · any `console` call · an import from `features/`, `components/`,
`providers/`, `services/` or `config/`

Plus two behavioural checks: identical inputs give byte-identical output, and a seasonal rule
is active or expired purely as a function of `asOf`.

### What the engine tests actually pin

- **The specification's own example** works end to end: $120 of groceries returns the 6% card
  at **$7.20** with the runner-up at **$6.00** and an advantage of **$1.20**.
- **Cap fall-through needs no special case.** Because a `stackGroup` winner is chosen by
  resulting _value_, an exhausted 6% rule with no `postCapRate` scores zero and the card's
  own 1% base rule wins on merit. Tested both ways round.
- **A valuation of zero is honoured**, not replaced by a default — the single most important
  behaviour in `valuation.ts`.
- **A fee-wiped card stays eligible.** 3x miles at 1¢ less a 3% fee nets $0.00 and *loses* to
  a 2% no-fee card at $2.00, rather than disappearing from the list.
- **Ranking is total.** Every comparison path ends on the card name, so two identical cards
  still order stably. Asserted by evaluating the same wallet forwards and reversed.
- **The explanation can invent nothing.** One test extracts every dollar figure from the
  generated sentence and asserts each one appears in the breakdown.

### One bug this matrix caught

`rank.ts` computed the runner-up advantage with raw subtraction: `7.2 - 6` is
`1.2000000000000002` in IEEE-754. That figure is persisted to
`recommendations.advantage_over_runner_up_usd`, so it was a real defect rather than a display
quirk — exactly the class of error `money.ts` exists to prevent, in the one place that had
bypassed it. Both the advantage and the switch-threshold comparison now round through
`roundUsd`.

---

## Phase 3 engine matrix — complete

Every row is required by the specification, and every row now has at least one test with a
hand-checked expected value. Retained as the checklist for future changes to the engine.

### Percentage cash back

| Case                     | Expected                                |
| ------------------------ | --------------------------------------- |
| 6% on $120               | $7.20                                   |
| 2% flat on $120          | $2.40                                   |
| 0% rate                  | $0.00, not eligible for recommendation  |
| Rounding: 1.5% on $43.17 | $0.65 (`0.64755` → half away from zero) |

### Points and miles

| Case                                 | Expected                                      |
| ------------------------------------ | --------------------------------------------- |
| 4x on $120                           | 480 points                                    |
| 1x base on $120                      | 120 points                                    |
| Fractional multiplier 1.5x on $43.17 | 64.755 points, kept unrounded                 |
| 10x on a 0.6¢ currency vs 3x on 1.3¢ | 6% vs 3.9% effective — the high multiple wins |

### User-defined point valuation

| Case                   | Expected                                               |
| ---------------------- | ------------------------------------------------------ |
| 480 points at 1.25¢    | $6.00                                                  |
| Same points at 2.0¢    | $9.60 — ranking may change                             |
| **Valuation of 0**     | $0.00, honoured, not replaced by a default             |
| No user preference set | Falls back to `reward_programs.default_cents_per_unit` |
| `prefersCashBackOnly`  | Non-cash scores $0 with `non_cash_reward_declined`     |

### Spending caps

| Case                                               | Expected                               |
| -------------------------------------------------- | -------------------------------------- |
| Purchase well under the cap                        | Full bonus rate                        |
| Purchase exactly at the remaining cap              | Full rate, no overflow                 |
| **Partially remaining cap** ($200 spend, $80 left) | $80 at bonus + $120 at post-cap        |
| Cap exhausted, `post_cap_rate = 1`                 | Entire purchase at 1%                  |
| Cap exhausted, `post_cap_rate = NULL`              | Falls through to the card's base rule  |
| Cap exhausted, no base rule                        | `cap_exhausted`                        |
| `cap_applies_to = 'reward'`                        | Cap limits accrued reward, not spend   |
| Cap window rolls over                              | Previous window's usage does not count |

### Expired and future rules

| Case                                      | Expected                 |
| ----------------------------------------- | ------------------------ |
| `ends_at` in the past                     | `rule_expired`           |
| `starts_at` in the future                 | `rule_not_yet_active`    |
| `asOf` exactly at `starts_at`             | Active — inclusive       |
| `asOf` exactly at `ends_at`               | Expired — exclusive      |
| Condition window narrower than the rule's | Condition window governs |

### Enrollment

| Case                                  | Expected                                            |
| ------------------------------------- | --------------------------------------------------- |
| `requires_enrollment`, enrolled       | Bonus applies                                       |
| `requires_enrollment`, not enrolled   | `not_enrolled`, surfaced with `enrollment_required` |
| `requires_enrollment`, status unknown | Treated as not enrolled — the conservative read     |
| Enrollment expired before `asOf`      | Not enrolled                                        |

### Merchant exclusions

| Case                                               | Expected                           |
| -------------------------------------------------- | ---------------------------------- |
| Merchant in `excluded_merchant_ids`                | Rule rejected, `merchant_excluded` |
| Exclusion beats an explicit inclusion              | Excluded — exclusions are absolute |
| Merchant in `included_merchant_ids`                | Rule applies                       |
| `included_merchant_ids` non-empty, merchant absent | `merchant_not_included`            |
| Excluded MCC, excluded category, excluded country  | Each rejected with its own code    |

### Foreign transaction fees

| Case                                           | Expected                                  |
| ---------------------------------------------- | ----------------------------------------- |
| USD purchase, 3% fee card                      | No fee                                    |
| EUR purchase, 3% fee card, $120                | $3.60 subtracted                          |
| EUR purchase, no-fee card                      | No fee                                    |
| **3x at 1¢ with 3% fee vs 2% no-fee, on $100** | $0.00 vs $2.00 — the no-fee card wins     |
| Unsupported country                            | `country_not_supported`, not merely a fee |

### Merchant offers

| Case                            | Expected                                 |
| ------------------------------- | ---------------------------------------- |
| Offer stacks on the rule reward | Sum of both                              |
| `minimum_spend_usd` not met     | Offer does not apply                     |
| `max_benefit_usd` reached       | Benefit capped                           |
| Offer outside its window        | Does not apply                           |
| Offer needs activation          | Applies with `offer_requires_activation` |
| Offer merchant differs          | Does not apply                           |

### Tie breaking

| Case                                                          | Expected                                               |
| ------------------------------------------------------------- | ------------------------------------------------------ |
| Two cards at identical net value                              | User's preferred card wins, `tie_broken_by_preference` |
| Tie, no preference                                            | Higher confidence wins                                 |
| Tie, equal confidence                                         | Cash back beats points                                 |
| Tie, both cash back                                           | Fewer warnings wins                                    |
| Fully identical                                               | Alphabetical by name — **stable, never arbitrary**     |
| Winner beats preferred by less than `minimumSwitchBenefitUsd` | Preferred card recommended                             |

### Missing and uncertain category

| Case                               | Expected                                                               |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `categoryId = null`                | Only unconditional rules qualify; `category_missing`, confidence `low` |
| Category inferred from a name      | Applies, confidence ≤ `medium`, `category_inferred`                    |
| `has_ambiguous_coding` merchant    | `merchant_coding_uncertain`, confidence `low`                          |
| MCC maps to more than one category | Candidates surfaced, confidence reduced                                |
| No card qualifies at all           | `recommended: null`, every card in `ineligible` with a reason          |

### Zero-dollar and invalid purchases

| Case                             | Expected                                             |
| -------------------------------- | ---------------------------------------------------- |
| $0.00                            | Rejected by the schema before the engine runs        |
| Negative amount                  | Rejected                                             |
| Non-numeric / `NaN` / `Infinity` | Rejected                                             |
| More than two decimal places     | Rejected                                             |
| Above $1,000,000                 | Rejected                                             |
| Empty wallet                     | `recommended: null`, empty candidate lists, no crash |

### Multiple overlapping rules

| Case                                              | Expected                                            |
| ------------------------------------------------- | --------------------------------------------------- |
| Two rules match, same `stack_group`               | Higher-earning one wins, not higher priority        |
| Bonus and base both match                         | Bonus wins within the group                         |
| `is_stackable` intro bonus + category rule        | **Both apply** — 5% + 2% = 7%                       |
| Statement credit + points rule (different groups) | Both apply                                          |
| Capped bonus + uncapped lower bonus               | Split at the cap, best available rate per portion   |
| Three overlapping categories                      | Single highest-value combination, deterministically |
| Same-value rules on one card                      | Lower rule id wins — stable ordering                |

---

## Phase 4 coverage — 13 further suites

Total after Phase 4: **1,281 tests across 39 suites.** Counts are from `jest --json`.

| Suite                                                            | Tests | Covers                                                        |
| ---------------------------------------------------------------- | ----- | ------------------------------------------------------------- |
| `src/domain/purchaseText/parse.test.ts`                          | 59    | Free-text parsing: amounts, payment method, channel, category |
| `src/features/recommendations/ruleFacts.test.ts`                 | 32    | The wording of "why this rule applied", per condition field   |
| `src/features/recommendations/api/snapshot.test.ts`              | 25    | The database-to-engine mapping, and valuation resolution      |
| `src/domain/classifier/classify.test.ts`                         | 23    | Match precedence, coding warnings, user disagreement          |
| `src/features/recommendations/specificationExample.test.ts`      | 14    | **The specification example, end to end**                     |
| `app/recommendations/results.test.tsx`                           | 14    | The results screen, including its screen-reader labels        |
| `src/lib/int4range.test.ts`                                      | 13    | Postgres half-open ranges → inclusive MCC bounds              |
| `app/recommendations/details.test.tsx`                           | 13    | The audit trail, and its refusal to explain the wrong answer  |
| `src/features/recommendations/ui/CandidateCard.test.tsx`         | 12    | Colour is never the only signal; the row reads as one thought |
| `src/features/recommendations/topCards.test.ts`                  | 11    | Per-category best card, and the honest gaps                   |
| `src/features/recommendations/ui/BreakdownTable.test.ts`         | 10    | Every arithmetic row, with the sum written out in the test    |
| `src/features/recommendations/ui/RecentRecommendations.test.tsx` | 9     | History rows: labels, touch targets, "no card qualified"      |
| `src/features/recommendations/ui/TopCardsByCategory.test.tsx`    | 8     | The dashboard card, including its uncovered-category wording  |

`purity.test.ts` also grew from 195 to 231 assertions, because it discovers domain modules by
reading the directory — the classifier and the free-text parser were held to the same rules
the moment they existed, without anyone remembering to add them.

### The specification example is a test, not a demo

`specificationExample.test.ts` builds two cards from `supabase/seed/05_demo_reward_rules.sql`
and runs the two pure steps the app runs — `classifyPurchase`, then `evaluateWallet`:

```
$120.00 × 6% = $7.20   rule 66666666-…-000000000102, $6,000/yr cap untouched
$120.00 × 5% = $6.00   rule 66666666-…-000000000503, Q3 2026, activated
advantage    = $1.20
```

It also pins the variations that change the answer: the rotator drops to **$1.20** when the
quarter is not activated, the grocery card drops to **$1.20** at the excluded warehouse club
(with the amber coding warning), and a nearly-exhausted cap splits $120 into $50 at 6% and
$70 at 1% for **$3.70**.

### Two defects these suites caught

1. **Ranking lost the fee difference.** `compareCandidates` compared `netValueUsd`, which is
   floored at zero. Abroad, a card earning $2.40 against a $3.60 fee and one earning $0.60
   against the same fee both reported $0.00 and tied — so the tie-break handed the answer to
   whichever was preferred or alphabetically first, when one genuinely cost $1.80 less. The
   comparator now falls through to the pre-floor figure. Display is unchanged: a reward is
   still never shown as negative.
2. **The explanation made the user do arithmetic.** It said "$1.20 more than your next best
   option" without saying what that option earned. The specification asks for the second-best
   amount outright, so it now states it.

### Screens are tested through the engine, not around it

No screen test hand-writes a reward figure. Each one evaluates a real wallet and renders what
came back, so a component that quietly reformatted `$7.20` into something else would fail.
Two assertions exist purely to catch a fabricated number:

- the results and details screens, in their empty states, are asserted to contain **no
  dollar figure at all** (`expect(JSON.stringify(toJSON())).not.toMatch(/\$\d/)`);
- an ineligible card is asserted **not** to render `$0.00`, because a dollar amount beside
  "Not eligible" reads as money the user could have earned.

---

## Phase 5 coverage — 11 further suites

Total after Phase 5: **1,527 tests across 50 suites.** Counts are from `jest --json`.

| Suite                                               | Tests | Covers                                                      |
| --------------------------------------------------- | ----- | ----------------------------------------------------------- |
| `src/domain/rewards/reminders.test.ts`              | 30    | Rotating periods and expiring offers, at every window edge  |
| `src/domain/rewards/capProgress.test.ts`            | 22    | Cap arithmetic, resets, and the alert thresholds exactly    |
| `src/domain/rewards/usage.test.ts`                  | 22    | What a confirmed purchase does to a cap, and the round trip |
| `src/features/preferences/api/preferences.test.ts`  | 20    | Valuation precedence, and that a zero survives              |
| `src/features/offers/offerImpact.test.ts`           | 18    | **Offers affect recommendations** — and when they must not  |
| `src/features/caps/ui/CapTracker.test.tsx`          | 18    | Progress rows, thresholds in words, accessible values       |
| `src/features/offers/ui/OfferRow.test.tsx`          | 17    | Offer rows and the expiring-offer alert                     |
| `src/features/caps/api/usage.test.ts`               | 16    | Read-then-write merging, upsert targets, enrollment         |
| `src/features/preferences/valuationRanking.test.ts` | 15    | **Changing a valuation changes the ranking**                |
| `src/features/offers/api/offers.test.ts`            | 15    | Offer writes, and `enrolled_at` as the engine's own signal  |
| `src/features/caps/ui/RotatingCategories.test.tsx`  | 14    | Activation copy, and that it never claims to activate       |

### The three exit criteria, as tests

**Changing a valuation changes the ranking.** `valuationRanking.test.ts` runs the real path —
preference rows → `buildValuation` → `evaluateWallet` — with nothing stubbed in between. On a
$100 restaurant purchase:

```
4x points on $100 = 400 points        3% cash back on $100 = $3.00
  at 1.5¢  → $6.00   points win         break-even is 0.75¢
  at 0.76¢ → $3.04   points win         at 0.74¢ → $2.96, cash wins
  at 0.75¢ → $3.00   exact tie, cash wins on the tie-break
  at 0¢    → $0.00   still listed, worth nothing
```

**Cap alerts fire at the right thresholds.** `capProgress.test.ts` pins each boundary against
a $6,000 cap: $4,799 → `ample`, $4,800 (exactly 80%) → `nearly_reached`, $5,994 → still
`nearly_reached`, $6,000 → `exhausted`, and $6,600 → `exhausted` rather than "nearly", because
reporting a 110%-used cap as nearly reached would be actively misleading.

**Offers affect recommendations.** `offerImpact.test.ts` gives a 1% card a $10 credit and
watches it beat a 4% card by $8.20 — then pins the six ways an offer must fail to apply: not
activated, minimum spend unmet, wrong merchant, expired, not yet started, wrong channel. Each
has a positive mirror, so a bug that ignores _every_ offer cannot pass by accident.

### Two defects these suites caught

1. **An unactivated offer was counted as money.** `bestOffer` returned the value of an offer
   the user had not activated, so a $60 purchase was reported as worth $10.60 when it would
   actually earn $0.60. The same wallet's unactivated _rotating rule_ was correctly screened
   out, so the two paths disagreed. `bestOffer` now returns `{ applied, awaitingActivation }`
   and only `applied` carries value.
2. **The catalog overruled the user.** `buildValuation` folded catalog program defaults into
   `byProgramId` before reading the user's rows, and `resolveCentsPerUnit` checks
   `byProgramId` before `byUnit` — so "all my points are worth 0.4¢" was silently replaced by
   the catalog's 1¢. Caught by a test that asserted a per-unit default should change the
   winner and found it did not.

### A footgun closed in the test harness

`supabaseFake` returned a queued result verbatim, so a test that wrote `{ data: [row] }`
without `error: null` produced `error: undefined` — and every production check is
`error !== null`, so the call threw. Three suites' worth of confusing failures. The fake now
normalises both fields, matching what the real client always sends.

---

## Phase 6 coverage — 7 further suites

Total after Phase 6: **1,730 tests across 57 suites.** Counts are from `jest --json`.

| Suite                                              | Tests | Covers                                                        |
| -------------------------------------------------- | ----- | ------------------------------------------------------------- |
| `src/features/admin/api/catalog.test.ts`           | 33    | **The three exit criteria** — create, verify, retire; refusal |
| `src/domain/catalog/bulkImport.test.ts`            | 26    | Per-row validation, and that it writes nothing                |
| `src/features/admin/ui/ConditionBuilder.test.tsx`  | 22    | MCC ranges, exclusions, and refused contradictions            |
| `src/domain/catalog/staleness.test.ts`             | 22    | The 90-day boundary to the day, and review ordering           |
| `app/admin/catalog.test.tsx`                       | 19    | The role gate, and that it says who really enforces           |
| `src/features/admin/ui/VerificationPanel.test.tsx` | 16    | Source required, append-only history, no "stale" choice       |
| `src/features/admin/ui/BulkImportPanel.test.tsx`   | 14    | Report before write, valid-only import, stale-report reset    |

`schemas.test.ts` grew from 58 to 78 assertions, covering the new condition and source
schemas — including the contradictions that make a rule unsatisfiable. `int4range.test.ts`
grew from 13 to 20, adding the write direction and a round-trip property.

### The three exit criteria, as tests

**An editor can create, verify and retire a rule.** All three flows run against the fake
client with the exact payload asserted:

- _create_ — every column, dates as ISO strings, and `verification_status: 'unverified'`,
  because saving is not verifying;
- _verify_ — `verification_history` is written **first** (it is append-only and cannot be
  rolled back, so the worst failure leaves an accurate record with the rule unchanged), then
  the rule. `verified_by` is the signed-in user, which the RLS policy requires. Only a
  `verified` outcome stamps `last_verified_at` — marking a rule disputed is not evidence
  anyone checked it today;
- _retire_ — `is_active = false` and status `retired`. A test asserts no `delete` was
  issued.

**A member is refused by the database, not merely by the UI.** Seven write paths — rule
insert, rule update, retire, condition write, source insert, bulk import, verification — are
each driven with **SQLSTATE 42501**, what Postgres returns when an RLS policy refuses. Each
must surface as a `forbidden` DataError with a permission message, which is what happens
whatever the client believed. `app/admin/catalog.test.tsx` then asserts the screen says the
same thing in words, and that the editing tools are hidden _because they would not work_ —
not as the protection.

**Every write is audited.** The trigger has existed since Phase 1. Phase 6 exposes it and
asserts the viewer states what the trail deliberately omits: column names, never values.

### Staleness is asserted to the day

```
verified 75 days ago → fresh          (15 days left)
verified 76 days ago → due for review (14 days left, the threshold)
verified 90 days ago → due for review (the last good day; still `verified`)
verified 91 days ago → OUT OF DATE    (effectiveStatus becomes `stale`, with no write)
```

Three statuses are deliberately _not_ aged: `disputed` and `retired` are stronger statements
than "stale", and `user_reported` was never a verification against a source, so it has
nothing to expire. Each has a test.

### Two harness fixes

`supabaseFake` was missing `ilike` from its chainable filter list, so a call using it threw
`is not a function` inside a `try` and surfaced as an opaque "unknown" DataError. The list is
now deliberately broader than today's call sites, and the reason is recorded beside it.

---

## Integration and RLS testing (Phase 7)

Structural RLS assertions catch a missing policy but not a wrong predicate. Phase 7 adds
tests against a real local Postgres:

- User A cannot read, update or delete any of User B's rows, per table
- A `member` cannot write to the catalog
- A `member` cannot set their own `role` to `admin`
- A user cannot attach an offer or enrollment to another user's card
- `UPDATE` and `DELETE` on `verification_history` and `audit_logs` fail
- `INSERT INTO audit_logs` from a client session fails
- Deleting an `auth.users` row cascades away every owned row
- `public.cap_period_window()` agrees with `resolveCapWindow()` across a year of dates

That last one matters: two implementations of the same rule will drift unless something
compares them.

---

## Coverage

Thresholds in `jest.config.js` are a floor, not a target:

| Scope                 | Statements | Branches | Functions | Lines |
| --------------------- | ---------- | -------- | --------- | ----- |
| `src/domain/rewards/` | 95         | 92       | 98        | 95    |
| `src/domain/`         | 95         | 92       | 95        | 95    |
| Everything else       | 55         | 55       | 40        | 55    |

The engine's are high because it is pure, total and has no excuse. The global figure is
dragged down by UI scaffolding whose behaviour arrives in Phases 5-6, and should rise with
each phase — it stood at 55% after Phase 3 and is 77% after Phase 4.

Note that a path-specific threshold _removes_ those files from the global calculation, so
the global row describes everything outside `src/domain/`.

Coverage is a smoke detector, not a goal. 100% coverage of code that asserts nothing about
correctness is worth less than one test that checks $7.20.
