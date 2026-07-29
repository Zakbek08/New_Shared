/**
 * The one path the whole app runs on: stored wallet in, recommendation out.
 *
 * `marketCards.test.ts` pins the arithmetic against the engine directly. This pins the
 * *wiring* — that the wallet is translated faithfully, that activation gating survives
 * the trip, and that a purchase the user described becomes the intent the engine sees.
 *
 * Every expected figure is still worked out by hand, because a wiring bug that halves a
 * reward looks exactly like a correct answer from the outside.
 */
import { getCategoryBySlug } from '@/domain/categories';

import { CENTS_PER_POINT, recommend, walletToCards } from './recommend';
import type { PurchaseInput } from './recommend';
import type { Wallet } from './storage';

/** Pinned. The engine takes `asOf` precisely so a test never mocks a clock. */
const AS_OF = new Date('2026-06-01T12:00:00.000Z');

function wallet(cardIds: readonly string[], activated: Record<string, boolean> = {}): Wallet {
  return { cardIds, activated };
}

function input(overrides: Partial<PurchaseInput> = {}): PurchaseInput {
  return {
    merchant: 'the corner shop',
    amountUsd: 100,
    categoryId: getCategoryBySlug('grocery').id,
    channel: 'in_store',
    paymentMethod: 'physical_card',
    ...overrides,
  };
}

describe('walletToCards', () => {
  it('translates each stored id into a card the engine can price', () => {
    const cards = walletToCards(wallet(['citi-double-cash', 'amex-gold']));

    expect(cards.map((card) => card.cardProductId)).toEqual(['citi-double-cash', 'amex-gold']);
    expect(cards.every((card) => card.rules.length > 0)).toBe(true);
  });

  it('drops an id with no product behind it rather than producing an unpriceable card', () => {
    expect(walletToCards(wallet(['citi-double-cash', 'not-a-card']))).toHaveLength(1);
  });

  it('leaves an unactivated card with no enrollments', () => {
    const [card] = walletToCards(wallet(['discover-it-cash-back']));

    expect(card?.enrollments).toEqual({});
  });

  // The safe direction. Marking rules enrolled that the user has not switched on would
  // recommend a 5% bonus paying 1%.
  it('enrolls only the rules that need it, and only when the user says so', () => {
    const [card] = walletToCards(
      wallet(['discover-it-cash-back'], { 'discover-it-cash-back': true }),
    );

    const needing = (card?.rules ?? []).filter((rule) => rule.requiresEnrollment);
    const notNeeding = (card?.rules ?? []).filter((rule) => !rule.requiresEnrollment);

    expect(needing.length).toBeGreaterThan(0);
    for (const rule of needing) {
      expect(card?.enrollments[rule.id]).toBe(true);
    }
    // The base rule needs no activation and must not be marked as enrolled — that
    // would be a claim about the user we have no basis for.
    for (const rule of notNeeding) {
      expect(card?.enrollments[rule.id]).toBeUndefined();
    }
  });

  it('treats a missing activation flag as not activated', () => {
    // `undefined` and `false` must behave identically. Anything else would make the
    // gate depend on whether a key had ever been written.
    const [card] = walletToCards(wallet(['discover-it-cash-back'], {}));

    expect(card?.enrollments).toEqual({});
  });
});

describe('recommend', () => {
  // 6% of $100 = $6.00 on the Blue Cash Preferred, against $2.00 on the flat 2% card.
  it('picks the 6% grocery card for a $100 grocery shop, earning $6.00', () => {
    const { result } = recommend(
      wallet(['citi-double-cash', 'amex-blue-cash-preferred']),
      input({ amountUsd: 100 }),
      AS_OF,
    );

    expect(result.recommended?.card.cardProductId).toBe('amex-blue-cash-preferred');
    expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(6, 2);
    expect(result.advantageOverRunnerUpUsd).toBeCloseTo(4, 2);
  });

  it('reports every card, so none is silently dropped from the comparison', () => {
    const ids = ['citi-double-cash', 'amex-blue-cash-preferred', 'amex-gold'];
    const { result } = recommend(wallet(ids), input(), AS_OF);

    expect(result.eligible.length + result.ineligible.length).toBe(ids.length);
  });

  it('has nothing to recommend from an empty wallet, and says so rather than guessing', () => {
    const { result } = recommend(wallet([]), input(), AS_OF);

    expect(result.recommended).toBeNull();
    expect(result.eligible).toHaveLength(0);
  });

  it('carries the purchase through to the intent the engine evaluated', () => {
    const { result } = recommend(
      wallet(['citi-double-cash']),
      input({ merchant: 'Corner Market', amountUsd: 42.5, channel: 'online' }),
      AS_OF,
    );

    expect(result.intent.merchantInput).toBe('Corner Market');
    expect(result.intent.amountUsd).toBe(42.5);
    expect(result.intent.channel).toBe('online');
  });

  it('records the category the user chose, at high confidence', () => {
    const groceryId = getCategoryBySlug('grocery').id;
    const { result, classification } = recommend(
      wallet(['citi-double-cash']),
      input({ categoryId: groceryId }),
      AS_OF,
    );

    // With no merchant catalog, the user's own choice is the best evidence available —
    // and it is honestly labelled as their choice rather than as a lookup.
    expect(classification.matchKind).toBe('user_selected');
    expect(result.intent.categoryId).toBe(groceryId);
    expect(result.intent.categoryConfidence).toBe('high');
  });

  // The payment method is not decoration. It is the whole difference between tapping a
  // phone and tapping the card, and some cards pay differently for each.
  it('passes the payment method through', () => {
    const { result } = recommend(
      wallet(['citi-double-cash']),
      input({ paymentMethod: 'apple_pay' }),
      AS_OF,
    );

    expect(result.intent.paymentMethod).toBe('apple_pay');
  });

  it('is reproducible: the same wallet and purchase give the same answer', () => {
    const held = wallet(['citi-double-cash', 'amex-blue-cash-preferred', 'amex-gold']);
    const purchase = input({ amountUsd: 137.42 });

    const first = recommend(held, purchase, AS_OF);
    const second = recommend(held, purchase, AS_OF);

    expect(second.result.recommended?.card.cardProductId).toBe(
      first.result.recommended?.card.cardProductId,
    );
    expect(second.result.recommended?.breakdown.netValueUsd).toBe(
      first.result.recommended?.breakdown.netValueUsd,
    );
    expect(second.result.explanation).toBe(first.result.explanation);
  });

  it('explains itself in words built from the figures it computed', () => {
    const { result } = recommend(
      wallet(['citi-double-cash', 'amex-blue-cash-preferred']),
      input({ amountUsd: 100 }),
      AS_OF,
    );

    expect(result.explanation.length).toBeGreaterThan(20);
    // The card it names must be the card it chose.
    expect(result.explanation).toContain('Blue Cash Preferred');
  });

  // The activation gate, end to end through the stored wallet rather than through a
  // hand-built card. $100 in an unbonused category: Discover pays 1% = $1.00 while
  // switched off, so the flat 2% card ($2.00) wins; switched on it pays 5% = $5.00.
  describe('activation changes the answer', () => {
    const otherPurchase = input({
      amountUsd: 100,
      categoryId: getCategoryBySlug('other').id,
    });
    const ids = ['citi-double-cash', 'discover-it-cash-back'];

    it('prefers the flat card while the rotating bonus is switched off', () => {
      const { result } = recommend(wallet(ids), otherPurchase, AS_OF);

      expect(result.recommended?.card.cardProductId).toBe('citi-double-cash');
      expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(2, 2);
    });

    it('prefers the 5% card once the user confirms it is activated', () => {
      const { result } = recommend(
        wallet(ids, { 'discover-it-cash-back': true }),
        otherPurchase,
        AS_OF,
      );

      expect(result.recommended?.card.cardProductId).toBe('discover-it-cash-back');
      expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(5, 2);
    });
  });

  it('values points at the stated floor, and nowhere else', () => {
    // 4x on $100 of dining = 400 points. At CENTS_PER_POINT that is $4.00.
    const { result } = recommend(
      wallet(['amex-gold']),
      input({ amountUsd: 100, categoryId: getCategoryBySlug('dining').id }),
      AS_OF,
    );

    expect(CENTS_PER_POINT).toBe(1);
    expect(result.recommended?.breakdown.grossRewardUnits).toBeCloseTo(400, 2);
    expect(result.recommended?.breakdown.appliedCentsPerUnit).toBe(CENTS_PER_POINT);
    expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(4, 2);
  });

  it('gives a rejected card a reason a person can read', () => {
    const { result } = recommend(
      wallet(['citi-double-cash', 'discover-it-cash-back']),
      input({ amountUsd: 100, categoryId: getCategoryBySlug('other').id }),
      AS_OF,
    );

    // Nothing is rejected outright here — both cards can be used — so the assertion is
    // that every candidate, winner or not, carries an explanation.
    for (const candidate of [...result.eligible, ...result.ineligible]) {
      expect(candidate.reason.length).toBeGreaterThan(0);
    }
  });

  it('reads no clock of its own', () => {
    // Two different instants, same answer: nothing in the path depends on now. A
    // recommendation that changed between two taps could not be reproduced or audited.
    const held = wallet(['citi-double-cash', 'amex-blue-cash-preferred']);
    const purchase = input();

    const early = recommend(held, purchase, new Date('2026-01-15T00:00:00.000Z'));
    const late = recommend(held, purchase, new Date('2026-11-20T00:00:00.000Z'));

    expect(late.result.recommended?.breakdown.netValueUsd).toBe(
      early.result.recommended?.breakdown.netValueUsd,
    );
  });
});
