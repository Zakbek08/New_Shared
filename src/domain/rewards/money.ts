/**
 * Deterministic money arithmetic for the rewards engine.
 *
 * Every function here is pure and total: same inputs, same output, no clock, no
 * locale, no I/O. That is what makes reward figures reproducible and testable,
 * and it is a hard requirement — see CLAUDE.md.
 *
 * Formatting for display lives in `src/lib/format.ts`; this module deals only
 * in numbers.
 */

/** Cents in one US dollar. */
const CENTS_PER_USD = 100;

/**
 * Rounds to `decimals` places, half away from zero.
 *
 * `Math.round(x * 100) / 100` is not good enough on its own: `1.005 * 100` is
 * `100.49999999999999` in IEEE-754, so a naive implementation rounds it down to
 * `1.00`. We nudge the scaled value by a few units in the last place — a
 * relative correction, so it stays safe at large magnitudes — before rounding.
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`roundTo received a non-finite value: ${value}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 12) {
    throw new RangeError(`roundTo decimals must be an integer in 0..12, got ${decimals}`);
  }

  const factor = 10 ** decimals;
  const scaled = value * factor;
  const nudged = scaled + Math.sign(scaled) * Math.abs(scaled) * Number.EPSILON * 4;

  // Round the magnitude and reapply the sign, so ties go away from zero in both
  // directions. `Math.round` alone would send -0.5 to -0.
  const rounded = Math.sign(nudged) * Math.round(Math.abs(nudged));

  const result = rounded / factor;
  // Normalise -0 to 0 so equality assertions behave predictably.
  return result === 0 ? 0 : result;
}

/** Rounds a USD amount to whole cents. */
export function roundUsd(value: number): number {
  return roundTo(value, 2);
}

/**
 * Rounds a points/miles quantity.
 *
 * Six decimal places matches `numeric(16,6)` in the database. Issuers round
 * points differently (some to whole points per transaction, some not at all),
 * so the engine keeps fractional units and says "estimated".
 */
export function roundUnits(value: number): number {
  return roundTo(value, 6);
}

/** `percent` is a percentage, so `percentOf(120, 6)` is `7.2`. */
export function percentOf(amountUsd: number, percent: number): number {
  assertFiniteNonNegative(amountUsd, 'amountUsd');
  assertFiniteNonNegative(percent, 'percent');
  return roundUsd((amountUsd * percent) / 100);
}

/** `multiplier` is units per dollar, so `unitsFor(120, 4)` is `480`. */
export function unitsFor(amountUsd: number, multiplier: number): number {
  assertFiniteNonNegative(amountUsd, 'amountUsd');
  assertFiniteNonNegative(multiplier, 'multiplier');
  return roundUnits(amountUsd * multiplier);
}

/**
 * Converts a points/miles quantity into USD using a cents-per-unit valuation.
 *
 * `centsPerUnit` is US cents, so `1.5` means "one point is worth 1.5 cents".
 * A valuation of `0` is legitimate: it means the user considers the currency
 * worthless, and the engine must respect that rather than substituting a
 * default.
 */
export function unitsToUsd(units: number, centsPerUnit: number): number {
  assertFiniteNonNegative(units, 'units');
  assertFiniteNonNegative(centsPerUnit, 'centsPerUnit');
  return roundUsd((units * centsPerUnit) / CENTS_PER_USD);
}

/**
 * Splits `amountUsd` into the part covered by a remaining cap and the part that
 * overflows it.
 *
 * `remainingCapUsd` of `null` means the rule is uncapped, so nothing overflows.
 * A remaining cap of `0` means the cap is exhausted and everything overflows.
 */
export function splitAtCap(
  amountUsd: number,
  remainingCapUsd: number | null,
): { readonly withinCapUsd: number; readonly overCapUsd: number } {
  assertFiniteNonNegative(amountUsd, 'amountUsd');

  if (remainingCapUsd === null) {
    return { withinCapUsd: roundUsd(amountUsd), overCapUsd: 0 };
  }

  assertFiniteNonNegative(remainingCapUsd, 'remainingCapUsd');
  const withinCapUsd = Math.min(amountUsd, remainingCapUsd);
  return {
    withinCapUsd: roundUsd(withinCapUsd),
    overCapUsd: roundUsd(amountUsd - withinCapUsd),
  };
}

/**
 * The foreign transaction fee charged on a purchase.
 *
 * Returns `0` when the purchase is in the card's home currency, because the fee
 * only applies to foreign-currency transactions. The fee is a *cost*, so the
 * engine subtracts it from a candidate's net value — which is exactly why a
 * high-earning card can still lose to a no-fee card abroad.
 */
export function foreignTransactionFee(
  amountUsd: number,
  feePercent: number,
  options: { readonly purchaseCurrency: string; readonly homeCurrency: string },
): number {
  assertFiniteNonNegative(amountUsd, 'amountUsd');
  assertFiniteNonNegative(feePercent, 'feePercent');

  const isForeignCurrency =
    options.purchaseCurrency.toUpperCase() !== options.homeCurrency.toUpperCase();
  if (!isForeignCurrency || feePercent === 0) return 0;

  return percentOf(amountUsd, feePercent);
}

/** Clamps to zero. Reward values are never negative in WalletWise. */
export function atLeastZero(value: number): number {
  return value > 0 ? value : 0;
}

function assertFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number, got ${value}`);
  }
  if (value < 0) {
    throw new RangeError(`${name} must not be negative, got ${value}`);
  }
}
