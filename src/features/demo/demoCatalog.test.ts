/**
 * The demonstration wallet.
 *
 * The point of these tests is not that the data parses. It is that **the demo
 * shows engine-computed figures, not authored ones**. A demo that hard-coded
 * "you'd earn $7.20" would be the exact defect CLAUDE.md exists to prevent, and it
 * would be invisible from the outside — the screen looks the same either way.
 *
 * So every expected value below is worked out by hand from the rule records and
 * compared against what `evaluateWallet` produces. If someone were to start
 * inventing numbers in the demo layer, these would fail.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getCategoryBySlug } from '@/domain/categories';
import { evaluateWallet } from '@/domain/rewards/evaluate';
import type { PurchaseIntent } from '@/domain/rewards/types';
import { DEMO_CARDS, DEMO_MERCHANTS } from './demoCatalog';
import { demoWalletSnapshot } from './demoStore';

const AS_OF = new Date('2026-07-15T12:00:00.000Z');

function purchase(overrides: Partial<PurchaseIntent> = {}): PurchaseIntent {
  return {
    merchantId: null,
    merchantInput: 'DEMO — Greenleaf Market',
    categoryId: getCategoryBySlug('grocery').id,
    mcc: 5411,
    amountUsd: 100,
    currencyCode: 'USD',
    countryCode: 'US',
    channel: 'in_store',
    paymentMethod: 'physical_card',
    hasAmbiguousCoding: false,
    ...overrides,
  } as PurchaseIntent;
}

function evaluate(intent: PurchaseIntent) {
  const snapshot = demoWalletSnapshot();
  return evaluateWallet(intent, snapshot.cards, {
    asOf: AS_OF,
    homeCurrencyCode: 'USD',
    valuation: snapshot.valuation,
  });
}

describe('the demo wallet produces a real recommendation', () => {
  it('recommends a card for a grocery purchase', () => {
    const result = evaluate(purchase());
    expect(result.recommended).not.toBeNull();
  });

  // $100 of groceries. The grocery card's 6% rule has a $6,000 yearly cap with
  // $5,400 already used, so $600 of headroom remains — more than $100, so the whole
  // purchase earns 6%: 100 × 0.06 = $6.00.
  // The flat card would pay 100 × 0.02 = $2.00, so the grocery card wins.
  it('computes $6.00 on a $100 grocery purchase, under the cap', () => {
    const result = evaluate(purchase({ amountUsd: 100 }));

    expect(result.recommended?.card.userCardId).toBe('demo-card-grocery');
    expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(6, 2);
  });

  // $1,000 of groceries against $600 of remaining cap.
  //   $600 at 6%  = $36.00
  //   $400 at 1%  = $4.00   (the rule's postCapRate)
  //   total       = $40.00
  // The flat 2% card would pay 1000 × 0.02 = $20.00, so groceries still wins.
  it('splits spend across the cap boundary: $36.00 + $4.00 = $40.00', () => {
    const result = evaluate(purchase({ amountUsd: 1000 }));

    expect(result.recommended?.card.userCardId).toBe('demo-card-grocery');
    expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(40, 2);
  });

  // $5,000 of groceries. Only $600 fits under the cap:
  //   $600 at 6%    = $36.00
  //   $4,400 at 1%  = $44.00
  //   total         = $80.00
  // The flat card pays 5000 × 0.02 = $100.00, which is more — so the winner
  // *changes*. This is the case that proves the ranking is computed rather than
  // assumed from the card's headline rate.
  it('lets the flat 2% card win once the grocery cap is mostly spent', () => {
    const result = evaluate(purchase({ amountUsd: 5000 }));

    expect(result.recommended?.card.userCardId).toBe('demo-card-flat');
    expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(100, 2);
  });

  // $60 of fuel on the fuel card: 60 × 0.05 = $3.00, no cap consumed yet.
  it('computes $3.00 on a $60 fuel purchase', () => {
    const result = evaluate(
      purchase({
        merchantInput: 'DEMO — Copperline Fuel',
        categoryId: getCategoryBySlug('gas').id,
        mcc: 5541,
        amountUsd: 60,
      }),
    );

    expect(result.recommended?.card.userCardId).toBe('demo-card-fuel');
    expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(3, 2);
  });

  // A $40 restaurant meal paid by phone. No card has a dining bonus, but the
  // TapPay card's 3% mobile-wallet rule applies on payment method alone:
  // 40 × 0.03 = $1.20, beating the flat card's 40 × 0.02 = $0.80.
  it('uses the payment method, not just the category: $1.20 by phone at a diner', () => {
    const result = evaluate(
      purchase({
        merchantInput: 'DEMO — Foxglove Diner',
        categoryId: getCategoryBySlug('dining').id,
        mcc: 5812,
        amountUsd: 40,
        paymentMethod: 'apple_pay',
      }),
    );

    expect(result.recommended?.card.userCardId).toBe('demo-card-tappay');
    expect(result.recommended?.breakdown.netValueUsd).toBeCloseTo(1.2, 2);
  });

  it('explains itself in words, from the figures it computed', () => {
    const result = evaluate(purchase({ amountUsd: 100 }));
    // The engine refers to a card by its nickname when there is one, because that
    // is what the user calls it. Asserting the product name here was wrong.
    expect(result.explanation).toContain('Grocery card');
    expect(result.explanation.length).toBeGreaterThan(20);
  });

  it('ranks every card, so nothing is silently dropped', () => {
    const result = evaluate(purchase());
    expect(result.eligible.length + result.ineligible.length).toBe(DEMO_CARDS.length);
  });
});

describe('the demo layer invents no figures', () => {
  it('contains no dollar amount in its own source', () => {
    // The catalog may state rates and caps — those are rule records. What it must
    // never contain is a computed *result*, because that would be a number nobody
    // can check. `$` appearing only inside rule labels is the line.
    const source = readFileSync(join(__dirname, 'demoStore.ts'), 'utf8');
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    expect(withoutComments).not.toMatch(/netValueUsd\s*[:=]/);
    expect(withoutComments).not.toMatch(/rewardValueUsd\s*[:=]/);
    expect(withoutComments).not.toMatch(/effectiveRate\s*[:=]/);
  });

  it('reads no clock, so the demo is reproducible', () => {
    for (const file of ['demoCatalog.ts', 'demoStore.ts']) {
      const source = readFileSync(join(__dirname, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');

      expect(source).not.toContain('Date.now()');
      // `new Date('...')` with an explicit argument is fine; a bare one is not.
      expect(source).not.toMatch(/new Date\(\s*\)/);
    }
  });
});

describe('every card and merchant is marked as invented', () => {
  it.each(DEMO_CARDS.map((card) => [card.displayName, card.issuerName]))(
    'card %s and issuer %s both say DEMO',
    (displayName, issuerName) => {
      // The DEMO — prefix is the user-visible signal that none of this is real.
      expect(displayName).toContain('DEMO —');
      expect(issuerName).toContain('DEMO —');
    },
  );

  it.each(DEMO_MERCHANTS.map((merchant) => merchant.displayName))(
    'merchant %s says DEMO',
    (name) => {
      expect(name).toContain('DEMO —');
    },
  );
});

describe('the demo catalog matches the seeded database', () => {
  const seed = readFileSync(
    join(__dirname, '..', '..', '..', 'supabase', 'seed', '05_demo_reward_rules.sql'),
    'utf8',
  );
  const products = readFileSync(
    join(__dirname, '..', '..', '..', 'supabase', 'seed', '04_demo_card_products.sql'),
    'utf8',
  );

  it.each(DEMO_CARDS.map((card) => card.displayName))(
    '%s is a product the seed data also defines',
    (displayName) => {
      // Two copies of a catalog drift. This is what stops them: change a name here
      // without changing the SQL and the build fails.
      expect(products).toContain(displayName);
    },
  );

  it.each(
    DEMO_CARDS.flatMap((card) => card.rules.filter((entry) => entry.kind !== 'base')).map(
      (entry) => [entry.label],
    ),
  )('the rule %s is worded identically in the seed data', (label) => {
    expect(seed).toContain(label);
  });
});
