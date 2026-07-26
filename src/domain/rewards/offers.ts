/**
 * Step 7 of the engine: user-entered merchant offers.
 *
 * Offers stack on top of the rule reward — that is what a targeted offer is. They
 * are typed in by hand from the issuer's app, because WalletWise never logs in to
 * a bank, so their value is only as current as the user's last update.
 */
import { percentOf, roundUsd, unitsFor } from './money';
import { windowContains } from './conditions';
import { valueRewardUsd } from './valuation';
import type { EvaluableOffer, PurchaseIntent, RewardValuation } from './types';

export interface OfferOutcome {
  readonly offer: EvaluableOffer;
  readonly valueUsd: number;
  /** True when the user has not confirmed the offer is activated. */
  readonly requiresActivation: boolean;
  /** True when `maxBenefitUsd` trimmed the value. */
  readonly wasBenefitCapped: boolean;
}

/**
 * Whether an offer applies to this purchase.
 *
 * Merchant matching prefers the catalog id. When the offer carries only a
 * free-text label — which is the normal case, since users type these in — the
 * label is compared case-insensitively against what the user entered for the
 * merchant. That is deliberately a loose match on a field the same person wrote
 * both times.
 */
export function offerApplies(
  offer: EvaluableOffer,
  intent: PurchaseIntent,
  asOf: Date,
): boolean {
  if (!windowContains(offer.startsAt, offer.endsAt, asOf).matched) return false;

  if (offer.channel !== 'either' && offer.channel !== intent.channel) return false;

  if (intent.amountUsd < offer.minimumSpendUsd) return false;

  if (offer.merchantId !== null) {
    return offer.merchantId === intent.merchantId;
  }

  if (offer.merchantLabel !== null) {
    const label = offer.merchantLabel.trim().toLowerCase();
    const typed = intent.merchantInput.trim().toLowerCase();
    return label.length > 0 && (typed.includes(label) || label.includes(typed));
  }

  // An offer with neither a merchant id nor a label cannot be matched to
  // anything. The database forbids it; refusing to apply it is the safe reading.
  return false;
}

/** The USD value of an offer on this purchase, before its benefit cap. */
function nominalValueUsd(
  offer: EvaluableOffer,
  intent: PurchaseIntent,
  valuation: RewardValuation,
): number {
  if (offer.rewardType === 'statement_credit' || offer.rewardType === 'fixed_amount') {
    return offer.fixedAmountUsd ?? 0;
  }

  if (offer.rewardUnit === 'usd') {
    return percentOf(intent.amountUsd, offer.rate);
  }

  // A points or miles offer is valued with the user's own figure, like any other
  // non-cash reward. Offers carry no program, so the per-unit default applies.
  const units = unitsFor(intent.amountUsd, offer.rate);
  return valueRewardUsd(units, offer.rewardUnit, null, valuation).valueUsd;
}

/**
 * The best applicable offer, or `null`.
 *
 * One offer at a time: real issuers do not stack two targeted offers on a single
 * transaction, and assuming otherwise would overstate the reward.
 */
export function bestOffer(
  offers: readonly EvaluableOffer[],
  intent: PurchaseIntent,
  valuation: RewardValuation,
  asOf: Date,
): OfferOutcome | null {
  let best: OfferOutcome | null = null;

  for (const offer of offers) {
    if (!offerApplies(offer, intent, asOf)) continue;

    const nominal = nominalValueUsd(offer, intent, valuation);
    const capped =
      offer.maxBenefitUsd === null ? nominal : Math.min(nominal, offer.maxBenefitUsd);

    const outcome: OfferOutcome = {
      offer,
      valueUsd: roundUsd(capped),
      requiresActivation: !offer.isEnrolled,
      wasBenefitCapped: capped < nominal,
    };

    if (best === null || outcome.valueUsd > best.valueUsd) {
      best = outcome;
      continue;
    }
    // Deterministic tie-break, so the result never depends on array order.
    if (outcome.valueUsd === best.valueUsd && outcome.offer.id < best.offer.id) {
      best = outcome;
    }
  }

  return best;
}
