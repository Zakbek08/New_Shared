/**
 * What a purchase the user actually made does to a cap.
 *
 * `reward_usage` is how the engine knows a 6%-on-$6,000 bonus has $50 left rather
 * than $6,000. Nothing else fills it in: WalletWise never sees a transaction feed,
 * so the only signal is the user confirming "I used this card".
 *
 * That makes this arithmetic pure and worth testing directly. The delta is derived
 * from the breakdown the engine already produced, never recomputed from a rate — if
 * the engine said $50 of the purchase earned the bonus, $50 is what consumes the
 * cap.
 *
 * SELF-REPORTED, AND THEREFORE INCOMPLETE. A user who forgets to confirm a purchase
 * leaves the cap looking emptier than it is. `is_user_adjusted` on the row records
 * which figures came from a confirmation and which the user typed in themselves.
 */
import { resolveCapWindow } from './capWindow';
import { atLeastZero, roundUnits, roundUsd } from './money';
import type { CapUsageSnapshot, RecommendationCandidate } from './types';

import type { CapPeriod } from '@/types/database';

/** One capped rule's consumption from a single purchase. */
export interface UsageDelta {
  readonly userCardId: string;
  readonly rewardRuleId: string;
  readonly capPeriod: CapPeriod;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  /** Spend that earned the bonus rate, so counted against a spend cap. */
  readonly qualifyingSpendUsd: number;
  readonly accruedRewardUnits: number;
  readonly accruedRewardUsd: number;
}

/**
 * The cap consumption to record for an accepted recommendation.
 *
 * Returns `null` — meaning "nothing to record" — when the winning rule is uncapped,
 * when no rule applied, or when the cap window cannot be resolved. An uncapped rule
 * has no progress to track, and writing a row for it would be noise in a table the
 * engine reads on every evaluation.
 *
 * KNOWN LIMITATION, stated rather than hidden. Only the *primary* rule's cap is
 * recorded. When two stackable rules both applied and both are capped, the
 * secondary rule's cap is not decremented, so it will look emptier than it is. The
 * breakdown the engine persists carries one `appliedRuleId`, and inferring the rest
 * here would mean re-deriving a calculation instead of reading it. Recording the
 * primary rule is the honest subset; recording a guess would not be.
 */
export function usageDeltaFor(options: {
  readonly candidate: RecommendationCandidate;
  readonly asOf: Date;
}): UsageDelta | null {
  const { candidate, asOf } = options;
  const { breakdown, card } = candidate;

  if (!candidate.isEligible) return null;

  const ruleId = breakdown.appliedRuleId;
  if (ruleId === null) return null;

  const rule = card.rules.find((candidateRule) => candidateRule.id === ruleId);
  if (rule === undefined) return null;
  if (rule.capAmount === null) return null;

  const window = resolveCapWindow(rule.capPeriod, {
    asOf,
    accountOpenedOn: card.accountOpenedOn,
    promotionStartsAt: rule.startsAt,
    promotionEndsAt: rule.endsAt,
  });

  // `null` here means the period is `none` — an uncapped rule wearing a cap amount,
  // or a promotional cap with no dates to anchor to. Neither has progress to track.
  if (window === null) return null;

  // A lifetime cap resolves to an unbounded window, but `reward_usage.period_start`
  // and `period_end` are NOT NULL. Fall back to a one-day window at the purchase
  // instant: it satisfies `period_start < period_end` and still overlaps every
  // future lookup, because `usageAppliesToWindow` tests overlap rather than
  // equality and a lifetime window overlaps everything.
  const periodStart = window.startsAt ?? asOf;
  const periodEnd = window.endsAt ?? new Date(asOf.getTime() + 86_400_000);

  return {
    userCardId: card.userCardId,
    rewardRuleId: ruleId,
    capPeriod: rule.capPeriod,
    periodStart,
    periodEnd,
    // Only the portion that earned the bonus counts against the cap. Spend above
    // the cap earned the post-cap rate and must not be double-counted.
    qualifyingSpendUsd: roundUsd(atLeastZero(breakdown.withinCapSpendUsd)),
    accruedRewardUnits: roundUnits(atLeastZero(breakdown.grossRewardUnits)),
    accruedRewardUsd: roundUsd(atLeastZero(breakdown.rewardValueUsd)),
  };
}

/**
 * Adds a delta to whatever was already recorded for the same window.
 *
 * `existing` is ignored when it belongs to a different window — a new quarter
 * starts from zero, which is exactly how a cap resets.
 */
export function mergeUsage(
  existing: CapUsageSnapshot | null,
  delta: UsageDelta,
): CapUsageSnapshot {
  const isSameWindow =
    existing !== null &&
    existing.periodStart.getTime() === delta.periodStart.getTime() &&
    existing.periodEnd.getTime() === delta.periodEnd.getTime();

  const base: CapUsageSnapshot = isSameWindow
    ? existing
    : {
        periodStart: delta.periodStart,
        periodEnd: delta.periodEnd,
        qualifyingSpendUsd: 0,
        accruedRewardUsd: 0,
      };

  return {
    periodStart: delta.periodStart,
    periodEnd: delta.periodEnd,
    qualifyingSpendUsd: roundUsd(base.qualifyingSpendUsd + delta.qualifyingSpendUsd),
    accruedRewardUsd: roundUsd(base.accruedRewardUsd + delta.accruedRewardUsd),
  };
}

/**
 * A user-typed correction: "I have already spent $2,000 of this bonus."
 *
 * Replaces rather than adds, because the user is stating a total. Clamped at the
 * cap: a figure above it would make `capRemainingUsd` negative, and the engine
 * treats a cap as exhausted at zero regardless.
 */
export function adjustedUsage(options: {
  readonly delta: Pick<UsageDelta, 'periodStart' | 'periodEnd'>;
  readonly qualifyingSpendUsd: number;
  readonly accruedRewardUsd: number;
  readonly capAmountUsd: number | null;
  readonly appliesTo: 'spend' | 'reward';
}): CapUsageSnapshot {
  const cap = options.capAmountUsd;

  const clamp = (value: number, isTheCappedFigure: boolean): number => {
    const positive = atLeastZero(value);
    return cap === null || !isTheCappedFigure
      ? roundUsd(positive)
      : roundUsd(Math.min(positive, cap));
  };

  return {
    periodStart: options.delta.periodStart,
    periodEnd: options.delta.periodEnd,
    qualifyingSpendUsd: clamp(options.qualifyingSpendUsd, options.appliesTo === 'spend'),
    accruedRewardUsd: clamp(options.accruedRewardUsd, options.appliesTo === 'reward'),
  };
}
