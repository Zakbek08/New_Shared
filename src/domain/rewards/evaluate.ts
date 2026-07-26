/**
 * The deterministic rewards engine.
 *
 * PURE. No clock, no network, no randomness, no language model. Time enters
 * through `context.asOf`, which is what makes every figure reproducible and every
 * test meaningful. See CLAUDE.md — this is the rule the whole product rests on.
 *
 * The twelve steps are documented in REWARDS_ENGINE.md and each is delegated to
 * its own module. This file is the orchestration and the eligibility decision.
 */
import { atLeastZero, foreignTransactionFee, roundUsd } from './money';
import { assessConfidence } from './confidence';
import { matchesRule, mostInformativeCode, windowContains } from './conditions';
import { isCapExhausted, resolveRuleCap } from './caps';
import { bestOffer } from './offers';
import { overallConfidence, rankCandidates } from './rank';
import { contributionFor, stackContributions, type RuleContribution } from './stacking';
import { isDeclinedUnit, isExplicitValuation } from './valuation';
import { describeCandidate, explainRecommendation } from './explain';
import {
  ENGINE_VERSION,
  type EvaluableCard,
  type EvaluableRule,
  type EvaluationContext,
  type IneligibilityCode,
  type PurchaseIntent,
  type RecommendationCandidate,
  type RecommendationResult,
  type RecommendationWarning,
  type RewardBreakdown,
} from './types';

const EMPTY_BREAKDOWN: RewardBreakdown = {
  appliedRuleId: null,
  appliedRuleLabel: null,
  appliedOfferId: null,
  rewardType: null,
  rewardUnit: null,
  effectiveRate: null,
  withinCapSpendUsd: 0,
  overCapSpendUsd: 0,
  postCapRate: null,
  grossRewardUnits: 0,
  appliedCentsPerUnit: null,
  rewardValueUsd: 0,
  offerValueUsd: 0,
  statementCreditUsd: 0,
  foreignTransactionFeeUsd: 0,
  netValueUsd: 0,
};

/**
 * Whether the card can be used in the purchase country at all.
 *
 * An empty `supportedCountryCodes` is treated as no restriction rather than as
 * "nowhere" — the same empty-array-means-unconstrained rule the conditions use.
 */
function supportsCountry(card: EvaluableCard, countryCode: string): boolean {
  if (card.supportedCountryCodes.length === 0) return true;
  return card.supportedCountryCodes.some(
    (code) => code.toUpperCase() === countryCode.toUpperCase(),
  );
}

interface RuleScreening {
  readonly qualifying: readonly EvaluableRule[];
  readonly failures: readonly IneligibilityCode[];
  /** A rule that would have qualified but needs activating. */
  readonly blockedByEnrollment: boolean;
}

/**
 * Steps 1-5: which of a card's rules actually apply?
 *
 * Enrollment, spend thresholds and caps live here rather than in `conditions.ts`
 * because they depend on per-user state, and keeping the condition matcher a pure
 * predicate over (rule, purchase) makes it far easier to reason about.
 */
function screenRules(card: EvaluableCard, intent: PurchaseIntent, asOf: Date): RuleScreening {
  const qualifying: EvaluableRule[] = [];
  const failures: IneligibilityCode[] = [];
  let blockedByEnrollment = false;

  for (const rule of card.rules) {
    if (!rule.isActive) continue;

    const outcome = matchesRule(rule, intent, asOf);
    if (!outcome.matched) {
      failures.push(outcome.code);
      continue;
    }

    // Step 4 — activation. Self-reported: WalletWise never logs in to an issuer.
    if (rule.requiresEnrollment && card.enrollments[rule.id] !== true) {
      failures.push('not_enrolled');
      blockedByEnrollment = true;
      continue;
    }

    // A threshold rule unlocks only after enough cumulative spend, which we know
    // only from what the user has confirmed.
    if (rule.spendThresholdUsd !== null) {
      const spentSoFar = card.capUsage[rule.id]?.qualifyingSpendUsd ?? 0;
      if (spentSoFar < rule.spendThresholdUsd) {
        failures.push('spend_threshold_not_met');
        continue;
      }
    }

    // A cap-exhausted rule still *qualifies* — it simply earns its post-cap rate,
    // or nothing. Dropping it here would break cap fall-through, because the
    // group winner is chosen by value.
    const cap = resolveRuleCap(rule, card, asOf);
    if (isCapExhausted(cap) && rule.postCapRate === null) {
      failures.push('cap_exhausted');
    }

    qualifying.push(rule);
  }

  return { qualifying, failures, blockedByEnrollment };
}

/** Evaluates one card into a candidate. */
function evaluateCard(
  card: EvaluableCard,
  intent: PurchaseIntent,
  context: EvaluationContext,
): RecommendationCandidate {
  const ineligible = (
    code: IneligibilityCode,
    warnings: readonly RecommendationWarning[] = [],
  ): RecommendationCandidate => {
    const candidate: RecommendationCandidate = {
      card,
      rank: 0,
      isEligible: false,
      breakdown: EMPTY_BREAKDOWN,
      confidence: 'low',
      reason: '',
      ineligibilityCode: code,
      capAmountUsd: null,
      capRemainingUsd: null,
      capPeriod: null,
      sourceVerifiedAt: null,
      verificationStatus: null,
      warnings,
    };
    return { ...candidate, reason: describeCandidate(candidate) };
  };

  // --- Step 1: is this card even in play? ----------------------------------
  if (card.isExcludedFromRecommendations) return ineligible('card_excluded_by_user');

  const activeRules = card.rules.filter((rule) => rule.isActive);
  if (activeRules.length === 0) return ineligible('no_active_rules');

  if (!supportsCountry(card, intent.countryCode)) {
    return ineligible('country_not_supported');
  }

  // --- Steps 2-5: screen the rules -----------------------------------------
  const screening = screenRules(card, intent, context.asOf);

  if (screening.qualifying.length === 0) {
    return ineligible(mostInformativeCode(screening.failures) ?? 'category_mismatch');
  }

  // A cash-back-only user has declared points and miles worthless. If that leaves
  // nothing, say so specifically rather than reporting a zero reward.
  const valuedRules = screening.qualifying.filter(
    (rule) => !isDeclinedUnit(rule.rewardUnit, context.valuation),
  );
  if (valuedRules.length === 0) return ineligible('non_cash_reward_declined');

  // --- Step 6: rates, with the cap split folded in -------------------------
  const contributions: RuleContribution[] = valuedRules.map((rule) =>
    contributionFor(rule, card, intent, context.valuation, context.asOf),
  );

  const stacked = stackContributions(contributions);

  // --- Step 7: offers ------------------------------------------------------
  const offer = bestOffer(card.offers, intent, context.valuation, context.asOf);

  // --- Step 8: foreign transaction fee -------------------------------------
  const feeUsd = foreignTransactionFee(intent.amountUsd, card.foreignTransactionFeePercent, {
    purchaseCurrency: intent.currencyCode,
    homeCurrency: context.homeCurrencyCode,
  });

  const grossValueUsd =
    stacked.rewardValueUsd + stacked.statementCreditUsd + (offer?.valueUsd ?? 0);

  // A card that earns nothing at all is not a usable answer. Note this tests the
  // *gross* figure: a card whose reward is wiped out by a fee is still eligible,
  // it just ranks badly — which is exactly how a no-fee card wins abroad.
  const earnsNothing =
    stacked.grossRewardUnits === 0 &&
    stacked.statementCreditUsd === 0 &&
    (offer?.valueUsd ?? 0) === 0;

  if (earnsNothing) {
    return ineligible(
      stacked.isCapExhausted ? 'cap_exhausted' : 'zero_value_reward',
      screening.blockedByEnrollment ? ['enrollment_required'] : [],
    );
  }

  const netValueUsd = roundUsd(atLeastZero(grossValueUsd - feeUsd));

  const primaryRule = stacked.primary?.rule ?? null;
  const primaryCap = stacked.primary?.cap ?? null;

  // --- Step 10: confidence -------------------------------------------------
  const assessment = assessConfidence({
    intent,
    verificationStatus: primaryRule?.verificationStatus ?? null,
    isCapPartiallyAvailable: stacked.overCapSpendUsd > 0,
    isCapNearlyReached: stacked.isCapNearlyReached,
    // Only warn about activation when it actually blocked a rule on this card.
    requiresEnrollmentNotConfirmed: screening.blockedByEnrollment,
    hasForeignTransactionFee: feeUsd > 0,
    usesEstimatedValuation:
      stacked.unit !== null &&
      stacked.unit !== 'usd' &&
      !isExplicitValuation(
        stacked.unit,
        primaryRule?.rewardProgramId ?? null,
        context.valuation,
      ),
    offerRequiresActivation: offer?.requiresActivation ?? false,
  });

  const breakdown: RewardBreakdown = {
    appliedRuleId: primaryRule?.id ?? null,
    appliedRuleLabel: primaryRule?.label ?? null,
    appliedOfferId: offer?.offer.id ?? null,
    rewardType: primaryRule?.rewardType ?? null,
    rewardUnit: stacked.unit,
    effectiveRate: stacked.effectiveRate,
    withinCapSpendUsd: stacked.withinCapSpendUsd,
    overCapSpendUsd: stacked.overCapSpendUsd,
    postCapRate: primaryRule?.postCapRate ?? null,
    grossRewardUnits: stacked.grossRewardUnits,
    appliedCentsPerUnit: stacked.centsPerUnit,
    rewardValueUsd: stacked.rewardValueUsd,
    offerValueUsd: offer?.valueUsd ?? 0,
    statementCreditUsd: stacked.statementCreditUsd,
    foreignTransactionFeeUsd: feeUsd,
    netValueUsd,
  };

  const candidate: RecommendationCandidate = {
    card,
    rank: 0,
    isEligible: true,
    breakdown,
    confidence: assessment.confidence,
    reason: '',
    ineligibilityCode: null,
    capAmountUsd: primaryCap?.capAmountUsd ?? null,
    capRemainingUsd: primaryCap?.capRemainingUsd ?? null,
    capPeriod: primaryCap?.capPeriod ?? null,
    sourceVerifiedAt: primaryRule?.lastVerifiedAt ?? null,
    verificationStatus: primaryRule?.verificationStatus ?? null,
    warnings: assessment.warnings,
  };

  return { ...candidate, reason: describeCandidate(candidate) };
}

/**
 * Evaluates a whole wallet against one purchase.
 *
 * Returns the winner, the runner-up, every eligible card in order, and every
 * card that could not be used *with the reason why* — because "why not my other
 * card?" is the question that earns trust.
 */
export function evaluateWallet(
  intent: PurchaseIntent,
  cards: readonly EvaluableCard[],
  context: EvaluationContext,
): RecommendationResult {
  const candidates = cards.map((card) => evaluateCard(card, intent, context));

  const ranked = rankCandidates(candidates, context.valuation.minimumSwitchBenefitUsd);

  // Result-level warnings are the recommended card's, plus the tie-break note.
  const warnings = new Set<RecommendationWarning>(ranked.recommended?.warnings ?? []);
  if (ranked.tieBrokenByPreference || ranked.heldForMinimumBenefit) {
    warnings.add('tie_broken_by_preference');
  }

  return {
    engineVersion: ENGINE_VERSION,
    computedAt: context.asOf,
    intent,
    recommended: ranked.recommended,
    runnerUp: ranked.runnerUp,
    eligible: ranked.eligible,
    ineligible: ranked.ineligible,
    advantageOverRunnerUpUsd: ranked.advantageOverRunnerUpUsd,
    confidence: overallConfidence(ranked.recommended),
    warnings: [...warnings],
    explanation: explainRecommendation({
      recommended: ranked.recommended,
      runnerUp: ranked.runnerUp,
      advantageOverRunnerUpUsd: ranked.advantageOverRunnerUpUsd,
      heldForMinimumBenefit: ranked.heldForMinimumBenefit,
      tieBrokenByPreference: ranked.tieBrokenByPreference,
    }),
  };
}

/** Re-exported so callers can check a window without importing the matcher. */
export { windowContains };
