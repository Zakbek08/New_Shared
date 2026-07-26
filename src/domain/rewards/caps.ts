/**
 * Step 5 of the engine: how much of a rule's spending cap is left?
 *
 * Cap figures are ESTIMATES. Real issuers measure caps against a statement cycle
 * whose boundaries they do not publish, so WalletWise uses UTC calendar windows
 * (see `capWindow.ts`) and says so in the UI.
 */
import type { CapPeriod } from '@/types/database';

import { atLeastZero, roundUsd } from './money';
import { resolveCapWindow, type CapWindow } from './capWindow';
import type { CapUsageSnapshot, EvaluableCard, EvaluableRule } from './types';

export interface RuleCap {
  /** `null` when the rule is uncapped. */
  readonly capAmountUsd: number | null;
  /** `null` when uncapped; `0` when exhausted. In the unit `capAppliesTo` names. */
  readonly capRemainingUsd: number | null;
  readonly capPeriod: CapPeriod | null;
  readonly window: CapWindow | null;
  readonly consumedUsd: number;
  readonly appliesTo: 'spend' | 'reward';
}

const UNCAPPED: RuleCap = {
  capAmountUsd: null,
  capRemainingUsd: null,
  capPeriod: null,
  window: null,
  consumedUsd: 0,
  appliesTo: 'spend',
};

/**
 * Whether a recorded usage row belongs to the window we just resolved.
 *
 * Tested by overlap rather than exact equality: both describe the same period,
 * but a row written under a slightly different boundary convention should still
 * count. A *previous* quarter's row does not overlap the current one, so it is
 * correctly ignored — which is what makes caps reset.
 */
export function usageAppliesToWindow(window: CapWindow, usage: CapUsageSnapshot): boolean {
  if (window.startsAt !== null && usage.periodEnd.getTime() <= window.startsAt.getTime()) {
    return false;
  }
  if (window.endsAt !== null && usage.periodStart.getTime() >= window.endsAt.getTime()) {
    return false;
  }
  return true;
}

/**
 * Resolves a rule's cap against the user's recorded usage.
 *
 * Returns `UNCAPPED` when `capAmount` is null. When a cap exists but its window
 * cannot be resolved — a `promotional_window` cap on a rule with no end date,
 * which the database forbids but a hand-built snapshot could still contain — the
 * cap is treated as fully available rather than silently blocking the rule.
 */
export function resolveRuleCap(rule: EvaluableRule, card: EvaluableCard, asOf: Date): RuleCap {
  if (rule.capAmount === null) return UNCAPPED;

  const window = resolveCapWindow(rule.capPeriod, {
    asOf,
    accountOpenedOn: card.accountOpenedOn,
    promotionStartsAt: rule.startsAt,
    promotionEndsAt: rule.endsAt,
  });

  if (window === null) {
    return {
      capAmountUsd: rule.capAmount,
      capRemainingUsd: rule.capAmount,
      capPeriod: rule.capPeriod,
      window: null,
      consumedUsd: 0,
      appliesTo: rule.capAppliesTo,
    };
  }

  const usage = card.capUsage[rule.id];
  const consumedUsd =
    usage !== undefined && usageAppliesToWindow(window, usage)
      ? rule.capAppliesTo === 'spend'
        ? usage.qualifyingSpendUsd
        : usage.accruedRewardUsd
      : 0;

  return {
    capAmountUsd: rule.capAmount,
    capRemainingUsd: roundUsd(atLeastZero(rule.capAmount - consumedUsd)),
    capPeriod: rule.capPeriod,
    window,
    consumedUsd: roundUsd(consumedUsd),
    appliesTo: rule.capAppliesTo,
  };
}

/** Fraction of the cap already used, 0-1. `null` when uncapped. */
export function capUtilisation(cap: RuleCap): number | null {
  if (cap.capAmountUsd === null || cap.capAmountUsd === 0) return null;
  return Math.min(1, cap.consumedUsd / cap.capAmountUsd);
}

/** Whether little enough is left to be worth warning about. */
export function isCapNearlyReached(cap: RuleCap): boolean {
  const used = capUtilisation(cap);
  return used !== null && used >= 0.8 && used < 1;
}

export function isCapExhausted(cap: RuleCap): boolean {
  return cap.capRemainingUsd !== null && cap.capRemainingUsd === 0;
}
