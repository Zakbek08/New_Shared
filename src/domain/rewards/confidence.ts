/**
 * Step 10 of the engine: how much should the user trust this figure?
 *
 * Confidence is a WEAKEST-LINK calculation. It starts at `high` and every source
 * of doubt can only lower it, never raise it. That asymmetry is deliberate: in a
 * financial estimate, overstating certainty is the expensive mistake.
 */
import type { ConfidenceLevel, VerificationStatus } from '@/types/database';

import type { PurchaseIntent, RecommendationWarning } from './types';

const RANK: Record<ConfidenceLevel, number> = { low: 0, medium: 1, high: 2 };
const BY_RANK: readonly ConfidenceLevel[] = ['low', 'medium', 'high'];

/** The lower of two confidence levels. */
export function weaker(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel {
  return RANK[a] <= RANK[b] ? a : b;
}

export function weakest(levels: readonly ConfidenceLevel[]): ConfidenceLevel {
  return levels.reduce<ConfidenceLevel>((lowest, level) => weaker(lowest, level), 'high');
}

/** Caps a level at a ceiling without ever raising it. */
const capAt = (current: ConfidenceLevel, ceiling: ConfidenceLevel): ConfidenceLevel =>
  weaker(current, ceiling);

export function rankOf(level: ConfidenceLevel): number {
  return RANK[level];
}

export function levelFromRank(rank: number): ConfidenceLevel {
  return BY_RANK[Math.max(0, Math.min(2, rank))] ?? 'low';
}

/**
 * The confidence ceiling implied by a rule's provenance.
 *
 * Only a rule verified against a source can support `high`. Everything else is an
 * admission of some kind, and the UI should say so.
 */
export function confidenceForVerification(status: VerificationStatus | null): ConfidenceLevel {
  if (status === null) return 'low';

  switch (status) {
    case 'verified':
      return 'high';
    case 'user_reported':
    case 'stale':
    case 'unverified':
      return 'medium';
    case 'disputed':
    case 'retired':
      return 'low';
  }
}

export interface ConfidenceInputs {
  readonly intent: PurchaseIntent;
  readonly verificationStatus: VerificationStatus | null;
  readonly isCapPartiallyAvailable: boolean;
  readonly isCapNearlyReached: boolean;
  readonly requiresEnrollmentNotConfirmed: boolean;
  readonly hasForeignTransactionFee: boolean;
  readonly usesEstimatedValuation: boolean;
  readonly offerRequiresActivation: boolean;
}

export interface ConfidenceOutcome {
  readonly confidence: ConfidenceLevel;
  readonly warnings: readonly RecommendationWarning[];
}

/**
 * Computes confidence and the warnings that explain it.
 *
 * Every downgrade comes with a warning, so the level is never unexplained — a
 * "medium confidence" badge with no stated reason is worse than no badge.
 */
export function assessConfidence(inputs: ConfidenceInputs): ConfidenceOutcome {
  const warnings: RecommendationWarning[] = [];
  let confidence: ConfidenceLevel = 'high';

  // --- How well do we know what this merchant is? --------------------------
  if (inputs.intent.hasAmbiguousCoding) {
    // The issuer decides the category and this merchant is known to surprise
    // people. Nothing else we know can rescue that.
    confidence = capAt(confidence, 'low');
    warnings.push('merchant_coding_uncertain');
  }

  switch (inputs.intent.categoryMatchKind) {
    case 'unknown':
      confidence = capAt(confidence, 'low');
      warnings.push('category_missing');
      break;
    case 'inferred':
      confidence = capAt(confidence, 'medium');
      warnings.push('category_inferred');
      break;
    case 'exact_merchant':
    case 'known_mcc':
    case 'user_selected':
      break;
  }

  // The classifier's own confidence in the match is a ceiling too.
  confidence = capAt(confidence, inputs.intent.categoryConfidence);

  // --- How well do we know the rate? ---------------------------------------
  const provenance = confidenceForVerification(inputs.verificationStatus);
  confidence = capAt(confidence, provenance);

  if (inputs.verificationStatus === 'unverified') warnings.push('source_unverified');
  if (inputs.verificationStatus === 'stale') warnings.push('source_stale');
  if (inputs.verificationStatus === 'user_reported') warnings.push('source_unverified');

  // --- How well do we know the cap? ----------------------------------------
  if (inputs.isCapPartiallyAvailable) {
    confidence = capAt(confidence, 'medium');
    warnings.push('cap_partially_available');
  }
  if (inputs.isCapNearlyReached) {
    warnings.push('cap_nearly_reached');
  }

  // --- Things the user has to do -------------------------------------------
  if (inputs.requiresEnrollmentNotConfirmed) {
    confidence = capAt(confidence, 'medium');
    warnings.push('enrollment_required');
  }
  if (inputs.offerRequiresActivation) {
    warnings.push('offer_requires_activation');
  }

  // --- Costs and estimates -------------------------------------------------
  if (inputs.hasForeignTransactionFee) {
    warnings.push('foreign_transaction_fee_applied');
  }
  if (inputs.usesEstimatedValuation) {
    // Not a downgrade: the arithmetic is exact, the *input* is the user's guess.
    warnings.push('estimated_point_valuation');
  }

  return { confidence, warnings: dedupe(warnings) };
}

function dedupe(warnings: readonly RecommendationWarning[]): readonly RecommendationWarning[] {
  return [...new Set(warnings)];
}
