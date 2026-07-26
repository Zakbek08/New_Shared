/**
 * Step 2-3 of the engine: does this purchase satisfy a rule's conditions?
 *
 * SEMANTICS, restated because they are easy to get backwards:
 *  - Every condition row attached to a rule must pass. Rows are ANDed.
 *  - Within a row, each populated field is a separate constraint, also ANDed.
 *  - Array fields are OR-lists: the purchase must match *one* of the values.
 *  - **An empty array is no constraint at all**, not an empty allow-list.
 *  - A rule with no condition rows is unconditional.
 *  - Exclusions are absolute: they beat every inclusion.
 *
 * Pure. No clock — the instant arrives as `asOf`.
 */
import type {
  EvaluableCondition,
  EvaluableRule,
  IneligibilityCode,
  PurchaseIntent,
} from './types';

export type ConditionOutcome =
  { readonly matched: true } | { readonly matched: false; readonly code: IneligibilityCode };

const MATCHED: ConditionOutcome = { matched: true };

const failed = (code: IneligibilityCode): ConditionOutcome => ({ matched: false, code });

/** Country and currency codes are compared case-insensitively. */
const sameCode = (a: string, b: string): boolean => a.toUpperCase() === b.toUpperCase();

const containsCode = (haystack: readonly string[], needle: string): boolean =>
  haystack.some((candidate) => sameCode(candidate, needle));

/**
 * Whether `asOf` falls inside `[startsAt, endsAt)`.
 *
 * The start bound is inclusive and the end bound exclusive, matching the cap
 * windows and the `[)` ranges in SQL. A rotating quarter that ends at
 * 2026-10-01T00:00:00Z is therefore over at exactly that instant.
 */
export function windowContains(
  startsAt: Date | null,
  endsAt: Date | null,
  asOf: Date,
): ConditionOutcome {
  const time = asOf.getTime();
  if (startsAt !== null && time < startsAt.getTime()) return failed('rule_not_yet_active');
  if (endsAt !== null && time >= endsAt.getTime()) return failed('rule_expired');
  return MATCHED;
}

function mccInRanges(mcc: number, ranges: readonly (readonly [number, number])[]): boolean {
  return ranges.some(([from, to]) => mcc >= from && mcc <= to);
}

/**
 * Evaluates one condition row.
 *
 * Exclusions are checked before inclusions. Both orders produce the same
 * pass/fail verdict — every field is ANDed — but the *reported code* differs, and
 * "this merchant is excluded" is a far more useful thing to tell a user than
 * "category mismatch".
 */
export function matchesCondition(
  condition: EvaluableCondition,
  intent: PurchaseIntent,
  asOf: Date,
): ConditionOutcome {
  // --- Exclusions: absolute, and the most informative failures ---------------
  if (intent.merchantId !== null && condition.excludedMerchantIds.includes(intent.merchantId)) {
    return failed('merchant_excluded');
  }

  if (intent.categoryId !== null && condition.excludedCategoryIds.includes(intent.categoryId)) {
    return failed('category_mismatch');
  }

  if (intent.mcc !== null && condition.excludedMccs.includes(intent.mcc)) {
    return failed('mcc_mismatch');
  }

  if (containsCode(condition.excludedCountryCodes, intent.countryCode)) {
    return failed('country_not_supported');
  }

  // --- Validity window ------------------------------------------------------
  const window = windowContains(condition.startsAt, condition.endsAt, asOf);
  if (!window.matched) return window;

  // --- Category ------------------------------------------------------------
  if (condition.categoryIds.length > 0) {
    // A missing category cannot satisfy a category constraint. The engine does
    // not guess one to make a bonus fit — see `category_missing` in the warnings.
    if (intent.categoryId === null || !condition.categoryIds.includes(intent.categoryId)) {
      return failed('category_mismatch');
    }
  }

  // --- MCC -----------------------------------------------------------------
  const hasMccConstraint =
    condition.includedMccs.length > 0 || condition.includedMccRanges.length > 0;
  if (hasMccConstraint) {
    if (intent.mcc === null) return failed('mcc_mismatch');
    const matches =
      condition.includedMccs.includes(intent.mcc) ||
      mccInRanges(intent.mcc, condition.includedMccRanges);
    if (!matches) return failed('mcc_mismatch');
  }

  // --- Merchant ------------------------------------------------------------
  if (condition.includedMerchantIds.length > 0) {
    if (
      intent.merchantId === null ||
      !condition.includedMerchantIds.includes(intent.merchantId)
    ) {
      return failed('merchant_not_included');
    }
  }

  // --- Geography and currency ----------------------------------------------
  if (
    condition.includedCountryCodes.length > 0 &&
    !containsCode(condition.includedCountryCodes, intent.countryCode)
  ) {
    return failed('country_not_supported');
  }

  if (
    condition.includedCurrencyCodes.length > 0 &&
    !containsCode(condition.includedCurrencyCodes, intent.currencyCode)
  ) {
    return failed('currency_not_supported');
  }

  // --- Channel -------------------------------------------------------------
  // `either` always matches; the intent is never `either`, by type.
  if (condition.channel !== 'either' && condition.channel !== intent.channel) {
    return failed('channel_mismatch');
  }

  // --- Payment method ------------------------------------------------------
  if (
    condition.includedPaymentMethods.length > 0 &&
    !condition.includedPaymentMethods.includes(intent.paymentMethod)
  ) {
    return failed('payment_method_mismatch');
  }

  // --- Amount --------------------------------------------------------------
  if (condition.minAmountUsd !== null && intent.amountUsd < condition.minAmountUsd) {
    return failed('amount_below_minimum');
  }
  if (condition.maxAmountUsd !== null && intent.amountUsd > condition.maxAmountUsd) {
    return failed('amount_above_maximum');
  }

  return MATCHED;
}

/**
 * Whether a rule qualifies: its own window, then every condition row.
 *
 * Does *not* check enrollment, caps or spend thresholds — those depend on
 * per-user state and are handled by the caller, so this function stays a pure
 * predicate over the rule and the purchase.
 */
export function matchesRule(
  rule: EvaluableRule,
  intent: PurchaseIntent,
  asOf: Date,
): ConditionOutcome {
  const ruleWindow = windowContains(rule.startsAt, rule.endsAt, asOf);
  if (!ruleWindow.matched) return ruleWindow;

  for (const condition of rule.conditions) {
    const outcome = matchesCondition(condition, intent, asOf);
    if (!outcome.matched) return outcome;
  }

  return MATCHED;
}

/**
 * How informative each rejection reason is, most first.
 *
 * When several rules fail for different reasons the engine reports the most
 * *actionable* one. `not_enrolled` leads because it is the only reason the user
 * can do something about in the next thirty seconds.
 */
const REASON_PRIORITY: readonly IneligibilityCode[] = [
  'not_enrolled',
  'merchant_excluded',
  'cap_exhausted',
  'spend_threshold_not_met',
  'rule_expired',
  'rule_not_yet_active',
  'channel_mismatch',
  'payment_method_mismatch',
  'amount_below_minimum',
  'amount_above_maximum',
  'currency_not_supported',
  'country_not_supported',
  'merchant_not_included',
  'mcc_mismatch',
  'category_mismatch',
  'non_cash_reward_declined',
  'zero_value_reward',
  'no_active_rules',
  'card_excluded_by_user',
];

/** Picks the most actionable code from a set of observed failures. */
export function mostInformativeCode(
  codes: readonly IneligibilityCode[],
): IneligibilityCode | null {
  for (const candidate of REASON_PRIORITY) {
    if (codes.includes(candidate)) return candidate;
  }
  return codes[0] ?? null;
}
