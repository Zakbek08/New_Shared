/**
 * Contracts for the deterministic rewards engine.
 *
 * Phase 1 defines the shapes only. The evaluation, ranking and explanation
 * functions land in Phase 3 (`evaluate.ts`, `rank.ts`, `explain.ts`) and must
 * satisfy exactly these types.
 *
 * THE ENGINE IS PURE.
 * `evaluateWallet` takes a fully-materialised snapshot — cards, rules,
 * conditions, offers, cap usage, preferences — plus an explicit `asOf` instant,
 * and returns a result. It performs no I/O, reads no clock and consults no
 * language model. That is what makes every figure reproducible and every test
 * meaningful. See CLAUDE.md.
 */
import type {
  CapPeriod,
  CategoryMatchKind,
  ConfidenceLevel,
  PaymentMethod,
  PurchaseChannel,
  RewardType,
  RewardUnit,
  RuleKind,
  VerificationStatus,
} from '@/types/database';

/** Semantic version of the engine, persisted with every recommendation. */
export const ENGINE_VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** The purchase being evaluated. Amounts are always in USD. */
export interface PurchaseIntent {
  readonly merchantInput: string;
  readonly amountUsd: number;
  readonly currencyCode: string;
  readonly countryCode: string;
  readonly channel: Exclude<PurchaseChannel, 'either'>;
  readonly paymentMethod: PaymentMethod;
  /** Resolved by the classifier before the engine runs. */
  readonly categoryId: string | null;
  readonly merchantId: string | null;
  readonly mcc: number | null;
  readonly categoryMatchKind: CategoryMatchKind;
  readonly categoryConfidence: ConfidenceLevel;
  readonly hasAmbiguousCoding: boolean;
  readonly notes?: string | null;
}

/** A reward rule with its conditions already attached. */
export interface EvaluableRule {
  readonly id: string;
  readonly cardProductId: string;
  readonly rewardProgramId: string | null;
  readonly label: string;
  readonly kind: RuleKind;
  readonly rewardType: RewardType;
  readonly rewardUnit: RewardUnit;
  readonly baseRate: number;
  readonly bonusRate: number;
  readonly fixedAmountUsd: number | null;
  readonly priority: number;
  readonly stackGroup: string;
  readonly isStackable: boolean;
  readonly capAmount: number | null;
  readonly capAppliesTo: 'spend' | 'reward';
  readonly capPeriod: CapPeriod;
  readonly postCapRate: number | null;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly requiresEnrollment: boolean;
  readonly spendThresholdUsd: number | null;
  readonly lastVerifiedAt: Date | null;
  readonly verificationStatus: VerificationStatus;
  readonly isActive: boolean;
  readonly conditions: readonly EvaluableCondition[];
}

/**
 * One condition row. Every populated field must be satisfied, and all condition
 * rows on a rule are ANDed. Array fields are ORed internally.
 */
export interface EvaluableCondition {
  readonly id: string;
  readonly categoryIds: readonly string[];
  readonly excludedCategoryIds: readonly string[];
  readonly includedMccs: readonly number[];
  readonly includedMccRanges: readonly (readonly [number, number])[];
  readonly excludedMccs: readonly number[];
  readonly includedMerchantIds: readonly string[];
  readonly excludedMerchantIds: readonly string[];
  readonly includedCountryCodes: readonly string[];
  readonly excludedCountryCodes: readonly string[];
  readonly includedCurrencyCodes: readonly string[];
  readonly channel: PurchaseChannel;
  readonly includedPaymentMethods: readonly PaymentMethod[];
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly minAmountUsd: number | null;
  readonly maxAmountUsd: number | null;
}

/** A card in the user's wallet, with everything the engine needs about it. */
export interface EvaluableCard {
  readonly userCardId: string;
  readonly cardProductId: string;
  readonly displayName: string;
  readonly issuerName: string;
  readonly nickname: string | null;
  readonly annualFeeUsd: number;
  readonly foreignTransactionFeePercent: number;
  readonly supportedCountryCodes: readonly string[];
  readonly isPreferred: boolean;
  readonly isExcludedFromRecommendations: boolean;
  readonly accountOpenedOn: Date | null;
  readonly rules: readonly EvaluableRule[];
  /** Keyed by reward rule id. Absent means "not enrolled". */
  readonly enrollments: Readonly<Record<string, boolean>>;
  /** Keyed by reward rule id. Cap consumption inside the current window. */
  readonly capUsage: Readonly<Record<string, CapUsageSnapshot>>;
  readonly offers: readonly EvaluableOffer[];
}

export interface CapUsageSnapshot {
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly qualifyingSpendUsd: number;
  readonly accruedRewardUsd: number;
}

export interface EvaluableOffer {
  readonly id: string;
  readonly title: string;
  readonly merchantId: string | null;
  readonly merchantLabel: string | null;
  readonly rewardType: RewardType;
  readonly rewardUnit: RewardUnit;
  readonly rate: number;
  readonly fixedAmountUsd: number | null;
  readonly minimumSpendUsd: number;
  readonly maxBenefitUsd: number | null;
  readonly channel: PurchaseChannel;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly isEnrolled: boolean;
}

/** How this user values each reward currency. */
export interface RewardValuation {
  /** Keyed by reward program id. */
  readonly byProgramId: Readonly<Record<string, number>>;
  /** Fallback per unit type when the program has no explicit valuation. */
  readonly byUnit: Readonly<Record<RewardUnit, number>>;
  readonly prefersCashBackOnly: boolean;
  /**
   * The engine will not recommend switching away from the user's preferred card
   * for less than this much extra value.
   */
  readonly minimumSwitchBenefitUsd: number;
}

export interface EvaluationContext {
  readonly asOf: Date;
  readonly homeCurrencyCode: string;
  readonly valuation: RewardValuation;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/** Stable, machine-readable reasons a card was rejected. */
export const INELIGIBILITY_CODES = [
  'no_active_rules',
  'card_excluded_by_user',
  'country_not_supported',
  'currency_not_supported',
  'rule_not_yet_active',
  'rule_expired',
  'category_mismatch',
  'mcc_mismatch',
  'merchant_excluded',
  'merchant_not_included',
  'channel_mismatch',
  'payment_method_mismatch',
  'amount_below_minimum',
  'amount_above_maximum',
  'not_enrolled',
  'cap_exhausted',
  'spend_threshold_not_met',
  'non_cash_reward_declined',
  'zero_value_reward',
] as const;

export type IneligibilityCode = (typeof INELIGIBILITY_CODES)[number];

/** Stable, machine-readable warnings surfaced alongside a recommendation. */
export const RECOMMENDATION_WARNINGS = [
  'merchant_coding_uncertain',
  'category_inferred',
  'category_missing',
  'cap_partially_available',
  'cap_nearly_reached',
  'enrollment_required',
  'source_unverified',
  'source_stale',
  'foreign_transaction_fee_applied',
  'tie_broken_by_preference',
  'offer_requires_activation',
  'estimated_point_valuation',
] as const;

export type RecommendationWarning = (typeof RECOMMENDATION_WARNINGS)[number];

/** The deterministic arithmetic behind one candidate, exposed for auditing. */
export interface RewardBreakdown {
  readonly appliedRuleId: string | null;
  readonly appliedRuleLabel: string | null;
  readonly appliedOfferId: string | null;
  readonly rewardType: RewardType | null;
  readonly rewardUnit: RewardUnit | null;
  /** Percent for cash back, multiplier for points/miles. */
  readonly effectiveRate: number | null;
  readonly withinCapSpendUsd: number;
  readonly overCapSpendUsd: number;
  readonly postCapRate: number | null;
  readonly grossRewardUnits: number;
  readonly appliedCentsPerUnit: number | null;
  readonly rewardValueUsd: number;
  readonly offerValueUsd: number;
  readonly statementCreditUsd: number;
  readonly foreignTransactionFeeUsd: number;
  readonly netValueUsd: number;
}

export interface RecommendationCandidate {
  readonly card: EvaluableCard;
  readonly rank: number;
  readonly isEligible: boolean;
  readonly breakdown: RewardBreakdown;
  readonly confidence: ConfidenceLevel;
  /** Human-readable, assembled deterministically from the applied rule. */
  readonly reason: string;
  readonly ineligibilityCode: IneligibilityCode | null;
  readonly capAmountUsd: number | null;
  readonly capRemainingUsd: number | null;
  readonly capPeriod: CapPeriod | null;
  readonly sourceVerifiedAt: Date | null;
  readonly verificationStatus: VerificationStatus | null;
  readonly warnings: readonly RecommendationWarning[];
}

/**
 * The full engine result. Matches the "recommendation response" section of the
 * product specification: recommended card, estimated reward, estimated dollar
 * value, reward rate, reason, relevant cap, remaining cap, active offer,
 * confidence, source verification date, and the merchant-coding warning.
 */
export interface RecommendationResult {
  readonly engineVersion: string;
  readonly computedAt: Date;
  readonly intent: PurchaseIntent;
  readonly recommended: RecommendationCandidate | null;
  readonly runnerUp: RecommendationCandidate | null;
  /** Every card the engine could use, best first. */
  readonly eligible: readonly RecommendationCandidate[];
  /** Every card that could not be used, with a reason each. */
  readonly ineligible: readonly RecommendationCandidate[];
  /** `recommended.netValueUsd - runnerUp.netValueUsd`, never negative. */
  readonly advantageOverRunnerUpUsd: number | null;
  readonly confidence: ConfidenceLevel;
  readonly warnings: readonly RecommendationWarning[];
  /** One or two sentences, assembled from the breakdown. Never model-generated. */
  readonly explanation: string;
}

/**
 * The Phase 3 entry point.
 *
 * Implementations must be pure: no clock, no network, no randomness. `context`
 * carries the `asOf` instant precisely so tests can pin time.
 */
export type EvaluateWallet = (
  intent: PurchaseIntent,
  cards: readonly EvaluableCard[],
  context: EvaluationContext,
) => RecommendationResult;
