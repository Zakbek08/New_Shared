/**
 * Rotating-category periods and expiring offers.
 *
 * Both of these are "you lose money by doing nothing" cases, so the tests care
 * most about the edges of the windows: a quarter that ends today, an offer that
 * ended an hour ago, one that has not started yet.
 */
import {
  activeRotatingCategories,
  expiringOffers,
  pendingActivations,
  shortfallForOffer,
  EXPIRY_WARNING_DAYS,
} from './reminders';
import { AS_OF, CATEGORY, card, categoryRule, offer, rule } from './__fixtures__/wallet';

/** Q3 2026, the quarter containing AS_OF (2026-07-26). */
const Q3_START = new Date('2026-07-01T00:00:00.000Z');
const Q3_END = new Date('2026-10-01T00:00:00.000Z');

function rotatingRule(
  overrides: {
    readonly id?: string;
    readonly categoryIds?: readonly string[];
    readonly startsAt?: Date | null;
    readonly endsAt?: Date | null;
    readonly requiresEnrollment?: boolean;
    readonly rate?: number;
    readonly capAmount?: number | null;
  } = {},
) {
  const base = categoryRule({
    id: overrides.id ?? 'q3',
    categoryId: overrides.categoryIds?.[0] ?? CATEGORY.grocery,
    rate: overrides.rate ?? 5,
    capAmount: overrides.capAmount === undefined ? 1500 : overrides.capAmount,
    capPeriod: 'quarterly',
  });

  return {
    ...base,
    kind: 'rotating_category' as const,
    label: 'Q3 2026: 5% cash back on grocery and gas',
    startsAt: overrides.startsAt === undefined ? Q3_START : overrides.startsAt,
    endsAt: overrides.endsAt === undefined ? Q3_END : overrides.endsAt,
    requiresEnrollment: overrides.requiresEnrollment ?? true,
    conditions:
      overrides.categoryIds === undefined
        ? base.conditions
        : base.conditions.map((condition) => ({
            ...condition,
            categoryIds: overrides.categoryIds ?? [],
          })),
  };
}

describe('activeRotatingCategories', () => {
  it('reports the quarter that contains the instant', () => {
    const rotator = card({
      userCardId: 'rotator',
      displayName: 'Rotator Card',
      rules: [rotatingRule()],
    });

    const [period] = activeRotatingCategories([rotator], AS_OF);

    expect(period).toMatchObject({
      userCardId: 'rotator',
      cardName: 'Rotator Card',
      ruleId: 'q3',
      requiresActivation: true,
      isActivated: false,
      capAmountUsd: 1500,
      rate: 5,
    });
    // 2026-07-26T14:30Z to 2026-10-01T00:00Z is 66 days and 9.5 hours → 67.
    expect(period?.daysUntilPeriodEnds).toBe(67);
  });

  it('lists every category the period covers, deduplicated', () => {
    const rotator = card({
      rules: [
        rotatingRule({ categoryIds: [CATEGORY.grocery, CATEGORY.gas, CATEGORY.grocery] }),
      ],
    });

    expect(activeRotatingCategories([rotator], AS_OF)[0]?.categoryIds).toEqual([
      CATEGORY.grocery,
      CATEGORY.gas,
    ]);
  });

  it('reports activation when the user has enrolled', () => {
    const rotator = card({ rules: [rotatingRule()], enrollments: { q3: true } });

    expect(activeRotatingCategories([rotator], AS_OF)[0]?.isActivated).toBe(true);
  });

  it('omits a quarter that has ended', () => {
    const q2 = card({
      rules: [
        rotatingRule({
          id: 'q2',
          startsAt: new Date('2026-04-01T00:00:00.000Z'),
          endsAt: Q3_START,
        }),
      ],
    });

    // The end bound is exclusive, so a quarter ending 2026-07-01 is over by
    // 2026-07-26. Showing it would tell the user to activate something dead.
    expect(activeRotatingCategories([q2], AS_OF)).toEqual([]);
  });

  it('omits a quarter that has not started, which cannot be acted on yet', () => {
    const q4 = card({
      rules: [
        rotatingRule({
          id: 'q4',
          startsAt: Q3_END,
          endsAt: new Date('2027-01-01T00:00:00.000Z'),
        }),
      ],
    });

    expect(activeRotatingCategories([q4], AS_OF)).toEqual([]);
  });

  it('omits a non-rotating rule, however good its rate', () => {
    const flat = card({ rules: [categoryRule({ categoryId: CATEGORY.grocery, rate: 6 })] });

    expect(activeRotatingCategories([flat], AS_OF)).toEqual([]);
  });

  it('omits an inactive rotating rule', () => {
    const retired = card({ rules: [{ ...rotatingRule(), isActive: false }] });

    expect(activeRotatingCategories([retired], AS_OF)).toEqual([]);
  });

  it('orders the period ending soonest first', () => {
    const soon = card({
      userCardId: 'soon',
      rules: [rotatingRule({ id: 'soon', endsAt: new Date('2026-08-01T00:00:00.000Z') })],
    });
    const later = card({ userCardId: 'later', rules: [rotatingRule({ id: 'later' })] });

    expect(
      activeRotatingCategories([later, soon], AS_OF).map((period) => period.ruleId),
    ).toEqual(['soon', 'later']);
  });

  it('handles a rotating rule with no end date', () => {
    const openEnded = card({ rules: [rotatingRule({ endsAt: null })] });

    expect(activeRotatingCategories([openEnded], AS_OF)[0]?.daysUntilPeriodEnds).toBeNull();
  });
});

describe('pendingActivations', () => {
  it('returns a live, unactivated bonus', () => {
    const rotator = card({ rules: [rotatingRule()] });

    expect(pendingActivations([rotator], AS_OF).map((period) => period.ruleId)).toEqual(['q3']);
  });

  it('returns nothing once the bonus is activated', () => {
    const rotator = card({ rules: [rotatingRule()], enrollments: { q3: true } });

    expect(pendingActivations([rotator], AS_OF)).toEqual([]);
  });

  it('returns nothing for a rotating bonus that needs no activation', () => {
    const rotator = card({ rules: [rotatingRule({ requiresEnrollment: false })] });

    expect(pendingActivations([rotator], AS_OF)).toEqual([]);
  });

  it('reminds from the first day of the quarter, not only near the deadline', () => {
    // An unactivated bonus is worth acting on immediately; waiting until the final
    // fortnight would cost the user most of the quarter.
    const rotator = card({ rules: [rotatingRule()] });

    expect(pendingActivations([rotator], Q3_START)).toHaveLength(1);
  });
});

describe('expiringOffers', () => {
  const offerCard = (...offers: ReturnType<typeof offer>[]) =>
    card({ userCardId: 'card-1', displayName: 'Offer Card', offers });

  it('reports an offer ending inside the warning window', () => {
    const soon = offer({
      id: 'soon',
      title: '$10 back at Greenleaf',
      merchantLabel: 'Greenleaf Market',
      endsAt: new Date('2026-08-01T00:00:00.000Z'),
      minimumSpendUsd: 50,
      maxBenefitUsd: 10,
    });

    const [expiry] = expiringOffers([offerCard(soon)], AS_OF);

    expect(expiry).toMatchObject({
      offerId: 'soon',
      title: '$10 back at Greenleaf',
      merchantLabel: 'Greenleaf Market',
      cardName: 'Offer Card',
      minimumSpendUsd: 50,
      maxBenefitUsd: 10,
    });
    // 2026-07-26T14:30Z to 2026-08-01T00:00Z is 5 days 9.5 hours → 6.
    expect(expiry?.daysUntilExpiry).toBe(6);
  });

  it('excludes an offer ending beyond the window', () => {
    const distant = offer({ endsAt: new Date('2026-12-01T00:00:00.000Z') });

    expect(expiringOffers([offerCard(distant)], AS_OF)).toEqual([]);
  });

  it('includes an offer exactly at the window edge', () => {
    // Fourteen days out, to the hour.
    const edge = offer({
      id: 'edge',
      endsAt: new Date(AS_OF.getTime() + EXPIRY_WARNING_DAYS * 86_400_000),
    });

    expect(expiringOffers([offerCard(edge)], AS_OF)).toHaveLength(1);
  });

  it('excludes an offer that has already ended', () => {
    // Nothing left to act on, and listing it would push a live offer down the page.
    const gone = offer({ endsAt: new Date(AS_OF.getTime() - 3_600_000) });

    expect(expiringOffers([offerCard(gone)], AS_OF)).toEqual([]);
  });

  it('excludes an offer that has not started', () => {
    const future = offer({
      startsAt: new Date('2026-08-01T00:00:00.000Z'),
      endsAt: new Date('2026-08-05T00:00:00.000Z'),
    });

    expect(expiringOffers([offerCard(future)], AS_OF)).toEqual([]);
  });

  it('excludes an offer with no end date, which is not expiring', () => {
    expect(expiringOffers([offerCard(offer({ endsAt: null }))], AS_OF)).toEqual([]);
  });

  it('reports whether the offer still needs activating', () => {
    const notEnrolled = offer({
      id: 'inactive',
      endsAt: new Date('2026-08-01T00:00:00.000Z'),
      isEnrolled: false,
    });

    expect(expiringOffers([offerCard(notEnrolled)], AS_OF)[0]?.isEnrolled).toBe(false);
  });

  it('orders the soonest expiry first, breaking ties on offer id', () => {
    const first = offer({ id: 'bbb', endsAt: new Date('2026-07-28T00:00:00.000Z') });
    const alsoFirst = offer({ id: 'aaa', endsAt: new Date('2026-07-28T00:00:00.000Z') });
    const later = offer({ id: 'later', endsAt: new Date('2026-08-05T00:00:00.000Z') });

    expect(
      expiringOffers([offerCard(later, first, alsoFirst)], AS_OF).map((entry) => entry.offerId),
    ).toEqual(['aaa', 'bbb', 'later']);
  });

  it('honours a caller-supplied window', () => {
    const twoWeeksOut = offer({ endsAt: new Date('2026-08-05T00:00:00.000Z') });

    expect(expiringOffers([offerCard(twoWeeksOut)], AS_OF, { withinDays: 3 })).toEqual([]);
    expect(expiringOffers([offerCard(twoWeeksOut)], AS_OF, { withinDays: 30 })).toHaveLength(1);
  });

  it('rounds a nearly-gone offer up to one day rather than down to zero', () => {
    const today = offer({ id: 'today', endsAt: new Date(AS_OF.getTime() + 60_000) });

    // One minute left rounds up to "1 day". Rounding down to 0 would read as
    // "expired" for an offer the user can still use.
    expect(expiringOffers([offerCard(today)], AS_OF)[0]?.daysUntilExpiry).toBe(1);
  });

  it('gathers offers across several cards', () => {
    const one = card({
      userCardId: 'a',
      offers: [offer({ id: 'a1', endsAt: new Date('2026-07-30T00:00:00.000Z') })],
    });
    const two = card({
      userCardId: 'b',
      offers: [offer({ id: 'b1', endsAt: new Date('2026-07-28T00:00:00.000Z') })],
    });

    expect(expiringOffers([one, two], AS_OF).map((entry) => entry.offerId)).toEqual([
      'b1',
      'a1',
    ]);
  });
});

describe('shortfallForOffer', () => {
  it('reports how much more must be spent to qualify', () => {
    // A $75 minimum against a $50 purchase leaves $25 to go.
    expect(shortfallForOffer(offer({ minimumSpendUsd: 75 }), 50)).toBe(25);
  });

  it('reports zero once the minimum is met exactly', () => {
    expect(shortfallForOffer(offer({ minimumSpendUsd: 75 }), 75)).toBe(0);
  });

  it('never reports a negative shortfall', () => {
    expect(shortfallForOffer(offer({ minimumSpendUsd: 75 }), 200)).toBe(0);
  });

  it('rounds to cents rather than emitting a floating-point tail', () => {
    // 100.1 - 20.2 is 79.89999999999999 in IEEE-754.
    expect(shortfallForOffer(offer({ minimumSpendUsd: 100.1 }), 20.2)).toBe(79.9);
  });

  it('reports no shortfall for an offer with no minimum', () => {
    expect(shortfallForOffer(offer({ minimumSpendUsd: 0 }), 0)).toBe(0);
  });
});

describe('the fixtures used above are the shapes the engine consumes', () => {
  it('a rotating rule is still a valid EvaluableRule', () => {
    // Guards against the fixture drifting from `EvaluableRule` and these tests
    // passing against a shape the engine would reject.
    const rotating = rotatingRule();
    const plain = rule();

    expect(Object.keys(rotating).sort()).toEqual(Object.keys(plain).sort());
  });
});
