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

/** Best-first over `valueUsd`, with a deterministic tie-break on offer id. */
function better(candidate: OfferOutcome, incumbent: OfferOutcome | null): boolean {
  if (incumbent === null) return true;
  if (candidate.valueUsd !== incumbent.valueUsd) {
    return candidate.valueUsd > incumbent.valueUsd;
  }
  // Never depend on array order.
  return candidate.offer.id < incumbent.offer.id;
}

export interface OfferSelection {
  /**
   * The offer whose value counts towards the recommendation.
   *
   * Only ever an offer the user has confirmed is activated.
   */
  readonly applied: OfferOutcome | null;
  /**
   * An offer that would have applied but has not been activated.
   *
   * Its value is deliberately **not** counted. Reported separately so the UI can
   * say "activate this and the answer changes", which is actionable, instead of
   * quietly promising money the user will not receive.
   */
  readonly awaitingActivation: OfferOutcome | null;
}

/**
 * The best applicable offer, split by whether it can actually be claimed.
 *
 * One offer at a time: real issuers do not stack two targeted offers on a single
 * transaction, and assuming otherwise would overstate the reward.
 *
 * WHY ACTIVATION GATES THE VALUE
 * A targeted offer pays nothing until the cardholder activates it in the issuer's
 * app. Counting an unactivated offer would tell someone a $60 purchase is worth
 * $10.60 when it will actually earn $0.60 — the exact defect CLAUDE.md exists to
 * prevent, and the same reason an unactivated rotating-category *rule* is screened
 * out rather than valued. The two paths now behave alike.
 */
export function bestOffer(
  offers: readonly EvaluableOffer[],
  intent: PurchaseIntent,
  valuation: RewardValuation,
  asOf: Date,
): OfferSelection {
  let applied: OfferOutcome | null = null;
  let awaitingActivation: OfferOutcome | null = null;

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

    if (outcome.requiresActivation) {
      if (better(outcome, awaitingActivation)) awaitingActivation = outcome;
    } else if (better(outcome, applied)) {
      applied = outcome;
    }
  }

  return { applied, awaitingActivation };
}
