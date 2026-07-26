/**
 * "Your top cards by category" for the home dashboard.
 *
 * Runs the real engine once per category against a reference amount, rather than
 * approximating with a headline rate. That matters: a card's *best* rate is not
 * always the one that wins, once caps, exclusions, activation and the user's own
 * point valuations are taken into account.
 *
 * Cheap to do properly, because the engine is a pure function over an in-memory
 * snapshot — thirteen evaluations of a ten-card wallet is trivial work, and no
 * extra network traffic.
 */
import { CATEGORIES, type CategoryDefinition } from '@/domain/categories';
import {
  evaluateWallet,
  type EvaluableCard,
  type RecommendationCandidate,
  type RewardValuation,
} from '@/domain/rewards';

/**
 * The amount each category is evaluated at.
 *
 * A round $100 keeps the comparison legible and makes the effective rate readable
 * straight off the figure. It is a *reference* purchase, and the UI says so — a
 * real purchase with a nearly-exhausted cap can rank differently.
 */
export const REFERENCE_AMOUNT_USD = 100;

export interface TopCardForCategory {
  readonly category: CategoryDefinition;
  readonly candidate: RecommendationCandidate | null;
  /** Effective return on the reference amount, as a percentage. */
  readonly effectiveReturnPercent: number | null;
}

/**
 * Best card per category.
 *
 * Pure: takes the snapshot and the instant as arguments. Categories where nothing
 * qualifies return a `null` candidate rather than being omitted, so the UI can say
 * "no card earns a bonus here" instead of silently shortening the list.
 */
export function topCardsByCategory(options: {
  readonly cards: readonly EvaluableCard[];
  readonly valuation: RewardValuation;
  readonly asOf: Date;
  readonly homeCurrencyCode?: string;
  /** Defaults to every category except `other`, which is not a real bonus target. */
  readonly categories?: readonly CategoryDefinition[];
}): readonly TopCardForCategory[] {
  const categories =
    options.categories ?? CATEGORIES.filter((category) => category.slug !== 'other');

  return categories.map((category) => {
    const result = evaluateWallet(
      {
        merchantInput: category.displayName,
        amountUsd: REFERENCE_AMOUNT_USD,
        currencyCode: 'USD',
        countryCode: 'US',
        // In store is the commoner case and the more conservative one: it cannot
        // pick up an online-only bonus the user might not be able to use.
        channel: 'in_store',
        paymentMethod: 'physical_card',
        categoryId: category.id,
        merchantId: null,
        mcc: null,
        // The user picked the category by definition — this *is* the category view.
        categoryMatchKind: 'user_selected',
        categoryConfidence: 'high',
        hasAmbiguousCoding: false,
      },
      options.cards,
      {
        asOf: options.asOf,
        homeCurrencyCode: options.homeCurrencyCode ?? 'USD',
        valuation: options.valuation,
      },
    );

    const candidate = result.recommended;

    return {
      category,
      candidate,
      effectiveReturnPercent:
        candidate === null
          ? null
          : // netValue / reference × 100, rounded to one place for display.
            Math.round((candidate.breakdown.netValueUsd / REFERENCE_AMOUNT_USD) * 1000) / 10,
    };
  });
}
