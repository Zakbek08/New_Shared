/**
 * Recording purchase queries and recommendations.
 *
 * The engine runs *between* `recordPurchaseQuery` and `persistRecommendation`, on
 * the device, as a pure function. There is no server-side recommendation
 * endpoint and no reason for one.
 *
 * Both writes snapshot what the engine decided, so an old answer stays
 * explainable after the catalog changes underneath it.
 */
import type { Classification } from '@/domain/classifier/types';
import type { PurchaseIntentInput } from '@/domain/schemas';
import type { RecommendationResult } from '@/domain/rewards';
import { fromPostgrestError, toDataError, DataError } from '@/lib/errors';
import { getSupabaseClient } from '@/lib/supabase';
import { track } from '@/services/analytics';
import type { ClassifiableMerchant } from '@/domain/classifier/types';
import type { MerchantRow, PurchaseQueryRow, RecommendationRow } from '@/types/database';

// ---------------------------------------------------------------------------
// Merchants, for the classifier
// ---------------------------------------------------------------------------

function toClassifiableMerchant(row: MerchantRow): ClassifiableMerchant {
  return {
    id: row.id,
    displayName: row.display_name,
    aliases: row.aliases,
    primaryCategoryId: row.primary_category_id,
    knownMcc: row.known_mcc,
    mccConfidence: row.mcc_confidence,
    hasAmbiguousCoding: row.has_ambiguous_coding,
    countryCode: row.country_code,
    isOnlineOnly: row.is_online_only,
  };
}

/**
 * Merchants for a country, for the classifier to match against.
 *
 * The whole country's list rather than a search: the classifier needs to try exact
 * matches, aliases and partial matches, and doing that server-side would mean
 * reimplementing its precedence rules in SQL where they could drift.
 */
export async function listMerchantsForClassification(
  countryCode: string,
): Promise<ClassifiableMerchant[]> {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('merchants')
      .select('*')
      .eq('country_code', countryCode.toUpperCase())
      .order('display_name', { ascending: true })
      .limit(200);

    if (error !== null) throw fromPostgrestError(error);
    return (data ?? []).map(toClassifiableMerchant);
  } catch (cause) {
    throw toDataError(cause);
  }
}

/** Merchant name suggestions for the purchase form's autocomplete. */
export async function searchMerchants(
  search: string,
  countryCode: string,
): Promise<{ readonly id: string; readonly displayName: string }[]> {
  const supabase = getSupabaseClient();
  const term = search.trim();
  if (term.length < 2) return [];

  try {
    // Escape the PostgREST filter metacharacters so a search string cannot
    // restructure the filter.
    const safe = term.replace(/[%,()]/gu, ' ');

    const { data, error } = await supabase
      .from('merchants')
      .select('id, display_name')
      .eq('country_code', countryCode.toUpperCase())
      .ilike('display_name', `%${safe}%`)
      .order('display_name', { ascending: true })
      .limit(8);

    if (error !== null) throw fromPostgrestError(error);
    return (data ?? []).map((row) => ({ id: row.id, displayName: row.display_name }));
  } catch (cause) {
    throw toDataError(cause);
  }
}

// ---------------------------------------------------------------------------
// Purchase queries
// ---------------------------------------------------------------------------

/**
 * Records the question the user asked.
 *
 * A `purchase_query` is a hypothetical — WalletWise never initiates a payment —
 * and the row is immutable: there is no UPDATE policy on the table.
 */
export async function recordPurchaseQuery(options: {
  readonly input: PurchaseIntentInput;
  readonly classification: Classification;
  readonly rawNaturalLanguageInput?: string | null;
}): Promise<PurchaseQueryRow> {
  const supabase = getSupabaseClient();
  const { input, classification } = options;

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError !== null || userData.user === null) {
      throw new DataError('unauthenticated', 'Please sign in again.');
    }

    const { data, error } = await supabase
      .from('purchase_queries')
      .insert({
        user_id: userData.user.id,
        merchant_input: input.merchant,
        amount_usd: input.amountUsd,
        currency_code: input.currencyCode,
        country_code: input.countryCode,
        channel: input.channel,
        payment_method: input.paymentMethod,
        notes: input.notes ?? null,
        resolved_merchant_id: classification.merchantId,
        resolved_category_id: classification.categoryId,
        resolved_mcc: classification.mcc,
        category_match_kind: classification.matchKind,
        category_confidence: classification.confidence,
        has_coding_warning: classification.hasAmbiguousCoding,
        raw_natural_language_input: options.rawNaturalLanguageInput ?? null,
      })
      .select('*')
      .single();

    if (error !== null) throw fromPostgrestError(error);

    // Redaction turns the merchant into a length and the amount into a band.
    track('purchase_query_submitted', {
      categoryMatchKind: classification.matchKind,
      hasCodingWarning: classification.hasAmbiguousCoding,
      channel: input.channel,
      paymentMethod: input.paymentMethod,
      amountUsd: input.amountUsd,
      merchant: input.merchant,
    });

    return data;
  } catch (cause) {
    throw toDataError(cause);
  }
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

/**
 * Persists the engine's answer, including the cards that did *not* qualify.
 *
 * Storing the rejections is what lets the details screen answer "why not my other
 * card?" months later, even if the catalog has moved on since.
 */
export async function persistRecommendation(
  purchaseQueryId: string,
  result: RecommendationResult,
): Promise<RecommendationRow> {
  const supabase = getSupabaseClient();

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError !== null || userData.user === null) {
      throw new DataError('unauthenticated', 'Please sign in again.');
    }

    const recommended = result.recommended;

    const { data: recommendation, error: recommendationError } = await supabase
      .from('recommendations')
      .insert({
        user_id: userData.user.id,
        purchase_query_id: purchaseQueryId,
        recommended_user_card_id: recommended?.card.userCardId ?? null,
        runner_up_user_card_id: result.runnerUp?.card.userCardId ?? null,
        estimated_value_usd: recommended?.breakdown.netValueUsd ?? null,
        estimated_reward_units: recommended?.breakdown.grossRewardUnits ?? null,
        reward_unit: recommended?.breakdown.rewardUnit ?? null,
        advantage_over_runner_up_usd: result.advantageOverRunnerUpUsd,
        confidence: result.confidence,
        explanation: result.explanation,
        warnings: [...result.warnings],
        engine_version: result.engineVersion,
        candidate_count: result.eligible.length + result.ineligible.length,
        eligible_count: result.eligible.length,
        computed_at: result.computedAt.toISOString(),
      })
      .select('*')
      .single();

    if (recommendationError !== null) throw fromPostgrestError(recommendationError);

    const candidates = [...result.eligible, ...result.ineligible].map((candidate) => ({
      recommendation_id: recommendation.id,
      user_card_id: candidate.card.userCardId,
      rank: candidate.rank,
      is_eligible: candidate.isEligible,
      applied_reward_rule_id: candidate.breakdown.appliedRuleId,
      applied_user_offer_id: candidate.breakdown.appliedOfferId,
      effective_rate: candidate.breakdown.effectiveRate,
      reward_unit: candidate.breakdown.rewardUnit,
      gross_reward_units: candidate.breakdown.grossRewardUnits,
      capped_spend_usd: candidate.breakdown.withinCapSpendUsd,
      uncapped_spend_usd: candidate.breakdown.overCapSpendUsd,
      offer_value_usd: candidate.breakdown.offerValueUsd,
      statement_credit_usd: candidate.breakdown.statementCreditUsd,
      foreign_transaction_fee_usd: candidate.breakdown.foreignTransactionFeeUsd,
      applied_cents_per_unit: candidate.breakdown.appliedCentsPerUnit,
      net_value_usd: candidate.breakdown.netValueUsd,
      cap_amount_usd: candidate.capAmountUsd,
      cap_remaining_usd: candidate.capRemainingUsd,
      cap_period: candidate.capPeriod,
      confidence: candidate.confidence,
      reason: candidate.reason,
      ineligibility_code: candidate.ineligibilityCode,
      source_verified_at: candidate.sourceVerifiedAt?.toISOString() ?? null,
      verification_status: candidate.verificationStatus,
      warnings: [...candidate.warnings],
    }));

    if (candidates.length > 0) {
      const { error: candidateError } = await supabase
        .from('recommendation_candidates')
        .insert(candidates);

      if (candidateError !== null) {
        // The recommendation without its candidates cannot be explained, so do
        // not leave a half-written answer behind.
        await supabase.from('recommendations').delete().eq('id', recommendation.id);
        throw fromPostgrestError(candidateError);
      }
    }

    track('recommendation_viewed', {
      confidence: result.confidence,
      eligibleCount: result.eligible.length,
      candidateCount: candidates.length,
      engineVersion: result.engineVersion,
    });

    return recommendation;
  } catch (cause) {
    throw toDataError(cause);
  }
}

export async function markRecommendationAccepted(id: string): Promise<void> {
  const supabase = getSupabaseClient();

  try {
    const { error } = await supabase
      .from('recommendations')
      .update({ was_accepted: true, accepted_at: new Date().toISOString() })
      .eq('id', id);

    if (error !== null) throw fromPostgrestError(error);
    track('recommendation_accepted');
  } catch (cause) {
    throw toDataError(cause);
  }
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export interface RecommendationSummary {
  readonly id: string;
  readonly merchantInput: string;
  readonly amountUsd: number;
  readonly categoryId: string | null;
  readonly hasCodingWarning: boolean;
  readonly estimatedValueUsd: number | null;
  readonly recommendedCardName: string | null;
  readonly confidence: RecommendationRow['confidence'];
  readonly createdAt: string;
}

const HISTORY_SELECT = `
  id, estimated_value_usd, confidence, created_at,
  purchase_queries ( merchant_input, amount_usd, resolved_category_id, has_coding_warning ),
  user_cards!recommendations_recommended_user_card_id_fkey (
    nickname,
    card_products ( name )
  )
`;

type HistoryRow = {
  id: string;
  estimated_value_usd: number | null;
  confidence: RecommendationRow['confidence'];
  created_at: string;
  purchase_queries: {
    merchant_input: string;
    amount_usd: number;
    resolved_category_id: string | null;
    has_coding_warning: boolean;
  } | null;
  user_cards: { nickname: string | null; card_products: { name: string } | null } | null;
};

/** The recently-evaluated list on the home dashboard. */
export async function listRecentRecommendations(limit = 10): Promise<RecommendationSummary[]> {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('recommendations')
      .select(HISTORY_SELECT)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error !== null) throw fromPostgrestError(error);

    return ((data ?? []) as unknown as HistoryRow[]).map((row) => ({
      id: row.id,
      merchantInput: row.purchase_queries?.merchant_input ?? 'Unknown merchant',
      amountUsd: row.purchase_queries?.amount_usd ?? 0,
      categoryId: row.purchase_queries?.resolved_category_id ?? null,
      hasCodingWarning: row.purchase_queries?.has_coding_warning ?? false,
      estimatedValueUsd: row.estimated_value_usd,
      recommendedCardName:
        row.user_cards === null
          ? null
          : (row.user_cards.nickname ?? row.user_cards.card_products?.name ?? null),
      confidence: row.confidence,
      createdAt: row.created_at,
    }));
  } catch (cause) {
    throw toDataError(cause);
  }
}
