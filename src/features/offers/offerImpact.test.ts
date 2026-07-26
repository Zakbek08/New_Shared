/**
 * Phase 5 exit criterion: **offers affect recommendations.**
 *
 * An offer the user typed in has to be able to change the answer, or entering it was
 * pointless. It also has to be able to *fail* to change the answer for the right
 * reasons — not activated, minimum spend not met, wrong merchant, expired — because
 * an offer that silently applies when it should not is a figure the user will not
 * receive.
 *
 * The arithmetic, by hand, on a $60 purchase at Greenleaf Market:
 *
 *   Plain card:  1% of $60                       = $0.60
 *   Same card with a $10 statement-credit offer   = $10.60
 *   Rival card:  4% of $60                        = $2.40
 *
 * So the offer turns a losing card into the winner, by $8.20.
 */
import { evaluateWallet, type EvaluableOffer, type PurchaseIntent } from '@/domain/rewards';
import {
  AS_OF,
  CATEGORY,
  MERCHANT,
  card,
  categoryRule,
  context,
  offer,
} from '@/domain/rewards/__fixtures__/wallet';

const INTENT: PurchaseIntent = {
  merchantInput: 'Greenleaf Market',
  amountUsd: 60,
  currencyCode: 'USD',
  countryCode: 'US',
  channel: 'in_store',
  paymentMethod: 'physical_card',
  categoryId: CATEGORY.grocery,
  merchantId: MERCHANT.greenleafMarket,
  mcc: 5411,
  categoryMatchKind: 'exact_merchant',
  categoryConfidence: 'high',
  hasAmbiguousCoding: false,
};

/** A $10 statement credit at Greenleaf on a $50 minimum spend, activated. */
function greenleafOffer(overrides: Partial<EvaluableOffer> = {}): EvaluableOffer {
  return offer({
    id: 'greenleaf-10',
    title: '$10 back at Greenleaf',
    merchantId: MERCHANT.greenleafMarket,
    merchantLabel: 'Greenleaf Market',
    rewardType: 'statement_credit',
    rewardUnit: 'usd',
    rate: 0,
    fixedAmountUsd: 10,
    minimumSpendUsd: 50,
    isEnrolled: true,
    ...overrides,
  });
}

/** The card carrying the offer: only 1% on its own. */
function offerCard(offers: readonly EvaluableOffer[]) {
  return card({
    userCardId: 'plain-card',
    displayName: 'Plain Card',
    rules: [categoryRule({ id: 'plain-base', categoryId: CATEGORY.grocery, rate: 1 })],
    offers: [...offers],
  });
}

/** The rival: 4% on groceries, no offers. */
const RIVAL_CARD = card({
  userCardId: 'rival-card',
  displayName: 'Rival Card',
  rules: [categoryRule({ id: 'rival-bonus', categoryId: CATEGORY.grocery, rate: 4 })],
});

function rank(offers: readonly EvaluableOffer[]) {
  return evaluateWallet(INTENT, [offerCard(offers), RIVAL_CARD], context());
}

describe('an offer changes the recommendation', () => {
  it('the 4% card wins when there is no offer', () => {
    // $60 × 4% = $2.40 against $60 × 1% = $0.60.
    const result = rank([]);

    expect(result.recommended?.card.userCardId).toBe('rival-card');
    expect(result.recommended?.breakdown.netValueUsd).toBe(2.4);
  });

  it('the offer makes the 1% card win by $8.20', () => {
    // $0.60 of cash back plus a $10 credit is $10.60, against the rival's $2.40.
    const result = rank([greenleafOffer()]);

    expect(result.recommended?.card.userCardId).toBe('plain-card');
    expect(result.recommended?.breakdown.netValueUsd).toBe(10.6);
    expect(result.advantageOverRunnerUpUsd).toBe(8.2);
  });

  it('reports the offer separately from the card’s own earning', () => {
    // Folding a one-off credit into an "effective rate" would misrepresent it as an
    // ongoing return on every future purchase.
    const result = rank([greenleafOffer()]);
    const { breakdown } = result.recommended!;

    expect(breakdown.rewardValueUsd).toBe(0.6);
    expect(breakdown.statementCreditUsd + breakdown.offerValueUsd).toBe(10);
    expect(breakdown.appliedOfferId).toBe('greenleaf-10');
  });

  it('names the offer in the explanation', () => {
    const result = rank([greenleafOffer()]);

    expect(result.explanation).toContain('$10.60');
  });

  it('applies a percentage offer on top of the card’s own rate', () => {
    // A 5% offer on $60 is $3.00, plus the card's $0.60 = $3.60, which beats $2.40.
    const result = rank([
      greenleafOffer({
        id: 'greenleaf-5pc',
        title: '5% back at Greenleaf',
        rewardType: 'cash_back_percent',
        rate: 5,
        fixedAmountUsd: null,
      }),
    ]);

    expect(result.recommended?.card.userCardId).toBe('plain-card');
    expect(result.recommended?.breakdown.netValueUsd).toBe(3.6);
  });

  it('caps the benefit at the maximum the offer allows', () => {
    // A 50% offer on $60 would be $30, but the offer caps the benefit at $12.
    const result = rank([
      greenleafOffer({
        id: 'greenleaf-capped',
        rewardType: 'cash_back_percent',
        rate: 50,
        fixedAmountUsd: null,
        maxBenefitUsd: 12,
      }),
    ]);

    // $0.60 of card earning plus the $12 ceiling.
    expect(result.recommended?.breakdown.netValueUsd).toBe(12.6);
  });
});

describe('an offer that should not apply, does not', () => {
  const rivalWins = (offers: readonly EvaluableOffer[]) => {
    const result = rank(offers);
    expect(result.recommended?.card.userCardId).toBe('rival-card');
    expect(result.recommended?.breakdown.netValueUsd).toBe(2.4);
    return result;
  };

  it('ignores an offer the user has not activated', () => {
    // The single most expensive mistake this module could make: promising $10.60 for a
    // purchase that will actually earn $0.60.
    const result = rivalWins([greenleafOffer({ isEnrolled: false })]);

    // The plain card is still listed, on its own merits, with no offer value.
    const plain = result.eligible.find(
      (candidate) => candidate.card.userCardId === 'plain-card',
    );
    expect(plain?.breakdown.netValueUsd).toBe(0.6);
    expect(plain?.breakdown.appliedOfferId).toBeNull();
  });

  it('warns that an unactivated offer exists rather than staying silent', () => {
    // The user can still act on this: activate the offer and the answer changes.
    const result = rank([greenleafOffer({ isEnrolled: false })]);
    const plain = result.eligible.find(
      (candidate) => candidate.card.userCardId === 'plain-card',
    );

    expect(plain?.warnings).toContain('offer_requires_activation');
  });

  it('ignores an offer whose minimum spend is not met', () => {
    rivalWins([greenleafOffer({ minimumSpendUsd: 100 })]);
  });

  it('ignores an offer for a different merchant', () => {
    rivalWins([greenleafOffer({ merchantId: MERCHANT.trattoriaNove })]);
  });

  it('ignores an expired offer', () => {
    rivalWins([
      greenleafOffer({
        startsAt: new Date('2026-01-01T00:00:00.000Z'),
        endsAt: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ]);
  });

  it('ignores an offer that has not started yet', () => {
    rivalWins([
      greenleafOffer({
        startsAt: new Date('2026-08-01T00:00:00.000Z'),
        endsAt: new Date('2026-09-01T00:00:00.000Z'),
      }),
    ]);
  });

  it('ignores an online-only offer on an in-store purchase', () => {
    rivalWins([greenleafOffer({ channel: 'online' })]);
  });

  it('applies an offer whose window contains the instant', () => {
    // The mirror of the two window tests above, so a bug that ignores every offer
    // cannot pass by accident.
    const result = rank([
      greenleafOffer({
        startsAt: new Date('2026-07-01T00:00:00.000Z'),
        endsAt: new Date('2026-10-01T00:00:00.000Z'),
      }),
    ]);

    expect(result.recommended?.card.userCardId).toBe('plain-card');
  });

  it('applies exactly at the minimum spend, not just above it', () => {
    // A $60 purchase against a $60 minimum qualifies. An off-by-one here would deny
    // the user an offer they had earned.
    const result = rank([greenleafOffer({ minimumSpendUsd: 60 })]);

    expect(result.recommended?.card.userCardId).toBe('plain-card');
  });
});

describe('two offers on one card', () => {
  it('applies the more valuable one and only that one', () => {
    // Stacking two targeted offers on one purchase is not something issuers do, so
    // taking the best is right — and taking both would inflate the figure.
    const result = rank([
      greenleafOffer({ id: 'small', fixedAmountUsd: 5 }),
      greenleafOffer({ id: 'large', fixedAmountUsd: 15 }),
    ]);

    expect(result.recommended?.breakdown.appliedOfferId).toBe('large');
    expect(result.recommended?.breakdown.netValueUsd).toBe(15.6);
  });

  it('prefers an activated smaller offer over an unactivated larger one', () => {
    // $5 the user can actually claim beats $15 they cannot.
    const result = rank([
      greenleafOffer({ id: 'small-active', fixedAmountUsd: 5, isEnrolled: true }),
      greenleafOffer({ id: 'large-inactive', fixedAmountUsd: 15, isEnrolled: false }),
    ]);

    expect(result.recommended?.breakdown.appliedOfferId).toBe('small-active');
    expect(result.recommended?.breakdown.netValueUsd).toBe(5.6);
  });
});

describe('determinism', () => {
  it('gives the same answer for the same offers and instant', () => {
    const offers = [greenleafOffer()];

    expect(
      evaluateWallet(INTENT, [offerCard(offers), RIVAL_CARD], context({ asOf: AS_OF })),
    ).toEqual(
      evaluateWallet(INTENT, [offerCard(offers), RIVAL_CARD], context({ asOf: AS_OF })),
    );
  });
});
