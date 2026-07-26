/**
 * The specification's own worked example, end to end.
 *
 * > A user enters Merchant "Whole Foods", Amount $120, Category Grocery, Payment
 * > method Apple Pay, Country United States, and the app returns "Use your Amex
 * > Blue Cash Preferred. Estimated reward: $7.20 cash back. Your second-best
 * > option earns approximately $6.00."
 *
 * Rendered against WalletWise's own fictional catalog, with no real issuer or
 * product named: a 6% supermarket card wins on $120 with $7.20, and an activated
 * 5% rotating-category card is the runner-up at $6.00.
 *
 * This test runs the same two pure steps the app runs — `classifyPurchase` then
 * `evaluateWallet` — over a wallet built from `supabase/seed/`, so the figures are
 * traceable to specific seed rows and every arithmetic step is written out below.
 *
 * The arithmetic, by hand:
 *   $120.00 × 6% = $7.20   (rule 66666666-…-000000000102, cap $6,000/yr untouched)
 *   $120.00 × 5% = $6.00   (rule 66666666-…-000000000503, Q3 2026, activated)
 *   $120.00 × 1% = $1.20   (either card's base rule)
 *   advantage    = $7.20 − $6.00 = $1.20
 */
import { classifyPurchase } from '@/domain/classifier/classify';
import type { ClassifiableMerchant } from '@/domain/classifier/types';
import { evaluateWallet, type EvaluableCard } from '@/domain/rewards';
import { valuation } from '@/domain/rewards/__fixtures__/wallet';

/** 2026-07-26, inside Q3 2026 and inside the 2026 calendar-year cap window. */
const AS_OF = new Date('2026-07-26T14:30:00.000Z');

const CATEGORY_GROCERY = '33333333-0000-4000-8000-000000000002';
const CATEGORY_GAS = '33333333-0000-4000-8000-000000000003';
const MERCHANT_GREENLEAF = '44444444-0000-4000-8000-000000000001';
const MERCHANT_BULKBARN = '44444444-0000-4000-8000-000000000002';

/** `supabase/seed/03_demo_merchants.sql`, the two grocery-ish rows. */
const MERCHANTS: readonly ClassifiableMerchant[] = [
  {
    id: MERCHANT_GREENLEAF,
    displayName: 'DEMO — Greenleaf Market',
    aliases: ['greenleaf', 'green leaf market'],
    primaryCategoryId: CATEGORY_GROCERY,
    knownMcc: 5411,
    mccConfidence: 'high',
    hasAmbiguousCoding: false,
    countryCode: 'US',
    isOnlineOnly: false,
  },
  {
    id: MERCHANT_BULKBARN,
    displayName: 'DEMO — BulkBarn Warehouse',
    aliases: ['bulkbarn', 'bulk barn'],
    primaryCategoryId: '33333333-0000-4000-8000-000000000011',
    knownMcc: 5300,
    mccConfidence: 'medium',
    hasAmbiguousCoding: true,
    countryCode: 'US',
    isOnlineOnly: false,
  },
];

/**
 * `DEMO — Northwind Everyday Grocery Card`, rules …0101 and …0102.
 *
 * 6% at US supermarkets, capped at $6,000 of spend per calendar year, dropping to
 * 1% above the cap. BulkBarn Warehouse is excluded because it codes as a warehouse
 * club.
 */
const GROCERY_CARD: EvaluableCard = {
  userCardId: 'user-card-grocery',
  cardProductId: '55555555-0000-4000-8000-000000000001',
  displayName: 'DEMO — Northwind Everyday Grocery Card',
  issuerName: 'DEMO — Northwind Bank',
  nickname: null,
  annualFeeUsd: 0,
  foreignTransactionFeePercent: 3,
  supportedCountryCodes: ['US'],
  isPreferred: false,
  isExcludedFromRecommendations: false,
  accountOpenedOn: new Date('2024-03-14T00:00:00.000Z'),
  enrollments: {},
  capUsage: {},
  offers: [],
  rules: [
    {
      id: '66666666-0000-4000-8000-000000000101',
      cardProductId: '55555555-0000-4000-8000-000000000001',
      rewardProgramId: '22222222-0000-4000-8000-000000000001',
      label: '1% cash back on everything else',
      kind: 'base',
      rewardType: 'cash_back_percent',
      rewardUnit: 'usd',
      baseRate: 1,
      bonusRate: 0,
      fixedAmountUsd: null,
      priority: 10,
      stackGroup: 'category',
      isStackable: false,
      capAmount: null,
      capAppliesTo: 'spend',
      capPeriod: 'none',
      postCapRate: null,
      startsAt: null,
      endsAt: null,
      requiresEnrollment: false,
      spendThresholdUsd: null,
      lastVerifiedAt: new Date('2026-07-01T00:00:00.000Z'),
      verificationStatus: 'verified',
      isActive: true,
      conditions: [],
    },
    {
      id: '66666666-0000-4000-8000-000000000102',
      cardProductId: '55555555-0000-4000-8000-000000000001',
      rewardProgramId: '22222222-0000-4000-8000-000000000001',
      label: '6% cash back at US supermarkets, on up to $6,000 per calendar year',
      kind: 'category_bonus',
      rewardType: 'cash_back_percent',
      rewardUnit: 'usd',
      baseRate: 6,
      bonusRate: 0,
      fixedAmountUsd: null,
      priority: 100,
      stackGroup: 'category',
      isStackable: false,
      capAmount: 6000,
      capAppliesTo: 'spend',
      capPeriod: 'calendar_year',
      postCapRate: 1,
      startsAt: null,
      endsAt: null,
      requiresEnrollment: false,
      spendThresholdUsd: null,
      lastVerifiedAt: new Date('2026-07-01T00:00:00.000Z'),
      verificationStatus: 'verified',
      isActive: true,
      conditions: [
        {
          id: '77777777-0000-4000-8000-000000001021',
          categoryIds: [CATEGORY_GROCERY],
          excludedCategoryIds: [],
          includedMccs: [],
          includedMccRanges: [],
          excludedMccs: [],
          includedMerchantIds: [],
          excludedMerchantIds: [MERCHANT_BULKBARN],
          includedCountryCodes: ['US'],
          excludedCountryCodes: [],
          includedCurrencyCodes: [],
          channel: 'either',
          includedPaymentMethods: [],
          startsAt: null,
          endsAt: null,
          minAmountUsd: null,
          maxAmountUsd: null,
        },
      ],
    },
  ],
};

/**
 * `DEMO — Harborline Quarterly Rotator Card`, rules …0501 and …0503.
 *
 * Q3 2026 is grocery and gas at 5%, capped at $1,500 in the quarter, and needs
 * activating. The enrollment below is what makes it the runner-up rather than a
 * card that earns 1%.
 */
const ROTATOR_CARD: EvaluableCard = {
  userCardId: 'user-card-rotator',
  cardProductId: '55555555-0000-4000-8000-000000000005',
  displayName: 'DEMO — Harborline Quarterly Rotator Card',
  issuerName: 'DEMO — Harborline Financial',
  nickname: null,
  annualFeeUsd: 0,
  foreignTransactionFeePercent: 3,
  supportedCountryCodes: ['US'],
  isPreferred: false,
  isExcludedFromRecommendations: false,
  accountOpenedOn: new Date('2023-09-02T00:00:00.000Z'),
  enrollments: { '66666666-0000-4000-8000-000000000503': true },
  capUsage: {},
  offers: [],
  rules: [
    {
      id: '66666666-0000-4000-8000-000000000501',
      cardProductId: '55555555-0000-4000-8000-000000000005',
      rewardProgramId: '22222222-0000-4000-8000-000000000007',
      label: '1% cash back on everything else',
      kind: 'base',
      rewardType: 'cash_back_percent',
      rewardUnit: 'usd',
      baseRate: 1,
      bonusRate: 0,
      fixedAmountUsd: null,
      priority: 10,
      stackGroup: 'category',
      isStackable: false,
      capAmount: null,
      capAppliesTo: 'spend',
      capPeriod: 'none',
      postCapRate: null,
      startsAt: null,
      endsAt: null,
      requiresEnrollment: false,
      spendThresholdUsd: null,
      lastVerifiedAt: new Date('2026-07-01T00:00:00.000Z'),
      verificationStatus: 'verified',
      isActive: true,
      conditions: [],
    },
    {
      id: '66666666-0000-4000-8000-000000000503',
      cardProductId: '55555555-0000-4000-8000-000000000005',
      rewardProgramId: '22222222-0000-4000-8000-000000000007',
      label: 'Q3 2026: 5% cash back on grocery and gas, on up to $1,500 in the quarter',
      kind: 'rotating_category',
      rewardType: 'cash_back_percent',
      rewardUnit: 'usd',
      baseRate: 5,
      bonusRate: 0,
      fixedAmountUsd: null,
      priority: 100,
      stackGroup: 'category',
      isStackable: false,
      capAmount: 1500,
      capAppliesTo: 'spend',
      capPeriod: 'quarterly',
      postCapRate: 1,
      startsAt: new Date('2026-07-01T00:00:00.000Z'),
      endsAt: new Date('2026-10-01T00:00:00.000Z'),
      requiresEnrollment: true,
      spendThresholdUsd: null,
      lastVerifiedAt: new Date('2026-07-01T00:00:00.000Z'),
      verificationStatus: 'verified',
      isActive: true,
      conditions: [
        {
          id: '77777777-0000-4000-8000-000000005031',
          categoryIds: [CATEGORY_GROCERY, CATEGORY_GAS],
          excludedCategoryIds: [],
          includedMccs: [],
          includedMccRanges: [],
          excludedMccs: [],
          includedMerchantIds: [],
          excludedMerchantIds: [],
          includedCountryCodes: ['US'],
          excludedCountryCodes: [],
          includedCurrencyCodes: [],
          channel: 'either',
          includedPaymentMethods: [],
          startsAt: null,
          endsAt: null,
          minAmountUsd: null,
          maxAmountUsd: null,
        },
      ],
    },
  ],
};

/** The two pure steps the app runs between the form and the screen. */
function runPipeline(options: {
  readonly merchantInput: string;
  readonly amountUsd: number;
  readonly userSelectedCategoryId: string | null;
  readonly cards?: readonly EvaluableCard[];
}) {
  const classification = classifyPurchase(
    {
      merchantInput: options.merchantInput,
      userSelectedCategoryId: options.userSelectedCategoryId,
      mcc: null,
      countryCode: 'US',
      channel: 'in_store',
    },
    MERCHANTS,
  );

  const result = evaluateWallet(
    {
      merchantInput: options.merchantInput,
      amountUsd: options.amountUsd,
      currencyCode: 'USD',
      countryCode: 'US',
      channel: 'in_store',
      paymentMethod: 'apple_pay',
      categoryId: classification.categoryId,
      merchantId: classification.merchantId,
      mcc: classification.mcc,
      categoryMatchKind: classification.matchKind,
      categoryConfidence: classification.confidence,
      hasAmbiguousCoding: classification.hasAmbiguousCoding,
    },
    options.cards ?? [GROCERY_CARD, ROTATOR_CARD],
    { asOf: AS_OF, homeCurrencyCode: 'USD', valuation: valuation() },
  );

  return { classification, result };
}

describe('the specification example, end to end', () => {
  const { classification, result } = runPipeline({
    merchantInput: 'Greenleaf Market',
    amountUsd: 120,
    userSelectedCategoryId: CATEGORY_GROCERY,
  });

  it('resolves the merchant against the catalog', () => {
    expect(classification.merchantId).toBe(MERCHANT_GREENLEAF);
    expect(classification.resolvedMerchantName).toBe('DEMO — Greenleaf Market');
    expect(classification.categoryId).toBe(CATEGORY_GROCERY);
    expect(classification.matchKind).toBe('exact_merchant');
    expect(classification.confidence).toBe('high');
    expect(classification.hasAmbiguousCoding).toBe(false);
  });

  it('recommends the 6% card at exactly $7.20 — 120 × 0.06', () => {
    expect(result.recommended?.card.userCardId).toBe('user-card-grocery');
    expect(result.recommended?.breakdown.netValueUsd).toBe(7.2);
    expect(result.recommended?.breakdown.effectiveRate).toBe(6);
    expect(result.recommended?.breakdown.rewardUnit).toBe('usd');
  });

  it('ranks the activated 5% rotator second at exactly $6.00 — 120 × 0.05', () => {
    expect(result.runnerUp?.card.userCardId).toBe('user-card-rotator');
    expect(result.runnerUp?.breakdown.netValueUsd).toBe(6);
    expect(result.runnerUp?.breakdown.effectiveRate).toBe(5);
  });

  it('reports the advantage as $1.20, free of floating-point noise', () => {
    // 7.2 - 6 is 1.2000000000000002 in IEEE-754. The engine rounds before it
    // reports, because this figure is persisted and shown.
    expect(result.advantageOverRunnerUpUsd).toBe(1.2);
  });

  it('traces each figure to the seed rule that produced it', () => {
    expect(result.recommended?.breakdown.appliedRuleId).toBe(
      '66666666-0000-4000-8000-000000000102',
    );
    expect(result.recommended?.breakdown.appliedRuleLabel).toBe(
      '6% cash back at US supermarkets, on up to $6,000 per calendar year',
    );
    expect(result.runnerUp?.breakdown.appliedRuleId).toBe(
      '66666666-0000-4000-8000-000000000503',
    );
  });

  it('reports full remaining cap on both bonuses', () => {
    // Untouched caps: $6,000 for the calendar year, $1,500 for the quarter.
    expect(result.recommended?.capAmountUsd).toBe(6000);
    expect(result.recommended?.capRemainingUsd).toBe(6000);
    expect(result.recommended?.capPeriod).toBe('calendar_year');
    expect(result.runnerUp?.capRemainingUsd).toBe(1500);
    expect(result.runnerUp?.capPeriod).toBe('quarterly');
  });

  it('is confident, and carries no coding warning', () => {
    expect(result.confidence).toBe('high');
    expect(result.warnings).not.toContain('merchant_coding_uncertain');
    expect(result.recommended?.verificationStatus).toBe('verified');
    expect(result.recommended?.sourceVerifiedAt).toEqual(new Date('2026-07-01T00:00:00.000Z'));
  });

  it('explains itself with the engine’s own numbers and nothing else', () => {
    // The explanation layer rephrases; it never computes. Any figure appearing in
    // the sentence has to be one the breakdown already contains.
    expect(result.explanation).toContain('$7.20');
    expect(result.explanation).toContain('6%');
    expect(result.explanation).toContain('DEMO — Northwind Everyday Grocery Card');
    expect(result.explanation).toContain('$6.00');
  });

  it('stamps the engine version, so an old answer stays interpretable', () => {
    expect(result.engineVersion).toBe('0.1.0');
    expect(result.computedAt).toEqual(AS_OF);
  });

  it('is reproducible: the same inputs give byte-identical output', () => {
    const again = runPipeline({
      merchantInput: 'Greenleaf Market',
      amountUsd: 120,
      userSelectedCategoryId: CATEGORY_GROCERY,
    });

    expect(again.result).toEqual(result);
  });
});

describe('the same purchase, with the variations that change the answer', () => {
  it('drops the rotator to 1% when the quarter is not activated', () => {
    // $120 × 1% = $1.20. The bonus exists but the user has not enrolled, so
    // claiming $6.00 would be telling them about money they will not receive.
    const { result } = runPipeline({
      merchantInput: 'Greenleaf Market',
      amountUsd: 120,
      userSelectedCategoryId: CATEGORY_GROCERY,
      cards: [{ ...ROTATOR_CARD, enrollments: {} }],
    });

    expect(result.recommended?.breakdown.netValueUsd).toBe(1.2);
    expect(result.recommended?.breakdown.appliedRuleId).toBe(
      '66666666-0000-4000-8000-000000000501',
    );
    expect(result.warnings).toContain('enrollment_required');
  });

  it('falls to 1% on the grocery card at the excluded warehouse club', () => {
    // BulkBarn codes as a warehouse club, so the 6% supermarket bonus does not
    // apply: $120 × 1% = $1.20, with the amber coding warning attached.
    const { classification, result } = runPipeline({
      merchantInput: 'BulkBarn Warehouse',
      amountUsd: 120,
      userSelectedCategoryId: CATEGORY_GROCERY,
      cards: [GROCERY_CARD],
    });

    expect(classification.hasAmbiguousCoding).toBe(true);
    expect(classification.disagreesWithUserSelection).toBe(true);
    expect(result.recommended?.breakdown.netValueUsd).toBe(1.2);
    expect(result.warnings).toContain('merchant_coding_uncertain');
  });

  it('applies the cap split when the annual cap is nearly used', () => {
    // $5,950 of $6,000 spent leaves $50 at 6% ($3.00) and $70 at 1% ($0.70): $3.70.
    const { result } = runPipeline({
      merchantInput: 'Greenleaf Market',
      amountUsd: 120,
      userSelectedCategoryId: CATEGORY_GROCERY,
      cards: [
        {
          ...GROCERY_CARD,
          capUsage: {
            '66666666-0000-4000-8000-000000000102': {
              periodStart: new Date('2026-01-01T00:00:00.000Z'),
              periodEnd: new Date('2027-01-01T00:00:00.000Z'),
              qualifyingSpendUsd: 5950,
              accruedRewardUsd: 357,
            },
          },
        },
      ],
    });

    expect(result.recommended?.breakdown.withinCapSpendUsd).toBe(50);
    expect(result.recommended?.breakdown.overCapSpendUsd).toBe(70);
    expect(result.recommended?.breakdown.netValueUsd).toBe(3.7);
  });

  it('charges the foreign transaction fee only outside the home currency', () => {
    // Both demo cards carry a 3% fee, but the specification example is a US dollar
    // purchase, so no fee applies to it.
    expect(result_forSpecExample().recommended?.breakdown.foreignTransactionFeeUsd).toBe(0);
  });
});

/** Re-runs the headline example, for the assertion above. */
function result_forSpecExample() {
  return runPipeline({
    merchantInput: 'Greenleaf Market',
    amountUsd: 120,
    userSelectedCategoryId: CATEGORY_GROCERY,
  }).result;
}
