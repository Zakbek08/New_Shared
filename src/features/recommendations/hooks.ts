/**
 * The recommendation pipeline, as a mutation.
 *
 * Order matters, and the boundary between impure and pure is the whole point:
 *
 *   1. load the merchant catalog        (impure)
 *   2. classify the purchase            PURE
 *   3. record the query                 (impure)
 *   4. load the wallet snapshot         (impure — the last one)
 *   5. run the engine                   PURE
 *   6. persist the answer               (impure)
 *
 * Step 5 receives a fully-materialised snapshot and an explicit `asOf`. It is the
 * only step that decides a reward figure, and it cannot reach the network even if
 * someone later wanted it to.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { classifyPurchase } from '@/domain/classifier/classify';
import type { Classification } from '@/domain/classifier/types';
import { getCategoryBySlug } from '@/domain/categories';
import type { PurchaseIntentInput } from '@/domain/schemas';
import {
  evaluateWallet,
  type PurchaseIntent,
  type RecommendationResult,
} from '@/domain/rewards';
import { useAuth } from '@/features/auth/AuthProvider';
import { queryKeys } from '@/lib/queryKeys';

import {
  listMerchantsForClassification,
  listRecentRecommendations,
  markRecommendationAccepted,
  persistRecommendation,
  recordPurchaseQuery,
  searchMerchants,
  type RecommendationSummary,
} from './api/recommendations';
import { loadWalletSnapshot, type WalletSnapshot } from './api/snapshot';

/** Everything a caller needs to render the results screen. */
export interface RecommendationOutcome {
  readonly recommendationId: string;
  readonly purchaseQueryId: string;
  readonly result: RecommendationResult;
  readonly classification: Classification;
}

export interface RecommendInput {
  readonly purchase: PurchaseIntentInput;
  /** The original free text, when the user described the purchase in words. */
  readonly rawNaturalLanguageInput?: string | null;
  /**
   * The instant to evaluate against.
   *
   * Supplied by the caller rather than read from a clock inside the engine. In the
   * app this is "now" at submit time; in a test it is a fixed date.
   */
  readonly asOf: Date;
}

/**
 * Builds the engine's input from the form values and the classification.
 *
 * The user's quick-button category is passed to the classifier as *evidence*, not
 * as the answer: a known merchant's own coding outranks it, because that is what
 * the issuer will actually use.
 */
function toPurchaseIntent(
  purchase: PurchaseIntentInput,
  classification: Classification,
): PurchaseIntent {
  return {
    merchantInput: purchase.merchant,
    amountUsd: purchase.amountUsd,
    currencyCode: purchase.currencyCode,
    countryCode: purchase.countryCode,
    channel: purchase.channel,
    paymentMethod: purchase.paymentMethod,
    categoryId: classification.categoryId,
    merchantId: classification.merchantId,
    mcc: classification.mcc,
    categoryMatchKind: classification.matchKind,
    categoryConfidence: classification.confidence,
    hasAmbiguousCoding: classification.hasAmbiguousCoding,
    notes: purchase.notes ?? null,
  };
}

/**
 * Runs the whole pipeline.
 *
 * Not retried on failure: a retry would create a second `purchase_query` row and a
 * second recommendation for one user action.
 */
export function useRecommend() {
  const queryClient = useQueryClient();

  return useMutation<RecommendationOutcome, unknown, RecommendInput>({
    retry: 0,
    mutationFn: async ({ purchase, rawNaturalLanguageInput, asOf }) => {
      // 1. Merchant catalog (impure)
      const merchants = await listMerchantsForClassification(purchase.countryCode);

      // 2. Classify (PURE)
      const userSelectedCategoryId =
        purchase.categorySlug === null
          ? null
          : (getCategoryBySlug(purchase.categorySlug)?.id ?? null);

      const classification = classifyPurchase(
        {
          merchantInput: purchase.merchant,
          userSelectedCategoryId,
          mcc: null,
          countryCode: purchase.countryCode,
          channel: purchase.channel,
        },
        merchants,
      );

      // 3. Record the question (impure)
      const query = await recordPurchaseQuery({
        input: purchase,
        classification,
        rawNaturalLanguageInput: rawNaturalLanguageInput ?? null,
      });

      // 4. Wallet snapshot — the last impure step
      const snapshot = await loadWalletSnapshot();

      // 5. Evaluate (PURE). No clock, no network, no randomness.
      const result = evaluateWallet(
        toPurchaseIntent(purchase, classification),
        snapshot.cards,
        {
          asOf,
          homeCurrencyCode: 'USD',
          valuation: snapshot.valuation,
        },
      );

      // 6. Persist (impure)
      const recommendation = await persistRecommendation(query.id, result);

      return {
        recommendationId: recommendation.id,
        purchaseQueryId: query.id,
        result,
        classification,
      };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.recommendations.all }),
  });
}

/**
 * The engine's input snapshot, for screens that evaluate without a purchase form.
 *
 * The dashboard's "top card by category" uses this: one fetch, then thirteen pure
 * evaluations in memory. Cached under the wallet key so editing a card refreshes
 * it.
 */
export function useWalletSnapshot() {
  const { isSignedIn } = useAuth();

  return useQuery<WalletSnapshot>({
    queryKey: queryKeys.wallet.snapshot(),
    queryFn: () => loadWalletSnapshot(),
    enabled: isSignedIn,
  });
}

export function useRecentRecommendations(limit = 10) {
  const { isSignedIn } = useAuth();

  return useQuery<RecommendationSummary[]>({
    queryKey: queryKeys.recommendations.recent(limit),
    queryFn: () => listRecentRecommendations(limit),
    enabled: isSignedIn,
  });
}

export function useMerchantSuggestions(search: string, countryCode: string) {
  const { isSignedIn } = useAuth();

  return useQuery({
    queryKey: queryKeys.recommendations.merchantSearch(search, countryCode),
    queryFn: () => searchMerchants(search, countryCode),
    enabled: isSignedIn && search.trim().length >= 2,
    placeholderData: (previous) => previous,
  });
}

export function useAcceptRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => markRecommendationAccepted(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.recommendations.all }),
  });
}
