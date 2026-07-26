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

## Phase 3 engine matrix — required before the recommendation UI

Every row is required by the specification. Each needs at least one test with a hand-checked
expected value.

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

Thresholds in `jest.config.js` are a floor, not a target: statements 40%, branches 30%,
functions 35%, lines 40%. They are set low in Phase 1 because most of `src/` is UI scaffold
awaiting later phases.

**Phase 3 must raise them.** `src/domain/rewards/` should reach 95%+ statements and branches
— it is pure, total, and has no excuse. `src/domain/` overall should reach 90%.

Coverage is a smoke detector, not a goal. 100% coverage of code that asserts nothing about
correctness is worth less than one test that checks $7.20.
