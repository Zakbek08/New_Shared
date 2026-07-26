/**
 * Builders for engine tests.
 *
 * Each builder supplies neutral defaults so a test states only the thing it is
 * actually about. A test that reads `rule({ baseRate: 6, capAmount: 6000 })` makes
 * its own premise obvious; one that spells out twenty fields does not.
 *
 * These deliberately mirror the fictional seed catalog, so the engine tests and
 * the demonstration data exercise the same shapes.
 */
import type { CapPeriod, PaymentMethod, RewardType, RewardUnit } from '@/types/database';

import type {
  CapUsageSnapshot,
  EvaluableCard,
  EvaluableCondition,
  EvaluableOffer,
  EvaluableRule,
  EvaluationContext,
  PurchaseIntent,
  RewardValuation,
} from '../types';

/** Fixed reference instant. Every engine test pins time rather than mocking it. */
export const AS_OF = new Date('2026-07-26T14:30:00.000Z');

/** Category ids, matching `supabase/seed/01_reference_taxonomy.sql`. */
export const CATEGORY = {
  dining: '33333333-0000-4000-8000-000000000001',
  grocery: '33333333-0000-4000-8000-000000000002',
  gas: '33333333-0000-4000-8000-000000000003',
  airfare: '33333333-0000-4000-8000-000000000004',
  hotel: '33333333-0000-4000-8000-000000000005',
  generalTravel: '33333333-0000-4000-8000-000000000006',
  transit: '33333333-0000-4000-8000-000000000007',
  onlineShopping: '33333333-0000-4000-8000-000000000009',
  warehouseClub: '33333333-0000-4000-8000-000000000011',
} as const;

export const MERCHANT = {
  greenleafMarket: '44444444-0000-4000-8000-000000000001',
  bulkbarnWarehouse: '44444444-0000-4000-8000-000000000002',
  trattoriaNove: '44444444-0000-4000-8000-000000000003',
  fuelworks: '44444444-0000-4000-8000-000000000005',
  fuelworksExpress: '44444444-0000-4000-8000-000000000006',
  summitSkyAirways: '44444444-0000-4000-8000-000000000007',
  harborlineGrand: '44444444-0000-4000-8000-000000000008',
} as const;

export const PROGRAM = {
  cobaltPoints: '22222222-0000-4000-8000-000000000002',
  meridianMiles: '22222222-0000-4000-8000-000000000005',
  harborlineStayPoints: '22222222-0000-4000-8000-000000000006',
  summitSkyMiles: '22222222-0000-4000-8000-000000000008',
} as const;

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

/** An unconstrained condition row. Every array empty means "no constraint". */
export function condition(overrides: Partial<EvaluableCondition> = {}): EvaluableCondition {
  return {
    id: 'condition-1',
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** The reward type implied by a unit, for the common rate-based cases. */
const rewardTypeForUnit = (unit: RewardUnit): RewardType =>
  unit === 'usd'
    ? 'cash_back_percent'
    : unit === 'points'
      ? 'points_per_dollar'
      : 'miles_per_dollar';

export function rule(overrides: Partial<EvaluableRule> = {}): EvaluableRule {
  const rewardUnit = overrides.rewardUnit ?? 'usd';

  return {
    id: 'rule-1',
    cardProductId: 'product-1',
    rewardProgramId: null,
    label: 'Test rule',
    kind: 'category_bonus',
    rewardType: rewardTypeForUnit(rewardUnit),
    rewardUnit,
    baseRate: 1,
    bonusRate: 0,
    fixedAmountUsd: null,
    priority: 100,
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
    ...overrides,
  };
}

/** A card's everything-else rule: unconditional, low priority. */
export function baseRule(rate: number, overrides: Partial<EvaluableRule> = {}): EvaluableRule {
  return rule({
    id: 'rule-base',
    label: `${rate}% cash back on everything else`,
    kind: 'base',
    baseRate: rate,
    priority: 10,
    ...overrides,
  });
}

/** A capped category bonus, the shape most of the catalog uses. */
export function categoryRule(options: {
  readonly id?: string;
  readonly categoryId: string;
  readonly rate: number;
  readonly capAmount?: number | null;
  readonly capPeriod?: CapPeriod;
  readonly postCapRate?: number | null;
  readonly excludedMerchantIds?: readonly string[];
  readonly unit?: RewardUnit;
  readonly programId?: string | null;
}): EvaluableRule {
  return rule({
    id: options.id ?? 'rule-category',
    label: `${options.rate}% on that category`,
    baseRate: options.rate,
    priority: 100,
    rewardUnit: options.unit ?? 'usd',
    rewardProgramId: options.programId ?? null,
    capAmount: options.capAmount ?? null,
    capPeriod: options.capPeriod ?? (options.capAmount == null ? 'none' : 'calendar_year'),
    postCapRate: options.postCapRate ?? null,
    conditions: [
      condition({
        categoryIds: [options.categoryId],
        excludedMerchantIds: options.excludedMerchantIds ?? [],
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export function card(overrides: Partial<EvaluableCard> = {}): EvaluableCard {
  return {
    userCardId: 'card-1',
    cardProductId: 'product-1',
    displayName: 'Test Card',
    issuerName: 'Test Bank',
    nickname: null,
    annualFeeUsd: 0,
    foreignTransactionFeePercent: 0,
    supportedCountryCodes: ['US'],
    isPreferred: false,
    isExcludedFromRecommendations: false,
    accountOpenedOn: null,
    rules: [baseRule(1)],
    enrollments: {},
    capUsage: {},
    offers: [],
    ...overrides,
  };
}

/** A flat-rate card, the usual fallback in a ranking test. */
export function flatCard(rate: number, overrides: Partial<EvaluableCard> = {}): EvaluableCard {
  return card({
    userCardId: `flat-${rate}`,
    displayName: `Flat ${rate}% Card`,
    rules: [
      baseRule(rate, {
        id: `flat-${rate}-base`,
        label: `${rate}% cash back on every purchase`,
      }),
    ],
    ...overrides,
  });
}

export function capUsage(overrides: Partial<CapUsageSnapshot> = {}): CapUsageSnapshot {
  return {
    // Defaults to the calendar year containing AS_OF, the commonest cap window.
    periodStart: new Date('2026-01-01T00:00:00.000Z'),
    periodEnd: new Date('2027-01-01T00:00:00.000Z'),
    qualifyingSpendUsd: 0,
    accruedRewardUsd: 0,
    ...overrides,
  };
}

export function offer(overrides: Partial<EvaluableOffer> = {}): EvaluableOffer {
  return {
    id: 'offer-1',
    title: 'Test offer',
    merchantId: null,
    merchantLabel: null,
    rewardType: 'cash_back_percent',
    rewardUnit: 'usd',
    rate: 0,
    fixedAmountUsd: null,
    minimumSpendUsd: 0,
    maxBenefitUsd: null,
    channel: 'either',
    startsAt: null,
    endsAt: null,
    isEnrolled: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Purchase and context
// ---------------------------------------------------------------------------

/**
 * A well-known purchase: $120 of groceries at a supermarket, in store, in the US.
 *
 * This is the specification's own worked example, so most tests can vary one field
 * from it rather than restating the whole thing.
 */
export function intent(overrides: Partial<PurchaseIntent> = {}): PurchaseIntent {
  return {
    merchantInput: 'Greenleaf Market',
    amountUsd: 120,
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
    ...overrides,
  };
}

export function valuation(overrides: Partial<RewardValuation> = {}): RewardValuation {
  return {
    byProgramId: {},
    // Deliberately explicit, so a test that cares about the fallback path has to
    // opt out rather than rely on an accident.
    byUnit: { usd: 1, points: 1, miles: 1 },
    prefersCashBackOnly: false,
    minimumSwitchBenefitUsd: 0,
    ...overrides,
  };
}

export function context(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    asOf: AS_OF,
    homeCurrencyCode: 'USD',
    valuation: valuation(),
    ...overrides,
  };
}

/** Convenience for a mobile-wallet payment method in a test. */
export const APPLE_PAY: PaymentMethod = 'apple_pay';
