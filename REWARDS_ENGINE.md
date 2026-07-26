# Rewards engine

## The contract

```ts
type EvaluateWallet = (
  intent: PurchaseIntent,
  cards: readonly EvaluableCard[],
  context: EvaluationContext, // { asOf, homeCurrencyCode, valuation }
) => RecommendationResult;
```

A pure function. No clock, no network, no randomness, no language model. Time enters
through `context.asOf`, which is what makes the output reproducible and every test
meaningful.

Contracts: `src/domain/rewards/types.ts`. Implementation (Phase 3): `evaluate.ts`,
`rank.ts`, `explain.ts`.

**Status:** Phase 1 ships the contracts plus two implemented, tested modules — `money.ts`
(arithmetic) and `capWindow.ts` (cap-period resolution). The evaluation and ranking
functions land in Phase 3.

---

## The rule that governs everything

> Every reward figure originates from a validated database record and a deterministic
> TypeScript function. No language model produces, adjusts or checks a rate.

If a rate is not in `reward_rules`, the answer is "we do not know". A plausible guess in a
financial app is worse than an admitted gap, because the user acts on it.

---

## The twelve steps

Run per card, then across cards.

### 1. Collect all active rules

Filter `reward_rules` to `is_active = true` for the card's product, sorted by `priority`
descending. Skip cards with `is_excluded_from_recommendations = true`
(`card_excluded_by_user`) or no active rules (`no_active_rules`).

Check `supported_country_codes` against `intent.countryCode` → `country_not_supported`.

### 2. Determine whether the purchase qualifies

For each rule, every attached condition row must pass. Within a row, each populated field
is a separate constraint; array fields are OR-lists.

| Check                                                         | Failure code                           |
| ------------------------------------------------------------- | -------------------------------------- |
| Rule window contains `asOf`                                   | `rule_not_yet_active` / `rule_expired` |
| Condition window contains `asOf`                              | same                                   |
| Category ∈ (`merchant_category_id` ∪ `included_category_ids`) | `category_mismatch`                    |
| MCC ∈ `included_mccs` ∪ `included_mcc_ranges`                 | `mcc_mismatch`                         |
| Country ∈ `included_country_codes`                            | `country_not_supported`                |
| Currency ∈ `included_currency_codes`                          | `currency_not_supported`               |
| Channel matches (`either` always matches)                     | `channel_mismatch`                     |
| Payment method ∈ `included_payment_methods`                   | `payment_method_mismatch`              |
| `amount >= min_amount_usd`                                    | `amount_below_minimum`                 |
| `amount <= max_amount_usd`                                    | `amount_above_maximum`                 |

An empty array is **no constraint**, not an empty allow-list. A rule with no condition rows
is unconditional.

**Missing category.** When `intent.categoryId` is `null`, category-constrained rules cannot
qualify; only unconditional rules do. So a wallet still gets an answer — typically the
flat-rate card — with confidence reduced to `low` and a `category_missing` warning. The
engine does not guess a category to make a bonus fit.

### 3. Apply exclusions

Exclusions are absolute and beat every inclusion:

- `excluded_merchant_ids` contains the merchant → `merchant_excluded`
- `excluded_category_ids` contains the category → `category_mismatch`
- `excluded_mccs` contains the MCC → `mcc_mismatch`
- `excluded_country_codes` contains the country → `country_not_supported`

This is how "6% at supermarkets, but not warehouse clubs" is expressed, and why BulkBarn
Warehouse does not earn the grocery bonus in the seed data.

### 4. Check enrollment

If `requires_enrollment` and the user is not enrolled → `not_enrolled`.

Enrollment is **self-reported** (`user_rule_enrollments.status`), because WalletWise never
logs in to an issuer. A rule blocked only by enrollment is surfaced with an
`enrollment_required` warning and an activation link, rather than silently dropped — an
un-activated 5% quarter is worth telling the user about.

### 5. Compute the remaining cap

`resolveCapWindow(rule.capPeriod, { asOf, accountOpenedOn })` gives the window; sum the
matching `reward_usage` row.

```
remaining = max(0, cap_amount − consumed)
```

`cap_applies_to` decides whether the cap limits **spend** or **accrued reward**.

Then `splitAtCap(amount, remaining)` divides the purchase:

- **Under the cap** → full rate
- **Over the cap** → `post_cap_rate`, or the card's base rule when `post_cap_rate` is `NULL`
- **Cap exhausted** and no fallback → `cap_exhausted`

A partially-remaining cap produces a blended figure and a `cap_partially_available`
warning. `cap_nearly_reached` fires when little is left.

Cap windows are **UTC calendar-based**. Real issuers use unpublished statement cycles, so
these figures are estimates — stated in `capWindow.ts` and disclosed in-app.

### 6. Apply base and bonus rates

`effectiveRate = base_rate + bonus_rate`.

**Stacking.** Within a `stack_group`, the single best-earning qualifying rule wins.
Rules with `is_stackable = true` are then added on top.

Card 8 in the seed data shows both: a 5% online rule in group `category`, plus a 2% intro
bonus in group `intro` marked stackable → 7% on a qualifying online purchase.

| Reward type         | Arithmetic                                  |
| ------------------- | ------------------------------------------- |
| `cash_back_percent` | `percentOf(spend, rate)` → USD              |
| `points_per_dollar` | `unitsFor(spend, rate)` → points            |
| `miles_per_dollar`  | `unitsFor(spend, rate)` → miles             |
| `statement_credit`  | `fixed_amount_usd`, capped by `max_benefit` |
| `fixed_amount`      | `fixed_amount_usd`                          |

### 7. Apply active merchant offers

An offer applies when it is enrolled or available, `asOf` is inside its window, the
merchant matches, the channel matches, and `amount >= minimum_spend_usd`. Its value is
capped by `max_benefit_usd`.

Offers stack on top of the rule reward — that is what a targeted offer is. An offer needing
activation adds `offer_requires_activation`.

### 8. Subtract the foreign transaction fee

```
fee = purchaseCurrency ≠ homeCurrency ? percentOf(amount, feePercent) : 0
```

Subtracted from net value, and flagged `foreign_transaction_fee_applied` in red.

This step decides real cases. A card earning 3x miles at 1¢ returns $3.00 on $100 but
charges 3% → **$0.00 net**. A plain 2% no-fee card returns **$2.00** and wins. Both figures
are asserted in `money.test.ts`.

### 9. Convert points and miles to USD

```
valueUsd = unitsToUsd(units, centsPerUnit)      // units × cents ÷ 100
```

`centsPerUnit` resolution order:

1. The user's valuation for that specific program
2. The user's default for that unit type
3. `reward_programs.default_cents_per_unit`

**A user valuation of `0` is an answer, not a gap.** It means "worthless to me" and must be
honoured — not replaced by a default. If `prefersCashBackOnly` is set, non-cash rewards
score `0` with `non_cash_reward_declined`.

This step is why identical wallets can correctly rank differently. Card 9 earns 10x on a
0.6¢ currency (6% effective); card 10 earns 3x on a 1.3¢ currency (3.9% effective). Which
wins depends entirely on the user's numbers.

### 10. Assign a confidence score

Starts at `high` and is reduced by the weakest link:

| Cause                                   | Result                                       |
| --------------------------------------- | -------------------------------------------- |
| `has_ambiguous_coding` on the merchant  | `low` + `merchant_coding_uncertain`          |
| `category_match_kind = 'inferred'`      | at most `medium` + `category_inferred`       |
| `category_match_kind = 'unknown'`       | `low` + `category_missing`                   |
| `verification_status = 'unverified'`    | at most `medium` + `source_unverified`       |
| `verification_status = 'stale'`         | at most `medium` + `source_stale`            |
| `verification_status = 'user_reported'` | at most `medium`                             |
| Cap partially remaining                 | at most `medium` + `cap_partially_available` |
| Points/miles valued by estimate         | `estimated_point_valuation`                  |

An `exact_merchant` match on a `verified` cash-back rule with no cap is the only route to
`high`.

### 11. Rank by estimated net value

```
netValueUsd = rewardValueUsd + offerValueUsd + statementCreditUsd − foreignTransactionFeeUsd
```

Clamped at zero. Sorted descending, then tie-broken in order:

1. **User's preferred card** (`is_preferred`) → `tie_broken_by_preference`
2. **Higher confidence**
3. **Cash back over points**, since it needs no redemption effort
4. **Fewer warnings**
5. **Card display name**, alphabetically — so the result is stable, never arbitrary

`minimumSwitchBenefitUsd` applies last: if the winner beats the user's preferred card by
less than that, the preferred card is recommended instead. A three-cent switch is not worth
reaching into a different pocket.

### 12. Return the winner, runner-up and non-qualifying cards

```ts
{
  recommended, runnerUp,
  eligible: [...],      // best first
  ineligible: [...],    // each with an ineligibilityCode
  advantageOverRunnerUpUsd,
  confidence, warnings, explanation,
}
```

Non-qualifying cards are returned, never hidden. "Why not my other card?" is the question
that earns trust.

---

## Worked example — the specification case

Purchase: **$120 at Whole Foods, grocery, Apple Pay, United States.** Using the seed
catalog, `asOf` = 26 July 2026, no cap consumed, points valued at 1.25¢.

| Card                           | Rule                                            | Arithmetic                  | Net          |
| ------------------------------ | ----------------------------------------------- | --------------------------- | ------------ |
| **Northwind Everyday Grocery** | 6% supermarkets, $6,000/yr                      | `120 × 6% = 7.20`           | **$7.20** ✅ |
| Harborline Quarterly Rotator   | Q3 5% grocery — **needs activation**            | `120 × 5% = 6.00`           | $6.00 ⚠️     |
| Cobalt Table Dining            | 3x online grocery — **in-store here** → base 1x | `120 × 1 = 120 pts × 1.25¢` | $1.50        |
| Cobalt Everyday Flat           | 2% everything                                   | `120 × 2% = 2.40`           | $2.40        |
| Northwind TapPay               | 3% mobile wallet (Apple Pay ✓)                  | `120 × 3% = 3.60`           | $3.60        |
| Meridian Fuel Advantage        | 2% supermarkets                                 | `120 × 2% = 2.40`           | $2.40        |

**Result:** Northwind Everyday Grocery, $7.20. Runner-up Harborline Rotator at $6.00,
advantage $1.20 — with an `enrollment_required` warning, since the rotator only earns $6.00
if the quarter was activated.

Now change one input. If the merchant were **BulkBarn Warehouse** instead:

- The grocery bonus is excluded by `excluded_merchant_ids` → drops to 1% = $1.20
- `has_ambiguous_coding` fires → `merchant_coding_uncertain`, confidence `low`
- **Northwind TapPay wins at $3.60** on the mobile-wallet bonus

Same amount, same category, entirely different answer — which is exactly why exclusions and
coding uncertainty are modelled rather than approximated.

---

## Implemented modules

### `money.ts`

Pure arithmetic. All exports are total and validate their inputs.

| Function                          | Purpose                                          |
| --------------------------------- | ------------------------------------------------ |
| `roundTo(value, decimals)`        | Half away from zero, with an IEEE-754 correction |
| `roundUsd`, `roundUnits`          | Cents; six decimal places                        |
| `percentOf(amount, percent)`      | `percentOf(120, 6) === 7.2`                      |
| `unitsFor(amount, multiplier)`    | `unitsFor(120, 4) === 480`                       |
| `unitsToUsd(units, centsPerUnit)` | `unitsToUsd(480, 1.25) === 6`                    |
| `splitAtCap(amount, remaining)`   | Within-cap / over-cap split                      |
| `foreignTransactionFee(...)`      | `0` in the home currency                         |
| `atLeastZero(value)`              | Clamp                                            |

**Why `roundTo` is not one line.** `1.005 × 100` is `100.49999999999999` in IEEE-754, so
`Math.round(x * 100) / 100` returns `1.00` instead of `1.01`. `roundTo` nudges the scaled
value by a few units in the last place — a _relative_ correction, so it stays correct at
large magnitudes where the common `+ Number.EPSILON` trick fails — then rounds the
magnitude and reapplies the sign, giving half-away-from-zero in both directions. All three
behaviours are pinned by tests.

### `capWindow.ts`

Resolves a `cap_period` to a concrete window.

| Period               | Window                                                    |
| -------------------- | --------------------------------------------------------- |
| `none`               | `null` — uncapped                                         |
| `monthly`            | UTC calendar month                                        |
| `quarterly`          | UTC calendar quarter                                      |
| `semi_annual`        | Jan-Jun or Jul-Dec                                        |
| `calendar_year`      | UTC calendar year                                         |
| `cardmember_year`    | Account anniversary; falls back to 1 January when unknown |
| `lifetime`           | `{ startsAt: null, endsAt: null }`                        |
| `promotional_window` | The rule's own dates; `null` if it has no end date        |

Bounds are `[start, end)`, matching the SQL `tstzrange`. `public.cap_period_window()`
mirrors this exactly — including exact anniversary arithmetic rather than epoch division,
which would drift by a day around anniversaries.

Also: `isWithinCapWindow`, `daysRemainingInWindow` (for "resets in 12 days").

---

## Explanation layer

Deterministic assembly from the completed breakdown. Given:

```
rule "6% cash back at US supermarkets, on up to $6,000 per calendar year"
spend $120, rate 6%, reward $7.20, cap $6,000/yr, remaining $6,000
runner-up $6.00
```

it produces:

> Use your Northwind Everyday Grocery Card. You will earn about **$7.20** — 6% cash back at
> US supermarkets. $6,000 of the annual bonus cap is still available. Your next best option
> earns about $6.00.

A language model may rephrase this using only the numbers already computed. It may not
alter them. The deterministic string is always available and is what gets persisted, so the
explanation never becomes the weakest link in a financial figure.

---

## Testing

Every step above has a corresponding entry in the [TESTING.md](TESTING.md) matrix. Phase 3
lands the full matrix before the recommendation UI is built on top of the engine.

Phase 1 has 393 tests covering arithmetic, cap windows, the taxonomy, validation,
redaction, contrast and schema invariants.
