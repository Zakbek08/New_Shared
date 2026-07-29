/**
 * The rewards engine's public surface.
 *
 * Callers should import from here rather than reaching into individual modules,
 * so the internal split can change without a wide refactor.
 */
export { ENGINE_VERSION, INELIGIBILITY_CODES, RECOMMENDATION_WARNINGS } from './types';
export type {
  CapUsageSnapshot,
  EvaluableCard,
  EvaluableCondition,
  EvaluableOffer,
  EvaluableRule,
  EvaluateWallet,
  EvaluationContext,
  IneligibilityCode,
  PurchaseIntent,
  RecommendationCandidate,
  RecommendationResult,
  RecommendationWarning,
  RewardBreakdown,
  RewardValuation,
} from './types';

export { evaluateWallet } from './evaluate';

export {
  describeCandidate,
  describeIneligibility,
  describeReward,
  explainRecommendation,
} from './explain';

export { compareCandidates, rankCandidates } from './rank';

export {
  atLeastZero,
  foreignTransactionFee,
  percentOf,
  roundTo,
  roundUnits,
  roundUsd,
  splitAtCap,
  unitsFor,
  unitsToUsd,
} from './money';

export {
  daysRemainingInWindow,
  isWithinCapWindow,
  resolveCapWindow,
  type CapWindow,
} from './capWindow';

export {
  capUtilisation,
  isCapExhausted,
  isCapNearlyReached,
  resolveRuleCap,
  type RuleCap,
} from './caps';

export { resolveCentsPerUnit, valueRewardUsd } from './valuation';

export { assessConfidence, confidenceForVerification, weakest } from './confidence';
