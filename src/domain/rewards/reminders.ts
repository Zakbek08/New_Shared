/**
 * The two things in a wallet that quietly expire: an unactivated rotating
 * category, and a targeted offer.
 *
 * Both cost the user money by doing nothing, which makes them worth surfacing on
 * the dashboard rather than leaving to be discovered. Both are derived here as
 * pure functions of the snapshot and `asOf`, so the dashboard and any future
 * notification job cannot disagree about what is expiring.
 */
import { daysRemainingInWindow } from './capWindow';
import { windowContains } from './conditions';
import type { EvaluableCard, EvaluableOffer, EvaluableRule } from './types';

/** How near an expiry has to be before it is worth interrupting the user. */
export const EXPIRY_WARNING_DAYS = 14;

// ---------------------------------------------------------------------------
// Rotating categories
// ---------------------------------------------------------------------------

export interface RotatingCategoryPeriod {
  readonly userCardId: string;
  readonly cardName: string;
  readonly ruleId: string;
  readonly ruleLabel: string;
  /** The categories this period pays a bonus in. May be empty on a broad rule. */
  readonly categoryIds: readonly string[];
  readonly requiresActivation: boolean;
  readonly isActivated: boolean;
  /** `null` when the rule has no end date. */
  readonly daysUntilPeriodEnds: number | null;
  readonly capAmountUsd: number | null;
  /** Percent for cash back, multiplier for points and miles. */
  readonly rate: number;
}

/** Categories named by any of a rule's conditions, deduplicated, in order. */
function categoryIdsFor(rule: EvaluableRule): readonly string[] {
  return [...new Set(rule.conditions.flatMap((condition) => condition.categoryIds))];
}

/**
 * The rotating-category periods currently running across the wallet.
 *
 * This feeds two dashboard regions at once — "this quarter's categories" and the
 * activation reminder — precisely so the two cannot drift apart.
 *
 * Only `rotating_category` rules inside their own date window are returned. A
 * quarter that has ended is not "current" no matter how good its rate was, and an
 * announced future quarter is not something the user can act on yet.
 */
export function activeRotatingCategories(
  cards: readonly EvaluableCard[],
  asOf: Date,
): readonly RotatingCategoryPeriod[] {
  const periods: RotatingCategoryPeriod[] = [];

  for (const card of cards) {
    for (const rule of card.rules) {
      if (!rule.isActive) continue;
      if (rule.kind !== 'rotating_category') continue;
      if (!windowContains(rule.startsAt, rule.endsAt, asOf).matched) continue;

      periods.push({
        userCardId: card.userCardId,
        cardName: card.displayName,
        ruleId: rule.id,
        ruleLabel: rule.label,
        categoryIds: categoryIdsFor(rule),
        requiresActivation: rule.requiresEnrollment,
        isActivated: card.enrollments[rule.id] === true,
        daysUntilPeriodEnds:
          rule.endsAt === null
            ? null
            : daysRemainingInWindow({ startsAt: rule.startsAt, endsAt: rule.endsAt }, asOf),
        capAmountUsd: rule.capAmount,
        rate: rule.baseRate,
      });
    }
  }

  // Soonest to end first — that is the order of urgency — then rule id for a
  // stable total order.
  return periods.sort((left, right) => {
    const leftDays = left.daysUntilPeriodEnds ?? Number.POSITIVE_INFINITY;
    const rightDays = right.daysUntilPeriodEnds ?? Number.POSITIVE_INFINITY;
    if (leftDays !== rightDays) return leftDays - rightDays;
    return left.ruleId.localeCompare(right.ruleId);
  });
}

/**
 * The periods the user is losing money on right now: live, needs activating, not
 * activated.
 *
 * Deliberately not filtered by how close the deadline is. An unactivated bonus is
 * worth acting on the day the quarter opens, not only in its final fortnight.
 */
export function pendingActivations(
  cards: readonly EvaluableCard[],
  asOf: Date,
): readonly RotatingCategoryPeriod[] {
  return activeRotatingCategories(cards, asOf).filter(
    (period) => period.requiresActivation && !period.isActivated,
  );
}

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

export interface OfferExpiry {
  readonly userCardId: string;
  readonly cardName: string;
  readonly offerId: string;
  readonly title: string;
  readonly merchantLabel: string | null;
  /** Days until the offer ends, rounded up. `0` means it ends today. */
  readonly daysUntilExpiry: number;
  readonly endsAt: Date;
  readonly isEnrolled: boolean;
  readonly minimumSpendUsd: number;
  readonly maxBenefitUsd: number | null;
}

/**
 * Offers ending within `withinDays`, soonest first.
 *
 * An offer that has *already* ended is excluded rather than reported as expiring:
 * there is nothing left to act on, and listing it would push a live offer down the
 * screen. Offers with no end date never appear here, which is correct — they are
 * not expiring.
 */
export function expiringOffers(
  cards: readonly EvaluableCard[],
  asOf: Date,
  options: { readonly withinDays?: number } = {},
): readonly OfferExpiry[] {
  const withinDays = options.withinDays ?? EXPIRY_WARNING_DAYS;
  const expiring: OfferExpiry[] = [];

  for (const card of cards) {
    for (const offer of card.offers) {
      const endsAt = offer.endsAt;
      if (endsAt === null) continue;
      if (endsAt.getTime() <= asOf.getTime()) continue;
      // An offer that has not started yet cannot be used, so it is not urgent.
      if (offer.startsAt !== null && offer.startsAt.getTime() > asOf.getTime()) continue;

      const daysUntilExpiry = daysRemainingInWindow({ startsAt: null, endsAt }, asOf) ?? 0;
      if (daysUntilExpiry > withinDays) continue;

      expiring.push({
        userCardId: card.userCardId,
        cardName: card.displayName,
        offerId: offer.id,
        title: offer.title,
        merchantLabel: offer.merchantLabel,
        daysUntilExpiry,
        endsAt,
        isEnrolled: offer.isEnrolled,
        minimumSpendUsd: offer.minimumSpendUsd,
        maxBenefitUsd: offer.maxBenefitUsd,
      });
    }
  }

  return expiring.sort((left, right) => {
    if (left.daysUntilExpiry !== right.daysUntilExpiry) {
      return left.daysUntilExpiry - right.daysUntilExpiry;
    }
    return left.offerId.localeCompare(right.offerId);
  });
}

/**
 * Whether an offer is usable on a purchase of this size.
 *
 * Used by the offers screen to explain a minimum spend in terms the user can act
 * on — "spend $25 more to qualify" — rather than restating the threshold.
 */
export function shortfallForOffer(offer: EvaluableOffer, amountUsd: number): number {
  const shortfall = offer.minimumSpendUsd - amountUsd;
  return shortfall > 0 ? Math.round(shortfall * 100) / 100 : 0;
}
