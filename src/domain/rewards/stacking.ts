/**
 * Steps 5-6 of the engine: turn qualifying rules into a reward figure.
 *
 * STACKING MODEL
 *   Rules are partitioned by `stackGroup`. Within a group the single
 *   best-*earning* rule wins. Rules marked `isStackable` are then added on top,
 *   and different groups compose. The card's total is the sum.
 *
 *   Note "best-earning", not "highest priority". This is what makes cap
 *   fall-through work without any special case: when a 6% grocery rule's cap is
 *   exhausted and it has no `postCapRate`, its own value drops to zero, so the
 *   card's plain 1% base rule wins the group on merit. `priority` only breaks
 *   ties.
 */
import type { RewardType, RewardUnit } from '@/types/database';

import { percentOf, roundUnits, roundUsd, splitAtCap, unitsFor } from './money';
import { isCapExhausted, isCapNearlyReached, resolveRuleCap, type RuleCap } from './caps';
import { valueRewardUsd } from './valuation';
import type { EvaluableCard, EvaluableRule, PurchaseIntent, RewardValuation } from './types';

/** One rule's contribution to a card's total. */
export interface RuleContribution {
  readonly rule: EvaluableRule;
  readonly cap: RuleCap;
  /** Percent for cash back, multiplier for points/miles. `null` for a credit. */
  readonly effectiveRate: number | null;
  readonly withinCapSpendUsd: number;
  readonly overCapSpendUsd: number;
  readonly grossRewardUnits: number;
  readonly unit: RewardUnit;
  readonly centsPerUnit: number | null;
  readonly valueUsd: number;
  /** Statement credits and fixed amounts, which are not rate-based. */
  readonly isCredit: boolean;
  /** True when the cap limited what this rule earned. */
  readonly wasCapLimited: boolean;
}

const isCreditType = (rewardType: RewardType): boolean =>
  rewardType === 'statement_credit' || rewardType === 'fixed_amount';

/**
 * Reward units earned on a portion of spend at a given rate.
 *
 * Cash back is a percentage of the amount; points and miles are a multiplier.
 */
function unitsEarned(spendUsd: number, rate: number, rewardType: RewardType): number {
  switch (rewardType) {
    case 'cash_back_percent':
      return percentOf(spendUsd, rate);
    case 'points_per_dollar':
    case 'miles_per_dollar':
      return unitsFor(spendUsd, rate);
    case 'statement_credit':
    case 'fixed_amount':
      // Not rate-based; handled by the credit branch in `contributionFor`.
      return 0;
  }
}

/**
 * Computes what one qualifying rule earns on this purchase.
 *
 * The cap split is applied here, so the returned `valueUsd` already accounts for
 * a partially-remaining cap — which is precisely what lets the caller pick a
 * group winner by value and get cap fall-through for free.
 */
export function contributionFor(
  rule: EvaluableRule,
  card: EvaluableCard,
  intent: PurchaseIntent,
  valuation: RewardValuation,
  asOf: Date,
): RuleContribution {
  const cap = resolveRuleCap(rule, card, asOf);

  // --- Statement credits and fixed amounts ---------------------------------
  if (isCreditType(rule.rewardType)) {
    const nominal = rule.fixedAmountUsd ?? 0;
    // A reward-denominated cap limits the credit itself.
    const allowed =
      cap.capRemainingUsd === null ? nominal : Math.min(nominal, cap.capRemainingUsd);

    return {
      rule,
      cap,
      effectiveRate: null,
      withinCapSpendUsd: 0,
      overCapSpendUsd: 0,
      grossRewardUnits: roundUsd(allowed),
      unit: 'usd',
      centsPerUnit: null,
      valueUsd: roundUsd(allowed),
      isCredit: true,
      wasCapLimited: allowed < nominal,
    };
  }

  const fullRate = rule.baseRate + rule.bonusRate;

  // --- Cap split -----------------------------------------------------------
  // A spend cap limits how much of the purchase earns the bonus rate. A reward
  // cap limits the accrued reward instead, so all the spend earns the full rate
  // and the *reward* is trimmed afterwards.
  const spendCapRemaining =
    cap.capRemainingUsd !== null && cap.appliesTo === 'spend' ? cap.capRemainingUsd : null;

  const split = splitAtCap(intent.amountUsd, spendCapRemaining);

  const withinUnits = unitsEarned(split.withinCapUsd, fullRate, rule.rewardType);
  const overUnits =
    rule.postCapRate === null
      ? 0
      : unitsEarned(split.overCapUsd, rule.postCapRate, rule.rewardType);

  let grossRewardUnits = roundUnits(withinUnits + overUnits);

  // A reward-denominated cap trims the accrued reward.
  let rewardCapLimited = false;
  if (cap.capRemainingUsd !== null && cap.appliesTo === 'reward') {
    if (grossRewardUnits > cap.capRemainingUsd) {
      grossRewardUnits = roundUnits(cap.capRemainingUsd);
      rewardCapLimited = true;
    }
  }

  const valued = valueRewardUsd(
    grossRewardUnits,
    rule.rewardUnit,
    rule.rewardProgramId,
    valuation,
  );

  return {
    rule,
    cap,
    effectiveRate: fullRate,
    withinCapSpendUsd: split.withinCapUsd,
    overCapSpendUsd: split.overCapUsd,
    grossRewardUnits,
    unit: rule.rewardUnit,
    centsPerUnit: valued.centsPerUnit,
    valueUsd: valued.valueUsd,
    isCredit: false,
    wasCapLimited: rewardCapLimited || split.overCapUsd > 0,
  };
}

/**
 * Deterministic ordering for two contributions competing in the same group.
 *
 * Value first, then priority, then rule id — so the outcome never depends on the
 * order the rules arrived in.
 */
function betterContribution(a: RuleContribution, b: RuleContribution): RuleContribution {
  if (a.valueUsd !== b.valueUsd) return a.valueUsd > b.valueUsd ? a : b;
  if (a.rule.priority !== b.rule.priority) {
    return a.rule.priority > b.rule.priority ? a : b;
  }
  return a.rule.id <= b.rule.id ? a : b;
}

export interface StackedReward {
  /** Every contribution that ends up applying. */
  readonly applied: readonly RuleContribution[];
  /** The contribution the UI names, the highest-value rate-based one. */
  readonly primary: RuleContribution | null;
  readonly rewardValueUsd: number;
  readonly statementCreditUsd: number;
  readonly grossRewardUnits: number;
  readonly unit: RewardUnit | null;
  readonly effectiveRate: number | null;
  readonly centsPerUnit: number | null;
  readonly withinCapSpendUsd: number;
  readonly overCapSpendUsd: number;
  readonly wasCapLimited: boolean;
  readonly isCapExhausted: boolean;
  readonly isCapNearlyReached: boolean;
}

const EMPTY_STACK: StackedReward = {
  applied: [],
  primary: null,
  rewardValueUsd: 0,
  statementCreditUsd: 0,
  grossRewardUnits: 0,
  unit: null,
  effectiveRate: null,
  centsPerUnit: null,
  withinCapSpendUsd: 0,
  overCapSpendUsd: 0,
  wasCapLimited: false,
  isCapExhausted: false,
  isCapNearlyReached: false,
};

/**
 * Combines contributions into the card's reward.
 *
 * MIXED UNITS: a card could in principle stack a cash-back rule with a points
 * rule. `rewardValueUsd` sums every contribution correctly in dollars, but
 * `grossRewardUnits` and `effectiveRate` can only describe one unit — they report
 * the primary's, so the headline stays truthful and the dollar figure stays
 * complete. No card in the catalog does this today.
 */
export function stackContributions(contributions: readonly RuleContribution[]): StackedReward {
  if (contributions.length === 0) return EMPTY_STACK;

  // Group winners for the non-stackable rules, plus every stackable rule.
  const winners = new Map<string, RuleContribution>();
  const stackable: RuleContribution[] = [];

  for (const contribution of contributions) {
    if (contribution.rule.isStackable) {
      stackable.push(contribution);
      continue;
    }
    const current = winners.get(contribution.rule.stackGroup);
    winners.set(
      contribution.rule.stackGroup,
      current === undefined ? contribution : betterContribution(current, contribution),
    );
  }

  const applied = [...winners.values(), ...stackable];

  const rateContributions = applied.filter((entry) => !entry.isCredit);
  const creditContributions = applied.filter((entry) => entry.isCredit);

  const primary =
    rateContributions.length === 0
      ? null
      : rateContributions.reduce((best, entry) => betterContribution(best, entry));

  // Only contributions sharing the primary's unit can be summed into a single
  // unit figure; the rest still count toward the dollar total.
  const sameUnit = rateContributions.filter((entry) => entry.unit === primary?.unit);

  const effectiveRate =
    primary === null
      ? null
      : sameUnit
          .filter((entry) => entry.rule.rewardType === primary.rule.rewardType)
          .reduce((sum, entry) => sum + (entry.effectiveRate ?? 0), 0);

  return {
    applied,
    primary,
    rewardValueUsd: roundUsd(rateContributions.reduce((sum, entry) => sum + entry.valueUsd, 0)),
    statementCreditUsd: roundUsd(
      creditContributions.reduce((sum, entry) => sum + entry.valueUsd, 0),
    ),
    grossRewardUnits: roundUnits(
      sameUnit.reduce((sum, entry) => sum + entry.grossRewardUnits, 0),
    ),
    unit: primary?.unit ?? (creditContributions.length > 0 ? 'usd' : null),
    effectiveRate,
    centsPerUnit: primary?.centsPerUnit ?? null,
    withinCapSpendUsd: primary?.withinCapSpendUsd ?? 0,
    overCapSpendUsd: primary?.overCapSpendUsd ?? 0,
    wasCapLimited: applied.some((entry) => entry.wasCapLimited),
    isCapExhausted: applied.some((entry) => isCapExhausted(entry.cap)),
    isCapNearlyReached: applied.some((entry) => isCapNearlyReached(entry.cap)),
  };
}
