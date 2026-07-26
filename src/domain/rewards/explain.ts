/**
 * The explanation layer.
 *
 * Assembles a sentence from numbers the engine already computed. It performs no
 * arithmetic of its own beyond formatting, and it cannot introduce a figure the
 * breakdown does not contain.
 *
 * A language model may later rephrase these strings using only the numbers
 * present in the breakdown. It may not alter them, and the deterministic string
 * is always what gets persisted — so the explanation can never become the weakest
 * link in a financial figure.
 */
import { CAP_PERIOD_LABELS } from '@/domain/enums';
import {
  formatCardName,
  formatRewardRate,
  formatRewardUnits,
  formatUsd,
  formatUsdCompact,
} from '@/lib/format';

import type { IneligibilityCode, RecommendationCandidate } from './types';

/** Plain-language rejection reasons, keyed by the machine-readable code. */
const INELIGIBILITY_REASONS: Record<IneligibilityCode, string> = {
  no_active_rules: 'We have no earn rates recorded for this card yet.',
  card_excluded_by_user: 'You have turned this card off for recommendations.',
  country_not_supported: 'This card does not earn rewards in that country.',
  currency_not_supported: 'This card does not earn rewards in that currency.',
  rule_not_yet_active: 'This card’s bonus has not started yet.',
  rule_expired: 'This card’s bonus for that category has ended.',
  category_mismatch: 'This card has no bonus for that category.',
  mcc_mismatch: 'This card’s bonus does not cover how this merchant is coded.',
  merchant_excluded: 'This card excludes that merchant from its bonus.',
  merchant_not_included: 'This card’s bonus only applies at specific merchants.',
  channel_mismatch: 'This card’s bonus does not apply to that way of buying.',
  payment_method_mismatch: 'This card’s bonus does not apply to that payment method.',
  amount_below_minimum: 'This purchase is below the minimum for this card’s bonus.',
  amount_above_maximum: 'This purchase is above the maximum for this card’s bonus.',
  not_enrolled: 'You need to activate this card’s bonus before it earns.',
  cap_exhausted: 'You have used up this card’s bonus for this period.',
  spend_threshold_not_met: 'This card’s bonus unlocks after more spending.',
  non_cash_reward_declined:
    'This card earns points or miles, which you have asked us to ignore.',
  zero_value_reward: 'This card would earn nothing on this purchase.',
};

export function describeIneligibility(code: IneligibilityCode | null): string {
  if (code === null) return 'This card cannot be used for this purchase.';
  return INELIGIBILITY_REASONS[code];
}

/**
 * The one-line reason shown beside a candidate.
 *
 * For an eligible card this is the applied rule's own label — the wording from the
 * card's terms, not a paraphrase of it.
 */
export function describeCandidate(candidate: RecommendationCandidate): string {
  if (!candidate.isEligible) {
    return describeIneligibility(candidate.ineligibilityCode);
  }

  const { breakdown } = candidate;
  const parts: string[] = [];

  if (breakdown.appliedRuleLabel !== null) {
    parts.push(breakdown.appliedRuleLabel);
  } else if (breakdown.statementCreditUsd > 0) {
    parts.push('Statement credit');
  }

  if (breakdown.statementCreditUsd > 0 && breakdown.appliedRuleLabel !== null) {
    parts.push(`plus a ${formatUsd(breakdown.statementCreditUsd)} statement credit`);
  }

  if (breakdown.offerValueUsd > 0) {
    parts.push(`plus ${formatUsd(breakdown.offerValueUsd)} from an offer`);
  }

  if (breakdown.foreignTransactionFeeUsd > 0) {
    parts.push(
      `less a ${formatUsd(breakdown.foreignTransactionFeeUsd)} foreign transaction fee`,
    );
  }

  return parts.length === 0 ? 'Earns the card’s standard rate.' : `${parts.join(', ')}.`;
}

/**
 * The reward figure, in its own units plus its dollar value.
 *
 * Points are shown *and* valued, because "480 points" alone is not comparable to
 * "$7.20" and the user needs both to check our arithmetic.
 */
export function describeReward(candidate: RecommendationCandidate): string {
  const { breakdown } = candidate;

  if (breakdown.rewardUnit === null || breakdown.rewardUnit === 'usd') {
    return formatUsd(breakdown.netValueUsd);
  }

  const units = formatRewardUnits(breakdown.grossRewardUnits, breakdown.rewardUnit);
  return `${units} (about ${formatUsd(breakdown.netValueUsd)})`;
}

/**
 * The full explanation for a result.
 *
 * Built from the recommended candidate and, when there is one, the runner-up — so
 * the recommendation is checkable rather than something to take on faith.
 */
export function explainRecommendation(options: {
  readonly recommended: RecommendationCandidate | null;
  readonly runnerUp: RecommendationCandidate | null;
  readonly advantageOverRunnerUpUsd: number | null;
  readonly heldForMinimumBenefit: boolean;
  readonly tieBrokenByPreference: boolean;
}): string {
  const { recommended, runnerUp } = options;

  if (recommended === null) {
    return 'None of the cards in your wallet earns a reward on this purchase. The reason for each one is listed below.';
  }

  const name = formatCardName(recommended.card.displayName, recommended.card.nickname);
  const sentences: string[] = [];

  sentences.push(`Use your ${name}.`);
  sentences.push(`You should earn about ${describeReward(recommended)}.`);

  const { breakdown } = recommended;

  if (breakdown.effectiveRate !== null && breakdown.rewardType !== null) {
    const rate = formatRewardRate(breakdown.effectiveRate, breakdown.rewardType);
    sentences.push(
      breakdown.appliedRuleLabel === null
        ? `That is ${rate} on this purchase.`
        : `That is ${rate} — ${lowerFirst(breakdown.appliedRuleLabel)}.`,
    );
  }

  // Cap context, when there is a cap worth mentioning.
  if (recommended.capAmountUsd !== null && recommended.capRemainingUsd !== null) {
    const period =
      recommended.capPeriod === null || recommended.capPeriod === 'none'
        ? ''
        : ` ${CAP_PERIOD_LABELS[recommended.capPeriod]}`;

    if (recommended.capRemainingUsd === 0) {
      sentences.push(
        `You have used the whole ${formatUsdCompact(recommended.capAmountUsd)} bonus cap${period}.`,
      );
    } else if (breakdown.overCapSpendUsd > 0) {
      sentences.push(
        `Only ${formatUsd(breakdown.withinCapSpendUsd)} of this purchase fits under the ` +
          `${formatUsdCompact(recommended.capAmountUsd)} cap${period}; the rest earns the lower rate.`,
      );
    } else {
      sentences.push(
        `${formatUsdCompact(recommended.capRemainingUsd)} of the ` +
          `${formatUsdCompact(recommended.capAmountUsd)} cap${period} is still available.`,
      );
    }
  }

  if (breakdown.appliedCentsPerUnit !== null && breakdown.rewardUnit !== 'usd') {
    sentences.push(
      `Valued at ${trimNumber(breakdown.appliedCentsPerUnit)}¢ per ` +
        `${breakdown.rewardUnit === 'points' ? 'point' : 'mile'}, which is your own figure.`,
    );
  }

  if (breakdown.foreignTransactionFeeUsd > 0) {
    sentences.push(
      `A ${formatUsd(breakdown.foreignTransactionFeeUsd)} foreign transaction fee has already been subtracted.`,
    );
  }

  // The comparison, which is what makes the answer checkable.
  if (runnerUp !== null) {
    const runnerUpName = formatCardName(runnerUp.card.displayName, runnerUp.card.nickname);
    const advantage = options.advantageOverRunnerUpUsd ?? 0;

    if (options.heldForMinimumBenefit) {
      sentences.push(
        `Your ${runnerUpName} would earn slightly more, but not enough to be worth switching by your own threshold.`,
      );
    } else if (options.tieBrokenByPreference) {
      sentences.push(`Your ${runnerUpName} earns the same, so we kept your preferred card.`);
    } else if (advantage === 0) {
      sentences.push(`Your ${runnerUpName} earns the same amount.`);
    } else {
      sentences.push(
        `That is ${formatUsd(advantage)} more than your next best option, the ${runnerUpName}.`,
      );
    }
  }

  return sentences.join(' ');
}

/** Lower-cases the first letter unless it looks like a deliberate capital. */
function lowerFirst(value: string): string {
  if (value.length === 0) return value;
  const [first] = value;
  if (first === undefined) return value;
  // Leave acronyms and things like "US supermarkets" alone.
  if (value.length > 1 && value[1] === value[1]?.toUpperCase() && /[A-Z]/.test(first)) {
    return value;
  }
  return first.toLowerCase() + value.slice(1);
}

function trimNumber(value: number): string {
  return Number.parseFloat(value.toFixed(4)).toString();
}
