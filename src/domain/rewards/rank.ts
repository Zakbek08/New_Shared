/**
 * Step 11 of the engine: order the candidates.
 *
 * The comparator is TOTAL. Every path ends in a comparison on `displayName`, so
 * two genuinely identical cards still get a stable, reproducible order rather
 * than whatever order the wallet query happened to return. A recommendation that
 * changes on refresh is a recommendation nobody trusts.
 */
import type { ConfidenceLevel } from '@/types/database';

import { rankOf } from './confidence';
import { roundUsd } from './money';
import type { RecommendationCandidate } from './types';

/**
 * Compares two eligible candidates, best first.
 *
 * Order, and why each step is where it is:
 *   1. **Net value** — the whole point.
 *   2. **The user's preferred card** — when the money is identical, respect the
 *      card they said they like.
 *   3. **Confidence** — an equal figure we are surer of is worth more.
 *   4. **Cash back over points** — cash needs no redemption effort, so at equal
 *      estimated value it is genuinely better.
 *   5. **Fewer warnings** — fewer caveats to act on.
 *   6. **Name** — arbitrary, but *stable*.
 */
export function compareCandidates(
  a: RecommendationCandidate,
  b: RecommendationCandidate,
): number {
  if (a.breakdown.netValueUsd !== b.breakdown.netValueUsd) {
    return b.breakdown.netValueUsd - a.breakdown.netValueUsd;
  }

  if (a.card.isPreferred !== b.card.isPreferred) {
    return a.card.isPreferred ? -1 : 1;
  }

  const confidenceGap = rankOf(b.confidence) - rankOf(a.confidence);
  if (confidenceGap !== 0) return confidenceGap;

  const aIsCash = a.breakdown.rewardUnit === 'usd';
  const bIsCash = b.breakdown.rewardUnit === 'usd';
  if (aIsCash !== bIsCash) return aIsCash ? -1 : 1;

  if (a.warnings.length !== b.warnings.length) {
    return a.warnings.length - b.warnings.length;
  }

  return a.card.displayName.localeCompare(b.card.displayName, 'en');
}

/** Ineligible cards are ordered by name only; there is no value to rank them by. */
export function compareIneligible(
  a: RecommendationCandidate,
  b: RecommendationCandidate,
): number {
  return a.card.displayName.localeCompare(b.card.displayName, 'en');
}

export interface RankedCandidates {
  readonly eligible: readonly RecommendationCandidate[];
  readonly ineligible: readonly RecommendationCandidate[];
  readonly recommended: RecommendationCandidate | null;
  readonly runnerUp: RecommendationCandidate | null;
  readonly advantageOverRunnerUpUsd: number | null;
  /** True when the winner was chosen over an equal-value rival by preference. */
  readonly tieBrokenByPreference: boolean;
  /** True when the preferred card was kept despite a higher-value rival. */
  readonly heldForMinimumBenefit: boolean;
}

/**
 * Ranks candidates and applies the minimum-switch-benefit rule.
 *
 * `minimumSwitchBenefitUsd` exists so WalletWise does not tell someone to dig out
 * a different card for three cents. It applies *last*, after ranking, and only
 * when the user has a preferred card that qualified.
 */
export function rankCandidates(
  candidates: readonly RecommendationCandidate[],
  minimumSwitchBenefitUsd: number,
): RankedCandidates {
  const eligible = [...candidates.filter((entry) => entry.isEligible)].sort(compareCandidates);
  const ineligible = [...candidates.filter((entry) => !entry.isEligible)].sort(
    compareIneligible,
  );

  if (eligible.length === 0) {
    return {
      eligible: withRanks(eligible),
      ineligible: withRanks(ineligible),
      recommended: null,
      runnerUp: null,
      advantageOverRunnerUpUsd: null,
      tieBrokenByPreference: false,
      heldForMinimumBenefit: false,
    };
  }

  let ordered = eligible;
  let heldForMinimumBenefit = false;

  const winner = ordered[0]!;
  const preferred = ordered.find((entry) => entry.card.isPreferred);

  // Rounded before comparing: `7.2 - 6` is `1.2000000000000002` in IEEE-754, and
  // an unrounded difference would make a threshold comparison arbitrary at the
  // boundary. All money arithmetic goes through `money.ts` — see CLAUDE.md.
  const gainOverPreferred =
    preferred === undefined
      ? 0
      : roundUsd(winner.breakdown.netValueUsd - preferred.breakdown.netValueUsd);

  if (
    preferred !== undefined &&
    preferred !== winner &&
    minimumSwitchBenefitUsd > 0 &&
    gainOverPreferred < minimumSwitchBenefitUsd
  ) {
    // Promote the preferred card, keeping everything else in order behind it.
    ordered = [preferred, ...ordered.filter((entry) => entry !== preferred)];
    heldForMinimumBenefit = true;
  }

  const recommended = ordered[0]!;
  const runnerUp = ordered[1] ?? null;

  // Never negative: the winner is by construction at least as valuable, and after
  // a minimum-benefit hold the difference is reported as zero rather than as a
  // negative advantage, which would be nonsense.
  // Rounded to cents: this figure is persisted and compared, so a trailing
  // 0.0000000000000002 would be a real defect rather than a display quirk.
  const advantageOverRunnerUpUsd =
    runnerUp === null
      ? null
      : Math.max(
          0,
          roundUsd(recommended.breakdown.netValueUsd - runnerUp.breakdown.netValueUsd),
        );

  const tieBrokenByPreference =
    runnerUp !== null &&
    recommended.card.isPreferred &&
    !runnerUp.card.isPreferred &&
    recommended.breakdown.netValueUsd === runnerUp.breakdown.netValueUsd;

  return {
    eligible: withRanks(ordered),
    ineligible: withRanks(ineligible),
    recommended,
    runnerUp,
    advantageOverRunnerUpUsd,
    tieBrokenByPreference,
    heldForMinimumBenefit,
  };
}

/** Stamps 1-based ranks after sorting. */
function withRanks(
  candidates: readonly RecommendationCandidate[],
): readonly RecommendationCandidate[] {
  return candidates.map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

/** The overall confidence of a result: the recommended card's, or `low`. */
export function overallConfidence(
  recommended: RecommendationCandidate | null,
): ConfidenceLevel {
  return recommended?.confidence ?? 'low';
}
