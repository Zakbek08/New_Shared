/**
 * Turns a wallet and a purchase into a recommendation.
 *
 * This is the only place the app's two halves meet: the stored card ids on one side,
 * the pure engine in `src/domain/rewards/` on the other. It does no arithmetic itself.
 * Every figure a user sees comes out of `evaluateWallet`, computed from the rule
 * records in `src/data/marketCards.ts`.
 *
 * That separation is the point of the whole design. If this file started adjusting a
 * rate, capping a number or breaking a tie, the recommendation would stop being
 * reproducible and no test could pin it.
 */
import { classifyPurchase } from '@/domain/classifier/classify';
import type { Classification } from '@/domain/classifier/types';
import { evaluateWallet } from '@/domain/rewards';
import type {
  EvaluableCard,
  PurchaseIntent,
  RecommendationResult,
  RewardValuation,
} from '@/domain/rewards/types';
import { findMarketCard, toEvaluableCard } from '@/data/marketCards';
import type { PaymentMethod } from '@/types/database';
import type { Wallet } from './storage';

/** What the purchase screen collects. */
export interface PurchaseInput {
  readonly merchant: string;
  readonly amountUsd: number;
  /** The category the user chose. Always set — the screen requires a choice. */
  readonly categoryId: string;
  readonly channel: 'in_store' | 'online';
  readonly paymentMethod: PaymentMethod;
}

/**
 * How a point or a mile is valued, and why this number is stated rather than hidden.
 *
 * One cent per point is the conservative floor most issuers' own cash-redemption
 * options sit at or near. It is an **assumption**, not a rate read off a product page,
 * so the result screen says so in words next to any points figure.
 *
 * The alternative — using an aggregator's "we think these points are worth 1.8¢"
 * figure — would put a number in front of the user that depends on how *somebody else*
 * redeems, dressed up as a fact about their money. A stated floor is honest and
 * pessimistic in the right direction: a points card that wins at 1¢ wins at any higher
 * valuation too.
 */
export const CENTS_PER_POINT = 1;

const VALUATION: RewardValuation = {
  byProgramId: {},
  byUnit: { usd: 1, points: CENTS_PER_POINT, miles: CENTS_PER_POINT },
  prefersCashBackOnly: false,
  // Nothing to break: with no "preferred card" concept in this app, there is no
  // switching cost to clear.
  minimumSwitchBenefitUsd: 0,
};

/**
 * The wallet as the engine wants it.
 *
 * `activated` becomes per-rule enrollment. A card the user has not marked as activated
 * keeps its rotating bonus locked, which is the safe direction: the engine then reports
 * `not_enrolled` and the card competes on its base rate instead of on a 5% bonus the
 * cardholder may never have switched on.
 */
export function walletToCards(wallet: Wallet): readonly EvaluableCard[] {
  return wallet.cardIds.flatMap((cardId) => {
    const card = findMarketCard(cardId);
    if (card === null) return [];

    const isActivated = wallet.activated[cardId] === true;
    const evaluable = toEvaluableCard(card);

    if (!isActivated) return [evaluable];

    // Mark every rule that needs activation as enrolled, since that is exactly what
    // the user has told us about this card.
    const enrollments: Record<string, boolean> = {};
    for (const rule of evaluable.rules) {
      if (rule.requiresEnrollment) enrollments[rule.id] = true;
    }
    return [{ ...evaluable, enrollments }];
  });
}

export interface RecommendationOutcome {
  readonly result: RecommendationResult;
  readonly classification: Classification;
}

/**
 * The whole calculation, start to finish.
 *
 * `asOf` is a parameter rather than a clock reading here for the same reason it is one
 * in the engine: the caller reads the clock at the screen's edge, and a test can pin it.
 */
export function recommend(
  wallet: Wallet,
  input: PurchaseInput,
  asOf: Date,
): RecommendationOutcome {
  // No merchant catalog: this app has no merchant database and does not need one,
  // because the user picks the category directly. The classifier still runs, so the
  // match kind and confidence the result screen shows are the real ones.
  const classification = classifyPurchase(
    {
      merchantInput: input.merchant,
      userSelectedCategoryId: input.categoryId,
      mcc: null,
      countryCode: 'US',
      channel: input.channel,
    },
    [],
  );

  const intent: PurchaseIntent = {
    merchantInput: input.merchant,
    amountUsd: input.amountUsd,
    currencyCode: 'USD',
    countryCode: 'US',
    channel: input.channel,
    paymentMethod: input.paymentMethod,
    categoryId: classification.categoryId,
    merchantId: classification.merchantId,
    mcc: classification.mcc,
    categoryMatchKind: classification.matchKind,
    categoryConfidence: classification.confidence,
    hasAmbiguousCoding: classification.hasAmbiguousCoding,
  };

  const result = evaluateWallet(intent, walletToCards(wallet), {
    asOf,
    homeCurrencyCode: 'USD',
    valuation: VALUATION,
  });

  return { result, classification };
}
