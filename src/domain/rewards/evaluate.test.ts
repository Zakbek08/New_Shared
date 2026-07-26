/**
 * The Phase 3 engine matrix from TESTING.md.
 *
 * Every reward figure below is hand-checked and the arithmetic is written into the
 * test name or a comment, so a reviewer can verify it on paper. Time is pinned via
 * `asOf`; there is no clock mocking anywhere in this file.
 */
import { evaluateWallet } from './evaluate';
import {
  APPLE_PAY,
  AS_OF,
  CATEGORY,
  MERCHANT,
  PROGRAM,
  baseRule,
  capUsage,
  card,
  categoryRule,
  condition,
  context,
  flatCard,
  intent,
  offer,
  rule,
  valuation,
} from './__fixtures__/wallet';

const evaluate = (
  cards: Parameters<typeof evaluateWallet>[1],
  overrides: Partial<Parameters<typeof evaluateWallet>[0]> = {},
  ctx: Partial<Parameters<typeof evaluateWallet>[2]> = {},
) => evaluateWallet(intent(overrides), cards, context(ctx));

const netOf = (result: ReturnType<typeof evaluateWallet>, userCardId: string): number => {
  const found = [...result.eligible, ...result.ineligible].find(
    (candidate) => candidate.card.userCardId === userCardId,
  );
  if (found === undefined) throw new Error(`No candidate for ${userCardId}`);
  return found.breakdown.netValueUsd;
};

const codeOf = (result: ReturnType<typeof evaluateWallet>, userCardId: string) =>
  result.ineligible.find((candidate) => candidate.card.userCardId === userCardId)
    ?.ineligibilityCode;

// ===========================================================================
// The specification's own worked example
// ===========================================================================

describe('the specification example', () => {
  // $120 of groceries. 6% grocery card vs a 5% rotating card vs 2% flat.
  const grocery6 = card({
    userCardId: 'grocery-6',
    displayName: 'Northwind Everyday Grocery Card',
    rules: [
      baseRule(1),
      categoryRule({
        id: 'grocery-bonus',
        categoryId: CATEGORY.grocery,
        rate: 6,
        capAmount: 6000,
        capPeriod: 'calendar_year',
        postCapRate: 1,
      }),
    ],
  });

  const grocery5 = card({
    userCardId: 'grocery-5',
    displayName: 'Harborline Quarterly Rotator Card',
    rules: [
      baseRule(1, { id: 'rot-base' }),
      categoryRule({ id: 'rot-bonus', categoryId: CATEGORY.grocery, rate: 5 }),
    ],
  });

  const wallet = [grocery6, grocery5, flatCard(2)];

  it('recommends the 6% card at $7.20 with the runner-up at $6.00', () => {
    // 120 × 6% = 7.20; runner-up 120 × 5% = 6.00; advantage 1.20.
    const result = evaluate(wallet);

    expect(result.recommended?.card.userCardId).toBe('grocery-6');
    expect(result.recommended?.breakdown.netValueUsd).toBe(7.2);
    expect(result.runnerUp?.card.userCardId).toBe('grocery-5');
    expect(result.runnerUp?.breakdown.netValueUsd).toBe(6);
    expect(result.advantageOverRunnerUpUsd).toBe(1.2);
  });

  it('ranks every eligible card by value', () => {
    const result = evaluate(wallet);
    expect(result.eligible.map((c) => c.breakdown.netValueUsd)).toEqual([7.2, 6, 2.4]);
  });

  it('reports the applied rule and the effective rate', () => {
    const result = evaluate(wallet);
    expect(result.recommended?.breakdown.effectiveRate).toBe(6);
    expect(result.recommended?.breakdown.appliedRuleId).toBe('grocery-bonus');
    expect(result.recommended?.breakdown.rewardType).toBe('cash_back_percent');
  });

  it('explains itself with the figures it computed', () => {
    const result = evaluate(wallet);
    expect(result.explanation).toContain('Northwind Everyday Grocery Card');
    expect(result.explanation).toContain('$7.20');
    expect(result.explanation).toContain('$1.20 more');
  });

  it('stamps the engine version and the asOf instant', () => {
    const result = evaluate(wallet);
    expect(result.engineVersion).toBe('0.1.0');
    expect(result.computedAt).toBe(AS_OF);
  });

  it('is reproducible: the same inputs give the same answer', () => {
    const a = evaluate(wallet);
    const b = evaluate(wallet);
    expect(b.recommended?.breakdown).toEqual(a.recommended?.breakdown);
    expect(b.explanation).toBe(a.explanation);
  });

  it('does not depend on the order cards arrive in', () => {
    const forwards = evaluate(wallet);
    const backwards = evaluate([...wallet].reverse());
    expect(backwards.recommended?.card.userCardId).toBe(forwards.recommended?.card.userCardId);
    expect(backwards.eligible.map((c) => c.card.userCardId)).toEqual(
      forwards.eligible.map((c) => c.card.userCardId),
    );
  });
});

// ===========================================================================
// 1. Percentage cash back
// ===========================================================================

describe('percentage cash back', () => {
  it('6% on $120 is $7.20', () => {
    expect(netOf(evaluate([flatCard(6)]), 'flat-6')).toBe(7.2);
  });

  it('2% flat on $120 is $2.40', () => {
    expect(netOf(evaluate([flatCard(2)]), 'flat-2')).toBe(2.4);
  });

  it('a 0% rate earns nothing and is not recommendable', () => {
    const result = evaluate([flatCard(0)]);
    expect(result.recommended).toBeNull();
    expect(codeOf(result, 'flat-0')).toBe('zero_value_reward');
  });

  it('rounds 1.5% of $43.17 to $0.65 — 0.64755 half away from zero', () => {
    expect(netOf(evaluate([flatCard(1.5)], { amountUsd: 43.17 }), 'flat-1.5')).toBe(0.65);
  });
});

// ===========================================================================
// 2. Points and miles
// ===========================================================================

describe('points and miles', () => {
  const points4x = card({
    userCardId: 'points-4x',
    rules: [
      rule({
        id: 'dining-4x',
        label: '4x points at restaurants',
        rewardUnit: 'points',
        baseRate: 4,
        rewardProgramId: PROGRAM.cobaltPoints,
        conditions: [condition({ categoryIds: [CATEGORY.dining] })],
      }),
    ],
  });

  it('4x on $120 is 480 points', () => {
    const result = evaluate([points4x], { categoryId: CATEGORY.dining });
    expect(result.recommended?.breakdown.grossRewardUnits).toBe(480);
    expect(result.recommended?.breakdown.rewardUnit).toBe('points');
  });

  it('1x base on $120 is 120 points', () => {
    const oneX = card({
      userCardId: 'points-1x',
      rules: [baseRule(1, { rewardUnit: 'points', rewardProgramId: PROGRAM.cobaltPoints })],
    });
    expect(evaluate([oneX]).recommended?.breakdown.grossRewardUnits).toBe(120);
  });

  it('keeps a fractional multiplier unrounded: 1.5x on $43.17 is 64.755 points', () => {
    const onePointFive = card({
      userCardId: 'points-1.5x',
      rules: [baseRule(1.5, { rewardUnit: 'points' })],
    });
    expect(
      evaluate([onePointFive], { amountUsd: 43.17 }).recommended?.breakdown.grossRewardUnits,
    ).toBe(64.755);
  });

  it('lets a high multiple on a low-value currency beat a low multiple on a high one', () => {
    // 10x at 0.6¢ = 6% effective; 3x at 1.3¢ = 3.9% effective.
    const hotel10x = card({
      userCardId: 'hotel-10x',
      displayName: 'Harborline Stay Rewards',
      rules: [
        baseRule(10, {
          id: 'stay-10x',
          rewardUnit: 'points',
          rewardProgramId: PROGRAM.harborlineStayPoints,
        }),
      ],
    });
    const airline3x = card({
      userCardId: 'airline-3x',
      displayName: 'Summit Sky Alliance',
      rules: [
        baseRule(3, {
          id: 'sky-3x',
          rewardUnit: 'miles',
          rewardProgramId: PROGRAM.summitSkyMiles,
        }),
      ],
    });

    const result = evaluate(
      [hotel10x, airline3x],
      { amountUsd: 200 },
      {
        valuation: valuation({
          byProgramId: {
            [PROGRAM.harborlineStayPoints]: 0.6,
            [PROGRAM.summitSkyMiles]: 1.3,
          },
        }),
      },
    );

    // 200 × 10 = 2000 points × 0.6¢ = $12.00
    // 200 × 3  =  600 miles  × 1.3¢ =  $7.80
    expect(netOf(result, 'hotel-10x')).toBe(12);
    expect(netOf(result, 'airline-3x')).toBe(7.8);
    expect(result.recommended?.card.userCardId).toBe('hotel-10x');
  });
});

// ===========================================================================
// 3. User-defined point valuation
// ===========================================================================

describe('user-defined point valuation', () => {
  const points4x = card({
    userCardId: 'points',
    rules: [baseRule(4, { rewardUnit: 'points', rewardProgramId: PROGRAM.cobaltPoints })],
  });

  it('values 480 points at 1.25¢ as $6.00', () => {
    const result = evaluate(
      [points4x],
      {},
      {
        valuation: valuation({ byProgramId: { [PROGRAM.cobaltPoints]: 1.25 } }),
      },
    );
    expect(result.recommended?.breakdown.netValueUsd).toBe(6);
    expect(result.recommended?.breakdown.appliedCentsPerUnit).toBe(1.25);
  });

  it('changes the answer when the user changes the valuation', () => {
    // The whole reason valuations are per-user.
    const atOne = evaluate(
      [points4x],
      {},
      {
        valuation: valuation({ byProgramId: { [PROGRAM.cobaltPoints]: 1 } }),
      },
    );
    const atTwo = evaluate(
      [points4x],
      {},
      {
        valuation: valuation({ byProgramId: { [PROGRAM.cobaltPoints]: 2 } }),
      },
    );

    expect(atOne.recommended?.breakdown.netValueUsd).toBe(4.8);
    expect(atTwo.recommended?.breakdown.netValueUsd).toBe(9.6);
  });

  it('can reverse a ranking', () => {
    const cash3 = flatCard(3);
    const wallet = [points4x, cash3];

    // At 0.5¢ the points card earns $2.40 and loses to 3% cash back at $3.60.
    const lowValuation = evaluate(
      wallet,
      {},
      {
        valuation: valuation({ byProgramId: { [PROGRAM.cobaltPoints]: 0.5 } }),
      },
    );
    expect(lowValuation.recommended?.card.userCardId).toBe('flat-3');

    // At 2¢ it earns $9.60 and wins.
    const highValuation = evaluate(
      wallet,
      {},
      {
        valuation: valuation({ byProgramId: { [PROGRAM.cobaltPoints]: 2 } }),
      },
    );
    expect(highValuation.recommended?.card.userCardId).toBe('points');
  });

  it('honours a valuation of zero instead of substituting a default', () => {
    const result = evaluate(
      [points4x, flatCard(1)],
      {},
      {
        valuation: valuation({
          byProgramId: { [PROGRAM.cobaltPoints]: 0 },
          byUnit: { usd: 1, points: 1.5, miles: 1.5 },
        }),
      },
    );

    // The program valuation of 0 must win over the per-unit default of 1.5.
    expect(netOf(result, 'points')).toBe(0);
    expect(result.recommended?.card.userCardId).toBe('flat-1');
  });

  it('falls back to the per-unit default when the program has no valuation', () => {
    const result = evaluate(
      [points4x],
      {},
      {
        valuation: valuation({ byProgramId: {}, byUnit: { usd: 1, points: 1.1, miles: 1 } }),
      },
    );
    // 480 points × 1.1¢ = $5.28
    expect(result.recommended?.breakdown.netValueUsd).toBe(5.28);
  });

  it('marks a fallback valuation as an estimate', () => {
    const explicit = evaluate(
      [points4x],
      {},
      {
        valuation: valuation({ byProgramId: { [PROGRAM.cobaltPoints]: 1.25 } }),
      },
    );
    expect(explicit.recommended?.warnings).not.toContain('estimated_point_valuation');

    const fallback = evaluate(
      [points4x],
      {},
      {
        valuation: valuation({
          byProgramId: {},
          byUnit: {} as never,
        }),
      },
    );
    expect(fallback.ineligible.length + fallback.eligible.length).toBe(1);
  });

  it('ignores non-cash rewards entirely for a cash-back-only user', () => {
    const result = evaluate(
      [points4x, flatCard(1)],
      {},
      {
        valuation: valuation({ prefersCashBackOnly: true }),
      },
    );

    expect(codeOf(result, 'points')).toBe('non_cash_reward_declined');
    expect(result.recommended?.card.userCardId).toBe('flat-1');
  });
});

// ===========================================================================
// 4. Spending caps
// ===========================================================================

describe('spending caps', () => {
  const capped = (consumed: number, postCapRate: number | null = 1) =>
    card({
      userCardId: 'capped',
      rules: [
        baseRule(1),
        categoryRule({
          id: 'grocery-bonus',
          categoryId: CATEGORY.grocery,
          rate: 6,
          capAmount: 6000,
          capPeriod: 'calendar_year',
          postCapRate,
        }),
      ],
      capUsage: { 'grocery-bonus': capUsage({ qualifyingSpendUsd: consumed }) },
    });

  it('pays the full bonus when the purchase fits well under the cap', () => {
    const result = evaluate([capped(1000)]);
    expect(result.recommended?.breakdown.netValueUsd).toBe(7.2);
    expect(result.recommended?.breakdown.overCapSpendUsd).toBe(0);
    expect(result.recommended?.capRemainingUsd).toBe(5000);
  });

  it('pays the full bonus when the purchase exactly fills the remaining cap', () => {
    // $5,880 used leaves $120, exactly this purchase.
    const result = evaluate([capped(5880)]);
    expect(result.recommended?.breakdown.netValueUsd).toBe(7.2);
    expect(result.recommended?.breakdown.overCapSpendUsd).toBe(0);
  });

  it('splits a purchase that partially exceeds the cap', () => {
    // $5,920 used leaves $80. 80 × 6% = 4.80, plus 40 × 1% = 0.40 → $5.20.
    const result = evaluate([capped(5920)], { amountUsd: 120 });

    expect(result.recommended?.breakdown.withinCapSpendUsd).toBe(80);
    expect(result.recommended?.breakdown.overCapSpendUsd).toBe(40);
    expect(result.recommended?.breakdown.netValueUsd).toBe(5.2);
    expect(result.recommended?.warnings).toContain('cap_partially_available');
  });

  it('falls back to the post-cap rate once exhausted', () => {
    // Cap gone; the whole $120 earns 1% = $1.20.
    const result = evaluate([capped(6000)]);
    expect(result.recommended?.breakdown.netValueUsd).toBe(1.2);
  });

  it('falls through to the base rule when there is no post-cap rate', () => {
    // The bonus yields nothing, so the card's own 1% base rule wins its group on
    // merit. No special-case fall-through logic is involved.
    const result = evaluate([capped(6000, null)]);
    expect(result.recommended?.breakdown.netValueUsd).toBe(1.2);
    expect(result.recommended?.breakdown.appliedRuleId).toBe('rule-base');
  });

  it('reports cap_exhausted when the capped rule is the only one', () => {
    const onlyCapped = card({
      userCardId: 'only-capped',
      rules: [
        categoryRule({
          id: 'grocery-bonus',
          categoryId: CATEGORY.grocery,
          rate: 6,
          capAmount: 6000,
          capPeriod: 'calendar_year',
          postCapRate: null,
        }),
      ],
      capUsage: { 'grocery-bonus': capUsage({ qualifyingSpendUsd: 6000 }) },
    });

    const result = evaluate([onlyCapped]);
    expect(codeOf(result, 'only-capped')).toBe('cap_exhausted');
  });

  it('limits the reward, not the spend, for a reward-denominated cap', () => {
    const rewardCapped = card({
      userCardId: 'reward-capped',
      rules: [
        baseRule(6, {
          id: 'reward-cap-rule',
          capAmount: 5,
          capAppliesTo: 'reward',
          capPeriod: 'monthly',
        }),
      ],
      capUsage: {
        'reward-cap-rule': capUsage({
          periodStart: new Date('2026-07-01T00:00:00.000Z'),
          periodEnd: new Date('2026-08-01T00:00:00.000Z'),
          accruedRewardUsd: 2,
        }),
      },
    });

    // 120 × 6% = $7.20, but only $3 of the $5 reward cap remains.
    const result = evaluate([rewardCapped]);
    expect(result.recommended?.breakdown.netValueUsd).toBe(3);
  });

  it('resets a quarterly cap in a new quarter', () => {
    const quarterly = card({
      userCardId: 'quarterly',
      rules: [
        baseRule(1),
        categoryRule({
          id: 'gas-bonus',
          categoryId: CATEGORY.gas,
          rate: 5,
          capAmount: 2000,
          capPeriod: 'quarterly',
          postCapRate: 1,
        }),
      ],
      capUsage: {
        'gas-bonus': capUsage({
          // Q2, fully used. AS_OF is in Q3.
          periodStart: new Date('2026-04-01T00:00:00.000Z'),
          periodEnd: new Date('2026-07-01T00:00:00.000Z'),
          qualifyingSpendUsd: 2000,
        }),
      },
    });

    // 120 × 5% = $6.00 — the previous quarter's usage does not count.
    const result = evaluate([quarterly], { categoryId: CATEGORY.gas });
    expect(result.recommended?.breakdown.netValueUsd).toBe(6);
  });
});

// ===========================================================================
// 5. Expired and future rules
// ===========================================================================

describe('expired and future rules', () => {
  const withWindow = (startsAt: Date | null, endsAt: Date | null) =>
    card({
      userCardId: 'windowed',
      rules: [
        rule({
          id: 'seasonal',
          baseRate: 5,
          startsAt,
          endsAt,
          conditions: [condition({ categoryIds: [CATEGORY.grocery] })],
        }),
      ],
    });

  it('rejects a rule whose window has ended', () => {
    const result = evaluate([withWindow(null, new Date('2026-07-01T00:00:00.000Z'))]);
    expect(codeOf(result, 'windowed')).toBe('rule_expired');
  });

  it('rejects a rule whose window has not started', () => {
    const result = evaluate([withWindow(new Date('2026-10-01T00:00:00.000Z'), null)]);
    expect(codeOf(result, 'windowed')).toBe('rule_not_yet_active');
  });

  it('accepts a rule at exactly its start instant', () => {
    const result = evaluateWallet(
      intent(),
      [withWindow(AS_OF, null)],
      context({ asOf: AS_OF }),
    );
    expect(result.recommended?.breakdown.netValueUsd).toBe(6);
  });

  it('rejects a rule at exactly its end instant', () => {
    const result = evaluateWallet(
      intent(),
      [withWindow(null, AS_OF)],
      context({ asOf: AS_OF }),
    );
    expect(codeOf(result, 'windowed')).toBe('rule_expired');
  });

  it('skips an inactive rule entirely', () => {
    const inactive = card({
      userCardId: 'inactive',
      rules: [rule({ id: 'off', baseRate: 10, isActive: false })],
    });
    expect(codeOf(evaluate([inactive]), 'inactive')).toBe('no_active_rules');
  });
});

// ===========================================================================
// 6. Enrollment
// ===========================================================================

describe('enrollment', () => {
  const rotating = (enrolled: boolean | undefined) =>
    card({
      userCardId: 'rotating',
      rules: [baseRule(1), categoryRule({ id: 'q3', categoryId: CATEGORY.grocery, rate: 5 })],
      enrollments: enrolled === undefined ? {} : { q3: enrolled },
    });

  it('pays the bonus when the quarter is activated', () => {
    const enrolledCard = card({
      userCardId: 'rotating',
      rules: [
        baseRule(1),
        rule({
          id: 'q3',
          baseRate: 5,
          requiresEnrollment: true,
          conditions: [condition({ categoryIds: [CATEGORY.grocery] })],
        }),
      ],
      enrollments: { q3: true },
    });
    expect(evaluate([enrolledCard]).recommended?.breakdown.netValueUsd).toBe(6);
  });

  it('falls back to the base rate when the quarter is not activated', () => {
    const notEnrolled = card({
      userCardId: 'rotating',
      rules: [
        baseRule(1),
        rule({
          id: 'q3',
          baseRate: 5,
          requiresEnrollment: true,
          conditions: [condition({ categoryIds: [CATEGORY.grocery] })],
        }),
      ],
      enrollments: {},
    });

    const result = evaluate([notEnrolled]);
    expect(result.recommended?.breakdown.netValueUsd).toBe(1.2);
    // Surfaced, not silently dropped — an un-activated 5% quarter is worth saying.
    expect(result.recommended?.warnings).toContain('enrollment_required');
  });

  it('reports not_enrolled when the activation-required rule is the only one', () => {
    const onlyRotating = card({
      userCardId: 'only-rotating',
      rules: [
        rule({
          id: 'q3',
          baseRate: 5,
          requiresEnrollment: true,
          conditions: [condition({ categoryIds: [CATEGORY.grocery] })],
        }),
      ],
      enrollments: {},
    });
    expect(codeOf(evaluate([onlyRotating]), 'only-rotating')).toBe('not_enrolled');
  });

  it('treats an explicit false the same as an absent enrollment', () => {
    expect(evaluate([rotating(false)]).recommended?.breakdown.netValueUsd).toBe(
      evaluate([rotating(undefined)]).recommended?.breakdown.netValueUsd,
    );
  });
});

// ===========================================================================
// 7. Merchant exclusions
// ===========================================================================

describe('merchant exclusions', () => {
  const groceryWithExclusion = card({
    userCardId: 'grocery',
    rules: [
      baseRule(1),
      categoryRule({
        id: 'grocery-bonus',
        categoryId: CATEGORY.grocery,
        rate: 6,
        excludedMerchantIds: [MERCHANT.bulkbarnWarehouse],
      }),
    ],
  });

  it('pays the bonus at an ordinary supermarket', () => {
    expect(evaluate([groceryWithExclusion]).recommended?.breakdown.netValueUsd).toBe(7.2);
  });

  it('drops to the base rate at an excluded warehouse club', () => {
    const result = evaluate([groceryWithExclusion], {
      merchantId: MERCHANT.bulkbarnWarehouse,
      merchantInput: 'BulkBarn Warehouse',
    });
    expect(result.recommended?.breakdown.netValueUsd).toBe(1.2);
  });

  it('changes which card wins — the BulkBarn case from the docs', () => {
    const mobileWallet = card({
      userCardId: 'tappay',
      displayName: 'Northwind TapPay Card',
      rules: [
        baseRule(1, { id: 'tap-base' }),
        rule({
          id: 'tap-bonus',
          baseRate: 3,
          conditions: [
            condition({ includedPaymentMethods: ['apple_pay', 'google_pay', 'samsung_pay'] }),
          ],
        }),
      ],
    });

    const wallet = [groceryWithExclusion, mobileWallet];

    // At an ordinary supermarket the 6% grocery card wins at $7.20.
    const ordinary = evaluate(wallet, { paymentMethod: APPLE_PAY });
    expect(ordinary.recommended?.card.userCardId).toBe('grocery');

    // At BulkBarn the grocery bonus is excluded, so TapPay's 3% wins at $3.60.
    const warehouse = evaluate(wallet, {
      paymentMethod: APPLE_PAY,
      merchantId: MERCHANT.bulkbarnWarehouse,
      hasAmbiguousCoding: true,
    });
    expect(warehouse.recommended?.card.userCardId).toBe('tappay');
    expect(warehouse.recommended?.breakdown.netValueUsd).toBe(3.6);
    expect(warehouse.warnings).toContain('merchant_coding_uncertain');
  });

  it('reports merchant_excluded when the excluded rule is the only one', () => {
    const onlyBonus = card({
      userCardId: 'only-bonus',
      rules: [
        categoryRule({
          id: 'grocery-bonus',
          categoryId: CATEGORY.grocery,
          rate: 6,
          excludedMerchantIds: [MERCHANT.bulkbarnWarehouse],
        }),
      ],
    });

    expect(
      codeOf(evaluate([onlyBonus], { merchantId: MERCHANT.bulkbarnWarehouse }), 'only-bonus'),
    ).toBe('merchant_excluded');
  });

  it('pays a merchant-specific bonus only at that merchant', () => {
    const coBrand = card({
      userCardId: 'cobrand',
      rules: [
        baseRule(1),
        rule({
          id: 'airline-3x',
          baseRate: 3,
          conditions: [condition({ includedMerchantIds: [MERCHANT.summitSkyAirways] })],
        }),
      ],
    });

    const atAirline = evaluate([coBrand], {
      merchantId: MERCHANT.summitSkyAirways,
      categoryId: CATEGORY.airfare,
    });
    expect(atAirline.recommended?.breakdown.netValueUsd).toBe(3.6);

    const elsewhere = evaluate([coBrand]);
    expect(elsewhere.recommended?.breakdown.netValueUsd).toBe(1.2);
  });
});

// ===========================================================================
// 8. Foreign transaction fees
// ===========================================================================

describe('foreign transaction fees', () => {
  const feeCard = flatCard(2, {
    userCardId: 'fee-card',
    displayName: 'Fee Card',
    foreignTransactionFeePercent: 3,
    supportedCountryCodes: ['US', 'FR'],
  });

  it('charges no fee on a home-currency purchase', () => {
    const result = evaluate([feeCard]);
    expect(result.recommended?.breakdown.foreignTransactionFeeUsd).toBe(0);
    expect(result.recommended?.breakdown.netValueUsd).toBe(2.4);
  });

  it('subtracts the fee on a foreign-currency purchase', () => {
    // 120 × 2% = 2.40 reward, less 120 × 3% = 3.60 fee → clamped to 0.
    const result = evaluate([feeCard], { currencyCode: 'EUR', countryCode: 'FR' });
    expect(result.recommended?.breakdown.foreignTransactionFeeUsd).toBe(3.6);
    expect(result.recommended?.breakdown.netValueUsd).toBe(0);
    expect(result.recommended?.warnings).toContain('foreign_transaction_fee_applied');
  });

  it('lets a no-fee card win abroad despite a lower rate', () => {
    // 3x miles at 1¢ on $100 = $3.00 gross, less 3% = $0.00 net.
    // 2% no-fee = $2.00 net and wins.
    const highEarner = card({
      userCardId: 'high-earner',
      displayName: 'High Earner',
      foreignTransactionFeePercent: 3,
      supportedCountryCodes: ['US', 'FR'],
      rules: [baseRule(3, { id: 'he-base', rewardUnit: 'miles' })],
    });
    const noFee = flatCard(2, {
      userCardId: 'no-fee',
      displayName: 'No Fee Card',
      supportedCountryCodes: ['US', 'FR'],
    });

    const result = evaluate([highEarner, noFee], {
      amountUsd: 100,
      currencyCode: 'EUR',
      countryCode: 'FR',
    });

    expect(netOf(result, 'high-earner')).toBe(0);
    expect(netOf(result, 'no-fee')).toBe(2);
    expect(result.recommended?.card.userCardId).toBe('no-fee');
  });

  it('keeps a fee-wiped card eligible rather than hiding it', () => {
    // It can still be used; it just earns nothing net.
    const result = evaluate([feeCard], { currencyCode: 'EUR', countryCode: 'FR' });
    expect(result.eligible.map((c) => c.card.userCardId)).toContain('fee-card');
  });

  it('reports country_not_supported rather than merely charging a fee', () => {
    const usOnly = flatCard(2, { userCardId: 'us-only', supportedCountryCodes: ['US'] });
    expect(
      codeOf(evaluate([usOnly], { countryCode: 'FR', currencyCode: 'EUR' }), 'us-only'),
    ).toBe('country_not_supported');
  });

  it('treats an empty supported-country list as no restriction', () => {
    const anywhere = flatCard(2, { userCardId: 'anywhere', supportedCountryCodes: [] });
    expect(evaluate([anywhere], { countryCode: 'JP' }).recommended?.card.userCardId).toBe(
      'anywhere',
    );
  });
});

// ===========================================================================
// 9. Merchant offers
// ===========================================================================

describe('merchant offers', () => {
  const withOffer = (overrides: Parameters<typeof offer>[0]) =>
    flatCard(2, {
      userCardId: 'offer-card',
      offers: [offer({ merchantId: MERCHANT.greenleafMarket, ...overrides })],
    });

  it('stacks a percentage offer on top of the rule reward', () => {
    // 120 × 2% = 2.40 rule, plus 120 × 10% = 12.00 offer → $14.40.
    const result = evaluate([withOffer({ rate: 10 })]);
    expect(result.recommended?.breakdown.offerValueUsd).toBe(12);
    expect(result.recommended?.breakdown.netValueUsd).toBe(14.4);
  });

  it('applies a fixed statement-credit offer', () => {
    const result = evaluate([
      withOffer({ rewardType: 'statement_credit', rate: 0, fixedAmountUsd: 20 }),
    ]);
    expect(result.recommended?.breakdown.offerValueUsd).toBe(20);
    expect(result.recommended?.breakdown.netValueUsd).toBe(22.4);
  });

  it('does not apply when the minimum spend is not met', () => {
    const result = evaluate([withOffer({ rate: 10, minimumSpendUsd: 200 })]);
    expect(result.recommended?.breakdown.offerValueUsd).toBe(0);
    expect(result.recommended?.breakdown.netValueUsd).toBe(2.4);
  });

  it('caps the benefit at maxBenefitUsd', () => {
    // 10% of 120 is 12.00, capped at 5.00.
    const result = evaluate([withOffer({ rate: 10, maxBenefitUsd: 5 })]);
    expect(result.recommended?.breakdown.offerValueUsd).toBe(5);
  });

  it('does not apply outside its window', () => {
    const result = evaluate([
      withOffer({ rate: 10, endsAt: new Date('2026-07-01T00:00:00.000Z') }),
    ]);
    expect(result.recommended?.breakdown.offerValueUsd).toBe(0);
  });

  it('does not apply at a different merchant', () => {
    const result = evaluate([withOffer({ rate: 10 })], {
      merchantId: MERCHANT.trattoriaNove,
    });
    expect(result.recommended?.breakdown.offerValueUsd).toBe(0);
  });

  it('does not apply on the wrong channel', () => {
    const result = evaluate([withOffer({ rate: 10, channel: 'online' })], {
      channel: 'in_store',
    });
    expect(result.recommended?.breakdown.offerValueUsd).toBe(0);
  });

  it('warns when the offer still needs activating', () => {
    const result = evaluate([withOffer({ rate: 10, isEnrolled: false })]);
    expect(result.recommended?.breakdown.offerValueUsd).toBe(12);
    expect(result.recommended?.warnings).toContain('offer_requires_activation');
  });

  it('applies only the best offer, not both', () => {
    // Real issuers do not stack two targeted offers on one transaction.
    const twoOffers = flatCard(2, {
      userCardId: 'offer-card',
      offers: [
        offer({ id: 'small', merchantId: MERCHANT.greenleafMarket, rate: 5 }),
        offer({ id: 'big', merchantId: MERCHANT.greenleafMarket, rate: 10 }),
      ],
    });

    const result = evaluate([twoOffers]);
    expect(result.recommended?.breakdown.offerValueUsd).toBe(12);
    expect(result.recommended?.breakdown.appliedOfferId).toBe('big');
  });

  it('matches a free-text merchant label case-insensitively', () => {
    const labelled = flatCard(2, {
      userCardId: 'offer-card',
      offers: [offer({ merchantLabel: 'greenleaf market', rate: 10 })],
    });
    expect(evaluate([labelled]).recommended?.breakdown.offerValueUsd).toBe(12);
  });

  it('can make an otherwise-losing card win', () => {
    const result = evaluate([withOffer({ rate: 10 }), flatCard(6)]);
    // 2% + 10% offer = $14.40 beats a plain 6% at $7.20.
    expect(result.recommended?.card.userCardId).toBe('offer-card');
  });
});

// ===========================================================================
// 10. Tie breaking
// ===========================================================================

describe('tie breaking', () => {
  it('prefers the user’s preferred card at equal value', () => {
    const plain = flatCard(2, { userCardId: 'plain', displayName: 'A Plain Card' });
    const preferred = flatCard(2, {
      userCardId: 'preferred',
      displayName: 'Z Preferred Card',
      isPreferred: true,
    });

    const result = evaluate([plain, preferred]);
    expect(result.recommended?.card.userCardId).toBe('preferred');
    expect(result.warnings).toContain('tie_broken_by_preference');
  });

  it('prefers higher confidence at equal value and no preference', () => {
    const verified = flatCard(2, { userCardId: 'verified', displayName: 'A Card' });
    const unverified = flatCard(2, {
      userCardId: 'unverified',
      displayName: 'B Card',
      rules: [baseRule(2, { id: 'unv', verificationStatus: 'unverified' })],
    });

    const result = evaluate([unverified, verified]);
    expect(result.recommended?.card.userCardId).toBe('verified');
  });

  it('prefers cash back over points at equal value and confidence', () => {
    // 2% cash = $2.40; 2x points at 1.2¢ = $2.88. Make them equal instead:
    // 2% cash = $2.40 and 2x points at 1¢ = $2.40.
    const cash = flatCard(2, { userCardId: 'cash', displayName: 'B Cash Card' });
    const points = card({
      userCardId: 'points',
      displayName: 'A Points Card',
      rules: [baseRule(2, { id: 'pts', rewardUnit: 'points' })],
    });

    const result = evaluate(
      [points, cash],
      {},
      {
        valuation: valuation({ byUnit: { usd: 1, points: 1, miles: 1 } }),
      },
    );

    expect(netOf(result, 'cash')).toBe(2.4);
    expect(netOf(result, 'points')).toBe(2.4);
    expect(result.recommended?.card.userCardId).toBe('cash');
  });

  it('falls back to alphabetical order, so the result is stable not arbitrary', () => {
    const zebra = flatCard(2, { userCardId: 'zebra', displayName: 'Zebra Card' });
    const apple = flatCard(2, { userCardId: 'apple', displayName: 'Apple Card' });

    expect(evaluate([zebra, apple]).recommended?.card.userCardId).toBe('apple');
    expect(evaluate([apple, zebra]).recommended?.card.userCardId).toBe('apple');
  });

  it('keeps the preferred card when the gain is below the switch threshold', () => {
    const preferred = flatCard(2, {
      userCardId: 'preferred',
      displayName: 'Preferred',
      isPreferred: true,
    });
    // 2.05% earns $2.46 versus $2.40 — a six-cent gain.
    const marginal = flatCard(2.05, { userCardId: 'marginal', displayName: 'Marginal' });

    const result = evaluate(
      [preferred, marginal],
      {},
      {
        valuation: valuation({ minimumSwitchBenefitUsd: 0.5 }),
      },
    );

    expect(result.recommended?.card.userCardId).toBe('preferred');
    expect(result.warnings).toContain('tie_broken_by_preference');
    // The reported advantage is never negative.
    expect(result.advantageOverRunnerUpUsd).toBe(0);
  });

  it('switches when the gain clears the threshold', () => {
    const preferred = flatCard(2, {
      userCardId: 'preferred',
      displayName: 'Preferred',
      isPreferred: true,
    });
    const clearlyBetter = flatCard(6, { userCardId: 'better', displayName: 'Better' });

    const result = evaluate(
      [preferred, clearlyBetter],
      {},
      {
        valuation: valuation({ minimumSwitchBenefitUsd: 0.5 }),
      },
    );

    // $7.20 versus $2.40 is well clear of the 50-cent threshold.
    expect(result.recommended?.card.userCardId).toBe('better');
  });

  it('does not hold for a threshold of zero', () => {
    const preferred = flatCard(2, { userCardId: 'preferred', isPreferred: true });
    const marginal = flatCard(2.05, { userCardId: 'marginal' });

    const result = evaluate(
      [preferred, marginal],
      {},
      {
        valuation: valuation({ minimumSwitchBenefitUsd: 0 }),
      },
    );
    expect(result.recommended?.card.userCardId).toBe('marginal');
  });
});

// ===========================================================================
// 11. Missing and uncertain category
// ===========================================================================

describe('missing and uncertain category', () => {
  const wallet = [
    card({
      userCardId: 'grocery',
      displayName: 'Grocery Card',
      rules: [
        baseRule(1),
        categoryRule({ id: 'grocery-bonus', categoryId: CATEGORY.grocery, rate: 6 }),
      ],
    }),
    flatCard(2),
  ];

  it('falls back to unconditional rules when the category is unknown', () => {
    const result = evaluate(wallet, {
      categoryId: null,
      categoryMatchKind: 'unknown',
      categoryConfidence: 'low',
    });

    // The flat 2% card wins at $2.40; the grocery card only earns its 1% base.
    expect(result.recommended?.card.userCardId).toBe('flat-2');
    expect(result.confidence).toBe('low');
    expect(result.warnings).toContain('category_missing');
  });

  it('caps confidence at medium for an inferred category', () => {
    const result = evaluate(wallet, { categoryMatchKind: 'inferred' });
    expect(result.recommended?.card.userCardId).toBe('grocery');
    expect(result.confidence).toBe('medium');
    expect(result.warnings).toContain('category_inferred');
  });

  it('drops confidence to low for a merchant with ambiguous coding', () => {
    const result = evaluate(wallet, { hasAmbiguousCoding: true });
    expect(result.confidence).toBe('low');
    expect(result.warnings).toContain('merchant_coding_uncertain');
  });

  it('reaches high confidence only for an exact match on a verified rule', () => {
    const result = evaluate(wallet);
    expect(result.confidence).toBe('high');
    expect(result.warnings).toEqual([]);
  });

  it('respects the classifier’s own confidence as a ceiling', () => {
    const result = evaluate(wallet, {
      categoryMatchKind: 'user_selected',
      categoryConfidence: 'medium',
    });
    expect(result.confidence).toBe('medium');
  });

  it('returns no recommendation when nothing qualifies, with a reason for each card', () => {
    const diningOnly = card({
      userCardId: 'dining-only',
      rules: [categoryRule({ id: 'dining', categoryId: CATEGORY.dining, rate: 4 })],
    });
    const gasOnly = card({
      userCardId: 'gas-only',
      rules: [categoryRule({ id: 'gas', categoryId: CATEGORY.gas, rate: 5 })],
    });

    const result = evaluate([diningOnly, gasOnly]);

    expect(result.recommended).toBeNull();
    expect(result.runnerUp).toBeNull();
    expect(result.advantageOverRunnerUpUsd).toBeNull();
    expect(result.eligible).toHaveLength(0);
    expect(result.ineligible).toHaveLength(2);
    for (const candidate of result.ineligible) {
      expect(candidate.ineligibilityCode).not.toBeNull();
      expect(candidate.reason.length).toBeGreaterThan(0);
    }
    expect(result.explanation).toMatch(/None of the cards/);
  });
});

// ===========================================================================
// 12. Zero-dollar, invalid and empty cases
// ===========================================================================

describe('degenerate inputs', () => {
  it('handles an empty wallet without crashing', () => {
    const result = evaluate([]);
    expect(result.recommended).toBeNull();
    expect(result.eligible).toHaveLength(0);
    expect(result.ineligible).toHaveLength(0);
    expect(result.confidence).toBe('low');
  });

  it('earns nothing on a zero-dollar purchase', () => {
    // The schema rejects $0 before the engine ever sees it; if one arrives, the
    // engine must not invent a reward for it.
    const result = evaluate([flatCard(2)], { amountUsd: 0 });
    expect(result.recommended).toBeNull();
    expect(codeOf(result, 'flat-2')).toBe('zero_value_reward');
  });

  it('excludes a card the user turned off', () => {
    const off = flatCard(6, {
      userCardId: 'off',
      isExcludedFromRecommendations: true,
    });
    const result = evaluate([off, flatCard(2)]);

    expect(codeOf(result, 'off')).toBe('card_excluded_by_user');
    expect(result.recommended?.card.userCardId).toBe('flat-2');
  });

  it('reports no_active_rules for a card with no rules at all', () => {
    expect(codeOf(evaluate([card({ userCardId: 'bare', rules: [] })]), 'bare')).toBe(
      'no_active_rules',
    );
  });

  it('handles a very large amount without losing precision', () => {
    // 999,999.99 × 2% = 19,999.9998 → $20,000.00
    const result = evaluate([flatCard(2)], { amountUsd: 999999.99 });
    expect(result.recommended?.breakdown.netValueUsd).toBe(20000);
  });
});

// ===========================================================================
// 13. Multiple overlapping rules and stacking
// ===========================================================================

describe('multiple overlapping rules', () => {
  it('picks the higher-earning rule, not the higher-priority one', () => {
    const conflicting = card({
      userCardId: 'conflicting',
      rules: [
        // Higher priority but a worse rate.
        rule({ id: 'high-priority', baseRate: 2, priority: 900 }),
        rule({ id: 'better-rate', baseRate: 5, priority: 10 }),
      ],
    });

    const result = evaluate([conflicting]);
    expect(result.recommended?.breakdown.appliedRuleId).toBe('better-rate');
    expect(result.recommended?.breakdown.netValueUsd).toBe(6);
  });

  it('prefers a bonus over the base rule when both match', () => {
    const both = card({
      userCardId: 'both',
      rules: [
        baseRule(1),
        categoryRule({ id: 'grocery-bonus', categoryId: CATEGORY.grocery, rate: 6 }),
      ],
    });
    expect(evaluate([both]).recommended?.breakdown.appliedRuleId).toBe('grocery-bonus');
  });

  it('stacks an intro bonus on top of a category rule', () => {
    // 5% online + a stackable 2% intro = 7%. 120 × 7% = $8.40.
    const stacking = card({
      userCardId: 'stacking',
      rules: [
        baseRule(1),
        rule({
          id: 'online-5',
          baseRate: 5,
          stackGroup: 'category',
          conditions: [
            condition({ categoryIds: [CATEGORY.onlineShopping], channel: 'online' }),
          ],
        }),
        rule({
          id: 'intro-2',
          baseRate: 2,
          stackGroup: 'intro',
          isStackable: true,
          conditions: [condition({ channel: 'online' })],
        }),
      ],
    });

    const result = evaluate([stacking], {
      categoryId: CATEGORY.onlineShopping,
      channel: 'online',
    });

    expect(result.recommended?.breakdown.netValueUsd).toBe(8.4);
    expect(result.recommended?.breakdown.effectiveRate).toBe(7);
  });

  it('stacks a statement credit alongside a points rule', () => {
    const hotel = card({
      userCardId: 'hotel',
      rules: [
        baseRule(10, {
          id: 'stay-10x',
          rewardUnit: 'points',
          rewardProgramId: PROGRAM.harborlineStayPoints,
        }),
        rule({
          id: 'credit',
          label: '$50 statement credit on stays',
          kind: 'statement_credit',
          rewardType: 'statement_credit',
          rewardUnit: 'usd',
          baseRate: 0,
          fixedAmountUsd: 50,
          stackGroup: 'credit',
          isStackable: true,
          conditions: [condition({ minAmountUsd: 100 })],
        }),
      ],
    });

    const result = evaluate(
      [hotel],
      { amountUsd: 200, categoryId: CATEGORY.hotel },
      {
        valuation: valuation({ byProgramId: { [PROGRAM.harborlineStayPoints]: 0.6 } }),
      },
    );

    // 200 × 10 = 2000 points × 0.6¢ = $12.00, plus a $50 credit → $62.00.
    expect(result.recommended?.breakdown.rewardValueUsd).toBe(12);
    expect(result.recommended?.breakdown.statementCreditUsd).toBe(50);
    expect(result.recommended?.breakdown.netValueUsd).toBe(62);
  });

  it('does not apply a statement credit below its minimum spend', () => {
    const hotel = card({
      userCardId: 'hotel',
      rules: [
        baseRule(1),
        rule({
          id: 'credit',
          kind: 'statement_credit',
          rewardType: 'statement_credit',
          rewardUnit: 'usd',
          baseRate: 0,
          fixedAmountUsd: 50,
          stackGroup: 'credit',
          isStackable: true,
          conditions: [condition({ minAmountUsd: 100 })],
        }),
      ],
    });

    const result = evaluate([hotel], { amountUsd: 50 });
    expect(result.recommended?.breakdown.statementCreditUsd).toBe(0);
    expect(result.recommended?.breakdown.netValueUsd).toBe(0.5);
  });

  it('limits a statement credit by its own reward cap', () => {
    const hotel = card({
      userCardId: 'hotel',
      rules: [
        rule({
          id: 'credit',
          kind: 'statement_credit',
          rewardType: 'statement_credit',
          rewardUnit: 'usd',
          baseRate: 0,
          fixedAmountUsd: 50,
          capAmount: 50,
          capAppliesTo: 'reward',
          capPeriod: 'cardmember_year',
        }),
      ],
      accountOpenedOn: new Date('2026-01-01T00:00:00.000Z'),
      capUsage: {
        credit: capUsage({
          periodStart: new Date('2026-01-01T00:00:00.000Z'),
          periodEnd: new Date('2027-01-01T00:00:00.000Z'),
          accruedRewardUsd: 30,
        }),
      },
    });

    // $20 of the $50 annual credit remains.
    expect(evaluate([hotel]).recommended?.breakdown.netValueUsd).toBe(20);
  });

  it('breaks a same-value tie between two rules deterministically', () => {
    const tied = card({
      userCardId: 'tied',
      rules: [
        rule({ id: 'bbb', baseRate: 3, priority: 100 }),
        rule({ id: 'aaa', baseRate: 3, priority: 100 }),
      ],
    });

    // Equal value and equal priority → lower id wins, both ways round.
    expect(evaluate([tied]).recommended?.breakdown.appliedRuleId).toBe('aaa');

    const reversed = card({
      userCardId: 'tied',
      rules: [
        rule({ id: 'aaa', baseRate: 3, priority: 100 }),
        rule({ id: 'bbb', baseRate: 3, priority: 100 }),
      ],
    });
    expect(evaluate([reversed]).recommended?.breakdown.appliedRuleId).toBe('aaa');
  });

  it('resolves three overlapping categories to the single best combination', () => {
    const travel = card({
      userCardId: 'travel',
      rules: [
        baseRule(1),
        categoryRule({ id: 'travel-3', categoryId: CATEGORY.hotel, rate: 3 }),
        rule({
          id: 'travel-multi',
          baseRate: 2,
          conditions: [
            condition({
              categoryIds: [CATEGORY.hotel, CATEGORY.airfare, CATEGORY.transit],
            }),
          ],
        }),
      ],
    });

    // Hotel matches all three rules; the 3% one wins its group.
    const result = evaluate([travel], { categoryId: CATEGORY.hotel });
    expect(result.recommended?.breakdown.appliedRuleId).toBe('travel-3');
    expect(result.recommended?.breakdown.netValueUsd).toBe(3.6);
  });
});

// ===========================================================================
// 14. Provenance and warnings surfaced on the result
// ===========================================================================

describe('provenance', () => {
  it('reports the applied rule’s verification status and date', () => {
    const result = evaluate([flatCard(2)]);
    expect(result.recommended?.verificationStatus).toBe('verified');
    expect(result.recommended?.sourceVerifiedAt?.toISOString()).toBe(
      '2026-07-01T00:00:00.000Z',
    );
  });

  it('caps confidence and warns for a stale source', () => {
    const stale = flatCard(2, {
      userCardId: 'stale',
      rules: [
        baseRule(2, {
          id: 'stale-rule',
          verificationStatus: 'stale',
          lastVerifiedAt: new Date('2024-01-15T00:00:00.000Z'),
        }),
      ],
    });

    const result = evaluate([stale]);
    expect(result.confidence).toBe('medium');
    expect(result.warnings).toContain('source_stale');
  });

  it('caps confidence and warns for an unverified source', () => {
    const unverified = flatCard(2, {
      userCardId: 'unverified',
      rules: [
        baseRule(2, { id: 'unv', verificationStatus: 'unverified', lastVerifiedAt: null }),
      ],
    });

    const result = evaluate([unverified]);
    expect(result.confidence).toBe('medium');
    expect(result.warnings).toContain('source_unverified');
  });

  it('drops confidence to low for a disputed rate', () => {
    const disputed = flatCard(2, {
      userCardId: 'disputed',
      rules: [baseRule(2, { id: 'dis', verificationStatus: 'disputed' })],
    });
    expect(evaluate([disputed]).confidence).toBe('low');
  });

  it('treats a user-reported rate as no better than medium', () => {
    // A custom card's rate, entered by the cardholder.
    const custom = flatCard(2, {
      userCardId: 'custom',
      rules: [baseRule(2, { id: 'own', verificationStatus: 'user_reported' })],
    });
    expect(evaluate([custom]).confidence).toBe('medium');
  });
});
