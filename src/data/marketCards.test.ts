/**
 * The card catalog, and the arithmetic it produces.
 *
 * Two jobs here, and the first is the one that would cost a user money.
 *
 * **The rates must be percentages.** `money.percentOf` divides by 100, so `6` means 6%
 * and `0.06` would mean six hundredths of a percent. A whole catalog written in fractions
 * would still parse, still render, still rank cards in a plausible order, and quietly
 * report $0.006 on a $100 grocery shop. Every expected value below is therefore worked
 * out by hand from the published rate and compared against what the engine returns.
 *
 * **The catalog must not drift into fiction.** These are real products. A source URL that
 * does not point at the issuer, or a rate with no date on it, is the beginning of the
 * exact defect this project is built to avoid.
 */
import { evaluateWallet } from '@/domain/rewards';
import { getCategoryBySlug } from '@/domain/categories';
import type { PurchaseIntent, RewardValuation } from '@/domain/rewards/types';

import {
  MARKET_CARDS,
  MARKET_ISSUERS,
  findMarketCard,
  searchMarketCards,
  toEvaluableCard,
} from './marketCards';

/** Pinned, so nothing here depends on when the suite runs. */
const AS_OF = new Date('2026-06-01T12:00:00.000Z');

/** One cent per point, matching `recommend.ts`. */
const VALUATION: RewardValuation = {
  byProgramId: {},
  byUnit: { usd: 1, points: 1, miles: 1 },
  prefersCashBackOnly: false,
  minimumSwitchBenefitUsd: 0,
};

function purchase(overrides: Partial<PurchaseIntent> = {}): PurchaseIntent {
  return {
    merchantInput: 'a shop',
    amountUsd: 100,
    currencyCode: 'USD',
    countryCode: 'US',
    channel: 'in_store',
    paymentMethod: 'physical_card',
    categoryId: getCategoryBySlug('grocery').id,
    merchantId: null,
    mcc: null,
    categoryMatchKind: 'user_selected',
    categoryConfidence: 'high',
    hasAmbiguousCoding: false,
    ...overrides,
  };
}

/** Evaluates a purchase against named cards, with rotating bonuses switched on. */
function evaluate(
  cardIds: readonly string[],
  intent: PurchaseIntent,
  options: { readonly activated?: boolean } = {},
) {
  const cards = cardIds.map((id) => {
    const card = findMarketCard(id);
    if (card === null) throw new Error(`test names a card not in the catalog: ${id}`);
    const evaluable = toEvaluableCard(card);
    if (options.activated !== true) return evaluable;

    const enrollments: Record<string, boolean> = {};
    for (const rule of evaluable.rules) {
      if (rule.requiresEnrollment) enrollments[rule.id] = true;
    }
    return { ...evaluable, enrollments };
  });

  return evaluateWallet(intent, cards, {
    asOf: AS_OF,
    homeCurrencyCode: 'USD',
    valuation: VALUATION,
  });
}

describe('the rates are percentages, not fractions', () => {
  // $100 of groceries on the Blue Cash Preferred: 6% of 100 = $6.00.
  // Written in fractions this would return $0.006 and every other test would pass.
  it('Blue Cash Preferred earns $6.00 on a $100 grocery shop', () => {
    const result = evaluate(['amex-blue-cash-preferred'], purchase({ amountUsd: 100 }));

    expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(6, 2);
  });

  // 2% of $100 = $2.00.
  it('Citi Double Cash earns $2.00 on any $100 purchase', () => {
    const result = evaluate(
      ['citi-double-cash'],
      purchase({ amountUsd: 100, categoryId: getCategoryBySlug('other').id }),
    );

    expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(2, 2);
  });

  // 1.5% of $200 = $3.00.
  it('Freedom Unlimited earns $3.00 on a $200 purchase with no bonus category', () => {
    const result = evaluate(
      ['chase-freedom-unlimited'],
      purchase({ amountUsd: 200, categoryId: getCategoryBySlug('utilities').id }),
    );

    expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(3, 2);
  });
});

describe('the winner is computed, not read off the headline rate', () => {
  // 6% beats 2% on groceries: $6.00 against $2.00.
  it('prefers the 6% grocery card over a flat 2% card on groceries', () => {
    const result = evaluate(
      ['citi-double-cash', 'amex-blue-cash-preferred'],
      purchase({ amountUsd: 100 }),
    );

    expect(result.recommended?.card.cardProductId).toBe('amex-blue-cash-preferred');
    expect(result.runnerUp?.card.cardProductId).toBe('citi-double-cash');
    // $6.00 − $2.00 = $4.00.
    expect(result.advantageOverRunnerUpUsd).toBeCloseTo(4, 2);
  });

  // The same two cards, on a category neither bonuses: 2% beats 1%, so the ranking
  // flips. This is the case that proves the engine is comparing rather than trusting
  // whichever card looked best last time.
  it('prefers the flat 2% card once the category bonus does not apply', () => {
    const result = evaluate(
      ['citi-double-cash', 'amex-blue-cash-preferred'],
      purchase({ amountUsd: 100, categoryId: getCategoryBySlug('utilities').id }),
    );

    expect(result.recommended?.card.cardProductId).toBe('citi-double-cash');
    expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(2, 2);
  });

  // A single purchase larger than the whole yearly cap, so the split is visible:
  //   $6,000 at 6% = $360.00
  //   $4,000 at 1% = $40.00   (the rule's post-cap rate)
  //   total        = $400.00
  // The flat 2% card would pay 10,000 × 0.02 = $200.00, so the capped card still wins.
  it('splits a $10,000 grocery purchase across the cap: $360 + $40 = $400', () => {
    const result = evaluate(
      ['citi-double-cash', 'amex-blue-cash-preferred'],
      purchase({ amountUsd: 10_000 }),
    );

    expect(result.recommended?.card.cardProductId).toBe('amex-blue-cash-preferred');
    expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(400, 2);
    expect(result.recommended?.breakdown.withinCapSpendUsd).toBeCloseTo(6000, 2);
    expect(result.recommended?.breakdown.overCapSpendUsd).toBeCloseTo(4000, 2);
  });
});

describe('points cards are valued, not counted', () => {
  // Amex Gold at 4x on a $100 restaurant bill: 400 points, at 1¢ each = $4.00.
  it('Amex Gold earns $4.00 of value on a $100 restaurant bill', () => {
    const result = evaluate(
      ['amex-gold'],
      purchase({ amountUsd: 100, categoryId: getCategoryBySlug('dining').id }),
    );

    expect(result.recommended?.breakdown.grossRewardUnits).toBeCloseTo(400, 2);
    expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(4, 2);
  });

  // 4x at 1¢ is worth $4.00; a flat 2% card is worth $2.00. The points card wins on
  // this purchase even at the pessimistic valuation, which is the point of using one.
  it('a 4x points card beats a flat 2% card on dining at 1 cent per point', () => {
    const result = evaluate(
      ['citi-double-cash', 'amex-gold'],
      purchase({ amountUsd: 100, categoryId: getCategoryBySlug('dining').id }),
    );

    expect(result.recommended?.card.cardProductId).toBe('amex-gold');
  });

  // The engine deliberately does NOT raise `estimated_point_valuation` here, and that
  // is correct: `isExplicitValuation` treats a populated `byUnit.points` as explicit,
  // and the warning exists for the case where no valuation exists at all.
  //
  // But the app, not the user, chose 1¢ — so the "this is an assumption" statement is
  // the UI's responsibility, and the result screen makes it in words. What the engine
  // owes us is the figure it actually applied, so that statement can be specific rather
  // than vague. That is what this asserts.
  it('records the cents-per-point it applied, so the screen can name it', () => {
    const result = evaluate(
      ['amex-gold'],
      purchase({ categoryId: getCategoryBySlug('dining').id }),
    );

    expect(result.recommended?.breakdown.appliedCentsPerUnit).toBe(1);
    expect(result.recommended?.breakdown.rewardUnit).toBe('points');
  });

  // A cash-back card has no valuation to apply, and reporting one would imply a
  // conversion that did not happen.
  it('applies no cents-per-unit to a cash-back card', () => {
    const result = evaluate(['citi-double-cash'], purchase());

    expect(result.recommended?.breakdown.appliedCentsPerUnit).toBeNull();
    expect(result.recommended?.breakdown.rewardUnit).toBe('usd');
  });
});

describe('a bonus that needs activation is not counted until it is activated', () => {
  const otherPurchase = purchase({
    amountUsd: 100,
    categoryId: getCategoryBySlug('other').id,
  });

  // Not activated: Discover falls back to its 1% base, so the flat 2% card wins.
  // Recommending an unactivated 5% bonus is the expensive mistake here — the user
  // would pay with the wrong card and earn a fifth of what they expected.
  it('falls back to the base rate while the rotating bonus is off', () => {
    const result = evaluate(['citi-double-cash', 'discover-it-cash-back'], otherPurchase);

    expect(result.recommended?.card.cardProductId).toBe('citi-double-cash');
    expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(2, 2);
  });

  // Activated: 5% of $100 = $5.00, which beats $2.00.
  it('uses the 5% bonus once the user confirms it is activated', () => {
    const result = evaluate(['citi-double-cash', 'discover-it-cash-back'], otherPurchase, {
      activated: true,
    });

    expect(result.recommended?.card.cardProductId).toBe('discover-it-cash-back');
    expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(5, 2);
  });
});

describe('how you pay changes the answer', () => {
  // The Apple Card is the clearest case in the catalog: 2% with Apple Pay, 1% with the
  // physical card, same purchase. If the engine ignored the payment method both would
  // come back the same and the card would be mispriced half the time.
  const groceries = { amountUsd: 100, categoryId: getCategoryBySlug('grocery').id };

  it('Apple Card earns $2.00 on $100 paid with Apple Pay', () => {
    const result = evaluate(
      ['apple-card'],
      purchase({ ...groceries, paymentMethod: 'apple_pay' }),
    );

    expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(2, 2);
  });

  it('Apple Card earns $1.00 on the same $100 tapped with the card itself', () => {
    const result = evaluate(
      ['apple-card'],
      purchase({ ...groceries, paymentMethod: 'physical_card' }),
    );

    expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(1, 2);
  });

  // Consequence worth pinning: which card to reach for depends on how you are paying.
  it('picks the Apple Card over a flat 1.5% card only when paying by phone', () => {
    const byPhone = evaluate(
      ['boa-unlimited-cash', 'apple-card'],
      purchase({ ...groceries, paymentMethod: 'apple_pay' }),
    );
    const byCard = evaluate(
      ['boa-unlimited-cash', 'apple-card'],
      purchase({ ...groceries, paymentMethod: 'physical_card' }),
    );

    // 2% ($2.00) beats 1.5% ($1.50) by phone; 1% ($1.00) loses to it by card.
    expect(byPhone.recommended?.card.cardProductId).toBe('apple-card');
    expect(byCard.recommended?.card.cardProductId).toBe('boa-unlimited-cash');
  });
});

describe('the cards added on 29 July 2026', () => {
  // 4% of $60 of petrol = $2.40, under the $7,000 yearly cap.
  it('Costco Anywhere Visa earns $2.40 on $60 of petrol', () => {
    const result = evaluate(
      ['citi-costco-anywhere'],
      purchase({ amountUsd: 60, categoryId: getCategoryBySlug('gas').id }),
    );

    expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(2.4, 2);
  });

  // 2% of $100 = $2.00, flat, whatever the category.
  it.each([
    ['td-double-up', 2],
    ['fidelity-rewards', 2],
    ['boa-unlimited-cash', 1.5],
  ])('%s pays its flat rate on a $100 purchase', (cardId, rate) => {
    const result = evaluate(
      [cardId],
      purchase({ amountUsd: 100, categoryId: getCategoryBySlug('utilities').id }),
    );

    expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(rate, 2);
  });

  // TD lets the cardholder pick which categories earn 3% and 2%, and change them every
  // quarter. The app cannot know the current choice, so both rates wait for confirmation
  // — the same treatment a rotating bonus gets, for the same reason.
  describe('TD Cash waits for the cardholder to confirm their categories', () => {
    const dining = purchase({
      amountUsd: 100,
      categoryId: getCategoryBySlug('dining').id,
    });

    it('pays only its 1% base rate until confirmed', () => {
      const result = evaluate(['td-cash'], dining);

      expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(1, 2);
    });

    it('pays 3% once confirmed', () => {
      const result = evaluate(['td-cash'], dining, { activated: true });

      expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(3, 2);
    });
  });

  it.each([
    'apple-card',
    'td-cash',
    'td-double-up',
    'citi-costco-anywhere',
    'fidelity-rewards',
    'boa-unlimited-cash',
  ])('%s is in the catalog and findable by search', (cardId) => {
    const card = findMarketCard(cardId);

    expect(card).not.toBeNull();
    // Every one of these was re-read on the day it was added, not inherited from the
    // batch before it.
    expect(card?.ratesAsOf).toBe('2026-07-29');
    expect(searchMarketCards(card?.productName ?? '').map((match) => match.id)).toContain(
      cardId,
    );
  });
});

describe('the catalog is real, dated and checkable', () => {
  it('has cards from several issuers', () => {
    expect(MARKET_CARDS.length).toBeGreaterThan(15);
    expect(MARKET_ISSUERS.length).toBeGreaterThan(5);
  });

  it('gives every card a unique id', () => {
    const ids = MARKET_CARDS.map((card) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(MARKET_CARDS.map((card) => [card.id, card.sourceUrl]))(
    '%s links a source over https',
    (_id, sourceUrl) => {
      expect(sourceUrl).toMatch(/^https:\/\//);
    },
  );

  // An affiliate or aggregator link would make the catalog a marketing surface, and
  // a recommendation that pays the recommender is worth nothing to the user.
  it.each(MARKET_CARDS.map((card) => [card.id, card.sourceUrl]))(
    '%s cites the issuer directly, with no referral parameters',
    (_id, sourceUrl) => {
      expect(sourceUrl).not.toMatch(/[?&](ref|referral|affiliate|utm_|aff)/i);
    },
  );

  // A rate with no date is a claim about today that nobody has checked.
  it.each(MARKET_CARDS.map((card) => [card.id, card.ratesAsOf]))(
    '%s records the day its rates were read',
    (_id, ratesAsOf) => {
      expect(ratesAsOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(ratesAsOf).getTime())).toBe(false);
    },
  );

  it('gives every card a base rate, so no purchase is left unmatched', () => {
    for (const card of MARKET_CARDS) {
      expect(card.baseRate).toBeGreaterThan(0);
      expect(card.baseLabel.length).toBeGreaterThan(0);
    }
  });

  // Every rate on a real card is a headline percentage or multiplier. A value below 1
  // would almost certainly be a fraction typed where a percentage belongs.
  it('states every rate as a percentage or multiplier, never a fraction', () => {
    for (const card of MARKET_CARDS) {
      for (const bonus of card.bonuses) {
        expect(bonus.rate).toBeGreaterThanOrEqual(1);
      }
      expect(card.baseRate).toBeGreaterThanOrEqual(1);
    }
  });

  it('pairs every cap with the period it resets on', () => {
    // A cap with no period would be meaningless, and the database CHECK constraint
    // that mirrors this rule would reject it.
    for (const card of MARKET_CARDS) {
      for (const bonus of card.bonuses) {
        if (bonus.capUsd !== undefined) expect(bonus.capPeriod).toBeDefined();
        if (bonus.capPeriod !== undefined) expect(bonus.capUsd).toBeDefined();
      }
    }
  });

  it('pairs every reward type with the unit it pays in', () => {
    const expected = {
      cash_back_percent: 'usd',
      points_per_dollar: 'points',
      miles_per_dollar: 'miles',
    } as const;

    for (const card of MARKET_CARDS) {
      for (const rule of toEvaluableCard(card).rules) {
        expect(rule.rewardUnit).toBe(expected[rule.rewardType as keyof typeof expected]);
      }
    }
  });

  it('has no fictional or demonstration cards left in it', () => {
    // The catalog used to be invented. Nothing should still say so.
    for (const card of MARKET_CARDS) {
      expect(card.productName).not.toMatch(/DEMO|fictional|example/i);
      expect(card.issuerName).not.toMatch(/DEMO|fictional|example/i);
    }
  });
});

describe('search', () => {
  it('returns everything for an empty query', () => {
    expect(searchMarketCards('   ')).toHaveLength(MARKET_CARDS.length);
  });

  it('finds a card by its issuer', () => {
    const results = searchMarketCards('chase');
    expect(results.length).toBeGreaterThan(2);
    expect(results.every((card) => card.issuerName === 'Chase')).toBe(true);
  });

  it('narrows rather than widens as terms are added', () => {
    const broad = searchMarketCards('chase');
    const narrow = searchMarketCards('chase sapphire');

    expect(narrow.length).toBeLessThan(broad.length);
    expect(narrow.every((card) => card.productName.includes('Sapphire'))).toBe(true);
  });

  it('finds a card by a nickname nobody prints on it', () => {
    // "CSP" appears nowhere in the product name, but it is what people call it.
    expect(searchMarketCards('csp').map((card) => card.id)).toContain(
      'chase-sapphire-preferred',
    );
    expect(searchMarketCards('bcp').map((card) => card.id)).toContain(
      'amex-blue-cash-preferred',
    );
  });

  it('is case-insensitive', () => {
    expect(searchMarketCards('AMEX GOLD').map((card) => card.id)).toContain('amex-gold');
  });

  it('returns nothing rather than guessing for an unknown card', () => {
    // The honest answer for a card not in the catalog. Offering the closest match
    // would put someone else's rates in front of the user.
    expect(searchMarketCards('zzz not a real card')).toHaveLength(0);
  });
});

describe('findMarketCard', () => {
  it('finds a card that exists', () => {
    expect(findMarketCard('citi-double-cash')?.productName).toBe('Double Cash Card');
  });

  it('returns null for one that does not', () => {
    expect(findMarketCard('no-such-card')).toBeNull();
  });
});
