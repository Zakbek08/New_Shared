/**
 * Step 9 of the engine: what is a point actually worth?
 *
 * The single biggest lever on a recommendation, and the reason two people with
 * identical wallets can correctly get different answers.
 *
 * A valuation of `0` is an ANSWER, not a missing value. It means "these points
 * are worthless to me", and the engine must honour it rather than substituting a
 * default. Every lookup below therefore distinguishes absent from zero.
 */
import type { RewardUnit } from '@/types/database';

import { unitsToUsd } from './money';
import type { RewardValuation } from './types';

/**
 * Cents per unit for a reward currency.
 *
 * Resolution order:
 *   1. the user's valuation for that specific reward program
 *   2. the user's default for that unit type
 *   3. `0` — refusing to invent a number
 *
 * Program defaults from `reward_programs.default_cents_per_unit` are folded into
 * `byProgramId` by the snapshot loader, so this function never needs to reach for
 * catalog data.
 *
 * Returns `null` for `usd`, where "cents per dollar" is meaningless: a cash-back
 * reward is already denominated in dollars.
 */
export function resolveCentsPerUnit(
  unit: RewardUnit,
  rewardProgramId: string | null,
  valuation: RewardValuation,
): number | null {
  if (unit === 'usd') return null;

  if (rewardProgramId !== null) {
    const byProgram = valuation.byProgramId[rewardProgramId];
    // `??` rather than `||`, so an explicit 0 is kept.
    if (byProgram !== undefined) return byProgram;
  }

  return valuation.byUnit[unit] ?? 0;
}

/**
 * Values a reward quantity in USD.
 *
 * For `usd` the quantity *is* the value. For points and miles it is converted
 * with the user's own cents-per-unit figure.
 */
export function valueRewardUsd(
  grossRewardUnits: number,
  unit: RewardUnit,
  rewardProgramId: string | null,
  valuation: RewardValuation,
): { readonly valueUsd: number; readonly centsPerUnit: number | null } {
  if (unit === 'usd') {
    return { valueUsd: grossRewardUnits, centsPerUnit: null };
  }

  // A cash-back-only user has declared points and miles worth nothing to them.
  if (valuation.prefersCashBackOnly) {
    return { valueUsd: 0, centsPerUnit: 0 };
  }

  const centsPerUnit = resolveCentsPerUnit(unit, rewardProgramId, valuation) ?? 0;
  return { valueUsd: unitsToUsd(grossRewardUnits, centsPerUnit), centsPerUnit };
}

/** Whether a unit is one the user has declined to value at all. */
export function isDeclinedUnit(unit: RewardUnit, valuation: RewardValuation): boolean {
  return valuation.prefersCashBackOnly && unit !== 'usd';
}

/**
 * Whether the valuation used was the user's own or a fallback.
 *
 * Drives the `estimated_point_valuation` warning: a figure resting on a default
 * deserves to be labelled as an estimate.
 */
export function isExplicitValuation(
  unit: RewardUnit,
  rewardProgramId: string | null,
  valuation: RewardValuation,
): boolean {
  if (unit === 'usd') return true;
  if (rewardProgramId !== null && valuation.byProgramId[rewardProgramId] !== undefined) {
    return true;
  }
  return valuation.byUnit[unit] !== undefined;
}
