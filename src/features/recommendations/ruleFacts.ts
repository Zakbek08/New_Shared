/**
 * Turns the rule that won into a list of plain statements about *why*.
 *
 * This is presentation, not calculation: it reads the same `EvaluableRule` the
 * engine read and describes its conditions in words. It never derives a rate, a
 * cap or a value — those come from `RewardBreakdown` only.
 *
 * Pure and exported separately from the screen so the wording can be asserted in
 * a test without rendering React.
 */
import { getCategoryById } from '@/domain/categories';
import type { Classification } from '@/domain/classifier/types';
import {
  CAP_PERIOD_LABELS,
  PAYMENT_METHOD_LABELS,
  VERIFICATION_STATUS_LABELS,
} from '@/domain/enums';
import type {
  EvaluableCard,
  EvaluableCondition,
  EvaluableRule,
  RecommendationCandidate,
} from '@/domain/rewards';
import { formatUsd, formatUsdCompact } from '@/lib/format';

/** Joins a list the way a person would: "a, b and c". */
function joinWithAnd(parts: readonly string[]): string {
  if (parts.length <= 1) {
    return parts[0] ?? '';
  }
  const head = parts.slice(0, -1).join(', ');
  // `parts.length >= 2` here, so the last element exists; the fallback keeps
  // `noUncheckedIndexedAccess` satisfied without a non-null assertion.
  return `${head} and ${parts[parts.length - 1] ?? ''}`;
}

function categoryNames(ids: readonly string[]): string {
  return joinWithAnd(
    ids.map((id) => getCategoryById(id)?.displayName ?? 'an unlisted category'),
  );
}

function formatMccRange(range: readonly [number, number]): string {
  return range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`;
}

/**
 * The requirements one condition row places on a purchase.
 *
 * Returns one sentence per populated field, in a fixed order, so two runs over
 * the same rule always read identically.
 */
export function describeCondition(condition: EvaluableCondition): readonly string[] {
  const facts: string[] = [];

  if (condition.categoryIds.length > 0) {
    facts.push(`Category is ${categoryNames(condition.categoryIds)}`);
  }
  if (condition.excludedCategoryIds.length > 0) {
    facts.push(`Category is not ${categoryNames(condition.excludedCategoryIds)}`);
  }

  const mccParts = [
    ...condition.includedMccs.map((mcc) => `${mcc}`),
    ...condition.includedMccRanges.map(formatMccRange),
  ];
  if (mccParts.length > 0) {
    facts.push(`Merchant category code is ${joinWithAnd(mccParts)}`);
  }
  if (condition.excludedMccs.length > 0) {
    facts.push(
      `Merchant category code is not ${joinWithAnd(condition.excludedMccs.map((mcc) => `${mcc}`))}`,
    );
  }

  if (condition.includedMerchantIds.length > 0) {
    facts.push(
      condition.includedMerchantIds.length === 1
        ? 'Purchase is at one specific merchant'
        : `Purchase is at one of ${condition.includedMerchantIds.length} specific merchants`,
    );
  }
  if (condition.excludedMerchantIds.length > 0) {
    facts.push(
      `Purchase is not at ${condition.excludedMerchantIds.length} excluded merchant${
        condition.excludedMerchantIds.length === 1 ? '' : 's'
      }`,
    );
  }

  if (condition.includedCountryCodes.length > 0) {
    facts.push(`Country is ${joinWithAnd(condition.includedCountryCodes)}`);
  }
  if (condition.excludedCountryCodes.length > 0) {
    facts.push(`Country is not ${joinWithAnd(condition.excludedCountryCodes)}`);
  }
  if (condition.includedCurrencyCodes.length > 0) {
    facts.push(`Currency is ${joinWithAnd(condition.includedCurrencyCodes)}`);
  }

  if (condition.channel !== 'either') {
    facts.push(condition.channel === 'online' ? 'Purchase is online' : 'Purchase is in store');
  }
  if (condition.includedPaymentMethods.length > 0) {
    facts.push(
      `Paid by ${joinWithAnd(
        condition.includedPaymentMethods.map((method) => PAYMENT_METHOD_LABELS[method]),
      )}`,
    );
  }

  if (condition.minAmountUsd !== null) {
    facts.push(`Amount is at least ${formatUsd(condition.minAmountUsd)}`);
  }
  if (condition.maxAmountUsd !== null) {
    facts.push(`Amount is at most ${formatUsd(condition.maxAmountUsd)}`);
  }

  // Dates are described relatively — "this rule runs between…" — rather than
  // formatted here, because the screen already states the instant evaluated.
  if (condition.startsAt !== null || condition.endsAt !== null) {
    facts.push('Purchase falls inside the rule’s date window');
  }

  return facts;
}

/** Every requirement the winning rule placed on the purchase, deduplicated. */
export function describeRuleRequirements(rule: EvaluableRule): readonly string[] {
  const facts = rule.conditions.flatMap((condition) => describeCondition(condition));

  if (rule.requiresEnrollment) {
    facts.push('The bonus is activated on this card');
  }
  if (rule.spendThresholdUsd !== null) {
    facts.push(`Total spend has passed ${formatUsd(rule.spendThresholdUsd)}`);
  }
  if (rule.capAmount !== null) {
    facts.push(
      `${formatUsdCompact(rule.capAmount)} ${
        rule.capAppliesTo === 'spend' ? 'of spend' : 'of reward'
      } ${CAP_PERIOD_LABELS[rule.capPeriod]} is the cap`,
    );
  }

  // Two condition rows can legitimately repeat a requirement (a bonus row and an
  // exclusion row both naming the country). Saying it twice looks like a bug.
  return [...new Set(facts)];
}

export interface RuleComparison {
  readonly rule: EvaluableRule;
  readonly isApplied: boolean;
}

/**
 * The applied rule first, then the card's other active rules.
 *
 * Shows what else was considered on the winning card, which is the question a
 * sceptical user asks next: "why not the other bonus on the same card?"
 */
export function otherRulesOnCard(
  card: EvaluableCard,
  appliedRuleId: string | null,
): readonly RuleComparison[] {
  return card.rules
    .filter((rule) => rule.isActive)
    .map((rule) => ({ rule, isApplied: rule.id === appliedRuleId }))
    .sort((left, right) => {
      if (left.isApplied !== right.isApplied) {
        return left.isApplied ? -1 : 1;
      }
      if (left.rule.priority !== right.rule.priority) {
        return right.rule.priority - left.rule.priority;
      }
      // Final tiebreak on id keeps the order stable across renders.
      return left.rule.id.localeCompare(right.rule.id);
    });
}

/**
 * How the purchase came to sit in the category it did.
 *
 * Assembled from the classifier's own output — match kind, resolved merchant,
 * MCC, disagreement flag — so the sentence cannot drift from the decision it
 * describes. Exhaustive over `CategoryMatchKind` with no `default`, so adding a
 * match kind is a typecheck failure rather than a silently generic sentence.
 */
export function describeCategoryDecision(classification: Classification): string {
  const categoryName =
    classification.categoryId === null
      ? null
      : (getCategoryById(classification.categoryId)?.displayName ?? null);
  const merchant = classification.resolvedMerchantName;

  const base = ((): string => {
    switch (classification.matchKind) {
      case 'exact_merchant':
        return `${merchant ?? 'This merchant'} is in our catalog${
          categoryName === null ? '' : `, coded as ${categoryName}`
        }.`;
      case 'known_mcc':
        return `We used merchant category code ${classification.mcc ?? 'on file'}${
          categoryName === null ? '' : `, which maps to ${categoryName}`
        }.`;
      case 'user_selected':
        return categoryName === null
          ? 'We used the category you picked.'
          : `We used the category you picked, ${categoryName}. We have no coding on file for this merchant to check it against.`;
      case 'inferred':
        return categoryName === null
          ? 'We could not place this merchant.'
          : `We guessed ${categoryName} from the merchant name. This is the weakest kind of match.`;
      case 'unknown':
        return 'We could not work out a category, so only rules that apply to every purchase were considered.';
    }
  })();

  const disagreement = classification.disagreesWithUserSelection
    ? ' This differs from the category you picked. Your issuer decides the category, so we followed the coding.'
    : '';

  const alternatives =
    classification.alternativeCategoryIds.length > 0
      ? ` The same evidence would also support ${categoryNames(
          classification.alternativeCategoryIds,
        )}.`
      : '';

  return `${base}${disagreement}${alternatives}`;
}

/** Where the rate came from, and how much that source can be trusted. */
export function describeSource(candidate: RecommendationCandidate): string {
  if (candidate.verificationStatus === null) {
    return 'No source recorded for this figure.';
  }
  return `Source status: ${VERIFICATION_STATUS_LABELS[candidate.verificationStatus]}.`;
}
