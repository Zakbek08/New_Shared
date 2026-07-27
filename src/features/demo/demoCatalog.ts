/**
 * A bundled fictional wallet, so the app can be demonstrated without a backend.
 *
 * WHY THIS IS SAFE, AND WHERE THE LINE IS
 * Every card, issuer, merchant and rate below is **invented**. None of it
 * describes a real financial product. That is the same guarantee the seeded
 * database gives — this is the same fictional catalog, expressed as TypeScript so
 * it can be bundled into a build that has no database behind it.
 *
 * What this file does NOT do is produce a reward figure. It supplies rule records;
 * `src/domain/rewards/` computes every number from them, exactly as it does for
 * rows fetched from Postgres. Demo mode changes where the records come from and
 * nothing else. A file like this one inventing "you'd earn $4.20" would be the
 * defect CLAUDE.md exists to prevent, and there is a test asserting the numbers on
 * screen come from the engine.
 *
 * CONSISTENCY WITH THE SEED DATA IS ENFORCED
 * `demoCatalog.test.ts` reads `supabase/seed/` and asserts these product names and
 * rates match the SQL. Two copies of a catalog drift; a test comparing them does
 * not. If you change a rate here, change it there, and the test will tell you if
 * you forget.
 *
 * NO TIME IS READ HERE. Rules that start or end are expressed as explicit dates,
 * and the caller passes `asOf`. A demo wallet that behaved differently depending
 * on when it was opened would be untestable.
 */
import { CATEGORIES } from '@/domain/categories';
import type { ClassifiableMerchant } from '@/domain/classifier/types';
import type { EvaluableCard, EvaluableCondition, EvaluableRule } from '@/domain/rewards/types';

/** Resolves a category id from its slug, so the data below reads legibly. */
function categoryId(slug: string): string {
  const category = CATEGORIES.find((candidate) => candidate.slug === slug);
  if (category === undefined) {
    // A typo here would silently produce a rule that matches nothing, which would
    // look like an engine bug rather than a data bug.
    throw new Error(`demoCatalog references an unknown category slug: ${slug}`);
  }
  return category.id;
}

/** An empty condition, so each rule states only the fields it actually constrains. */
const NO_CONSTRAINTS: Omit<EvaluableCondition, 'id'> = {
  categoryIds: [],
  excludedCategoryIds: [],
  includedMccs: [],
  includedMccRanges: [],
  excludedMccs: [],
  includedMerchantIds: [],
  excludedMerchantIds: [],
  includedCountryCodes: [],
  excludedCountryCodes: [],
  includedCurrencyCodes: [],
  channel: 'either',
  includedPaymentMethods: [],
  startsAt: null,
  endsAt: null,
  minAmountUsd: null,
  maxAmountUsd: null,
};

function condition(id: string, overrides: Partial<EvaluableCondition>): EvaluableCondition {
  return { id, ...NO_CONSTRAINTS, ...overrides };
}

/**
 * Defaults every rule shares, so each rule below states only what differs.
 *
 * RATES ARE PERCENTAGES, NOT FRACTIONS. `bonusRate: 6` means 6%, because
 * `money.percentOf` divides by 100. Writing 0.06 here produces a rule that pays
 * six hundredths of a percent — which is what the first draft of this file did,
 * and what the hand-checked arithmetic in demoCatalog.test.ts caught.
 */
const RULE_DEFAULTS: Omit<
  EvaluableRule,
  'id' | 'label' | 'baseRate' | 'bonusRate' | 'cardProductId'
> = {
  // Null: these fictional cards pay cash back in dollars, so no points programme
  // is involved and none is invented. The engine falls back to the per-unit
  // valuation, which for usd is 1.
  rewardProgramId: null,
  kind: 'category_bonus',
  rewardType: 'cash_back_percent',
  rewardUnit: 'usd',
  fixedAmountUsd: null,
  priority: 100,
  stackGroup: 'base',
  isStackable: false,
  capAmount: null,
  capAppliesTo: 'spend',
  capPeriod: 'none',
  postCapRate: null,
  startsAt: null,
  endsAt: null,
  requiresEnrollment: false,
  spendThresholdUsd: null,
  // A fixed, explicit verification date. The freshness banding in
  // `src/domain/catalog/staleness.ts` is driven by `asOf`, so this stays
  // reproducible rather than drifting with the calendar.
  lastVerifiedAt: new Date('2026-07-01T00:00:00.000Z'),
  verificationStatus: 'verified',
  isActive: true,
  conditions: [],
};

function rule(
  overrides: Partial<EvaluableRule> & Pick<EvaluableRule, 'id' | 'label' | 'cardProductId'>,
): EvaluableRule {
  return { ...RULE_DEFAULTS, baseRate: 0, bonusRate: 0, ...overrides };
}

/** Defaults every card shares. */
const CARD_DEFAULTS: Omit<
  EvaluableCard,
  'userCardId' | 'cardProductId' | 'displayName' | 'issuerName' | 'rules'
> = {
  nickname: null,
  annualFeeUsd: 0,
  foreignTransactionFeePercent: 0,
  supportedCountryCodes: ['US'],
  isPreferred: false,
  isExcludedFromRecommendations: false,
  accountOpenedOn: new Date('2024-03-14T00:00:00.000Z'),
  enrollments: {},
  capUsage: {},
  offers: [],
};

/** The everything-else rule every card carries, so no purchase is unmatched. */
function baseRule(id: string, cardProductId: string, rate: number): EvaluableRule {
  return rule({
    id,
    cardProductId,
    label: `${rate}% cash back on everything else`,
    kind: 'base',
    baseRate: rate,
    priority: 1000,
  });
}

/**
 * The demonstration wallet: four cards, chosen so the winner genuinely changes
 * with the purchase rather than one card always dominating.
 *
 *   groceries        → Northwind Grocery at 6%, until its yearly cap is used up
 *   fuel             → Meridian Fuel at 5%, on a quarterly cap
 *   tap-to-pay       → Northwind TapPay at 3%, monthly cap
 *   online retail    → Meridian Online Shopper at 5%
 *   anything else    → Cobalt Everyday flat 2%
 *
 * The grocery card carries deliberate cap usage, so the cap logic and its warning
 * are visible in the demo instead of being theoretical.
 */
export const DEMO_CARDS: readonly EvaluableCard[] = [
  {
    ...CARD_DEFAULTS,
    userCardId: 'demo-card-grocery',
    cardProductId: 'demo-product-grocery',
    displayName: 'DEMO — Northwind Everyday Grocery Card',
    issuerName: 'DEMO — Northwind',
    nickname: 'Grocery card',
    rules: [
      rule({
        id: 'demo-rule-grocery-6',
        cardProductId: 'demo-product-grocery',
        label: '6% cash back at US supermarkets, on up to $6,000 per calendar year',
        bonusRate: 6,
        priority: 10,
        capAmount: 6000,
        capAppliesTo: 'spend',
        capPeriod: 'calendar_year',
        postCapRate: 1,
        conditions: [condition('demo-cond-grocery', { categoryIds: [categoryId('grocery')] })],
      }),
      baseRule('demo-rule-grocery-base', 'demo-product-grocery', 1),
    ],
    // $5,400 of the $6,000 yearly cap already used: enough that a large grocery
    // purchase spills past it, which is the interesting case to show.
    capUsage: {
      'demo-rule-grocery-6': {
        periodStart: new Date('2026-01-01T00:00:00.000Z'),
        periodEnd: new Date('2027-01-01T00:00:00.000Z'),
        qualifyingSpendUsd: 5400,
        accruedRewardUsd: 324,
      },
    },
  },
  {
    ...CARD_DEFAULTS,
    userCardId: 'demo-card-fuel',
    cardProductId: 'demo-product-fuel',
    displayName: 'DEMO — Meridian Fuel Advantage Card',
    issuerName: 'DEMO — Meridian',
    nickname: 'Fuel card',
    rules: [
      rule({
        id: 'demo-rule-fuel-5',
        cardProductId: 'demo-product-fuel',
        label: '5% cash back at gas stations, on up to $2,000 per quarter',
        bonusRate: 5,
        priority: 10,
        capAmount: 2000,
        capAppliesTo: 'spend',
        capPeriod: 'quarterly',
        postCapRate: 1,
        conditions: [condition('demo-cond-fuel', { categoryIds: [categoryId('gas')] })],
      }),
      baseRule('demo-rule-fuel-base', 'demo-product-fuel', 1),
    ],
  },
  {
    ...CARD_DEFAULTS,
    userCardId: 'demo-card-tappay',
    cardProductId: 'demo-product-tappay',
    displayName: 'DEMO — Northwind TapPay Card',
    issuerName: 'DEMO — Northwind',
    nickname: 'Phone-tap card',
    rules: [
      rule({
        id: 'demo-rule-tappay-3',
        cardProductId: 'demo-product-tappay',
        label: '3% cash back when you pay with a mobile wallet, on up to $1,000 per month',
        bonusRate: 3,
        priority: 10,
        capAmount: 1000,
        capAppliesTo: 'spend',
        capPeriod: 'monthly',
        postCapRate: 1,
        conditions: [
          condition('demo-cond-tappay', {
            includedPaymentMethods: ['apple_pay', 'google_pay', 'contactless_card'],
          }),
        ],
      }),
      baseRule('demo-rule-tappay-base', 'demo-product-tappay', 1),
    ],
  },
  {
    ...CARD_DEFAULTS,
    userCardId: 'demo-card-online',
    cardProductId: 'demo-product-online',
    displayName: 'DEMO — Meridian Online Shopper Card',
    issuerName: 'DEMO — Meridian',
    nickname: 'Online card',
    rules: [
      rule({
        id: 'demo-rule-online-5',
        cardProductId: 'demo-product-online',
        label: '5% cash back on online retail purchases, on up to $3,000 per calendar year',
        bonusRate: 5,
        priority: 10,
        capAmount: 3000,
        capAppliesTo: 'spend',
        capPeriod: 'calendar_year',
        postCapRate: 1,
        conditions: [
          condition('demo-cond-online', {
            categoryIds: [categoryId('online_shopping')],
            channel: 'online',
          }),
        ],
      }),
      baseRule('demo-rule-online-base', 'demo-product-online', 1),
    ],
  },
  {
    ...CARD_DEFAULTS,
    userCardId: 'demo-card-flat',
    cardProductId: 'demo-product-flat',
    displayName: 'DEMO — Cobalt Everyday Flat Card',
    issuerName: 'DEMO — Cobalt',
    nickname: 'Everything card',
    isPreferred: true,
    rules: [
      rule({
        id: 'demo-rule-flat-2',
        cardProductId: 'demo-product-flat',
        label: '2% cash back on every purchase',
        kind: 'base',
        baseRate: 2,
        priority: 100,
      }),
    ],
  },
];

/**
 * Fictional merchants, so typing a name resolves to a category the way it would
 * against the seeded database.
 */
export const DEMO_MERCHANTS: readonly ClassifiableMerchant[] = [
  {
    id: 'demo-merchant-greenleaf',
    displayName: 'DEMO — Greenleaf Market',
    aliases: ['greenleaf', 'greenleaf market', 'green leaf'],
    primaryCategoryId: categoryId('grocery'),
    knownMcc: 5411,
    mccConfidence: 'high',
    hasAmbiguousCoding: false,
    countryCode: 'US',
    isOnlineOnly: false,
  },
  {
    id: 'demo-merchant-fuelstop',
    displayName: 'DEMO — Copperline Fuel',
    aliases: ['copperline', 'copperline fuel', 'copperline gas'],
    primaryCategoryId: categoryId('gas'),
    knownMcc: 5541,
    mccConfidence: 'high',
    hasAmbiguousCoding: false,
    countryCode: 'US',
    isOnlineOnly: false,
  },
  {
    id: 'demo-merchant-parcel',
    displayName: 'DEMO — Parcelby',
    aliases: ['parcelby', 'parcel by'],
    primaryCategoryId: categoryId('online_shopping'),
    knownMcc: 5999,
    mccConfidence: 'medium',
    // A warehouse-club-style merchant that codes inconsistently, so the
    // "we are not certain how this will code" warning is reachable in the demo.
    hasAmbiguousCoding: true,
    countryCode: 'US',
    isOnlineOnly: true,
  },
  {
    id: 'demo-merchant-diner',
    displayName: 'DEMO — Foxglove Diner',
    aliases: ['foxglove', 'foxglove diner'],
    primaryCategoryId: categoryId('dining'),
    knownMcc: 5812,
    mccConfidence: 'high',
    hasAmbiguousCoding: false,
    countryCode: 'US',
    isOnlineOnly: false,
  },
];

/** Every product name in the demo wallet, for the consistency test. */
export const DEMO_PRODUCT_NAMES: readonly string[] = DEMO_CARDS.map((card) => card.displayName);
