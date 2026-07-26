/**
 * The database-to-engine boundary.
 *
 * Everything the engine decides rests on this mapping being faithful. A wrong
 * `null` here becomes a silently missing bonus; a wrong MCC range becomes a bonus
 * paid where it should not be. Both are invisible in the UI, so they are pinned
 * here instead.
 *
 * `toCard` and `toCondition` are exported for exactly this purpose — the network
 * call around them is not the part that can be subtly wrong.
 */
import type {
  CardProductRow,
  RewardRuleConditionRow,
  RewardRuleRow,
  RewardUnit,
  RewardUsageRow,
  UserCardRow,
  UserOfferRow,
  UserRewardPreferenceRow,
  UserRuleEnrollmentRow,
} from '@/types/database';

import {
  buildValuation,
  __toCardForTests as toCard,
  __toConditionForTests as toCondition,
} from './snapshot';

const CATEGORY_GROCERY = '33333333-0000-4000-8000-000000000002';
const CATEGORY_GAS = '33333333-0000-4000-8000-000000000003';

function conditionRow(overrides: Partial<RewardRuleConditionRow> = {}): RewardRuleConditionRow {
  return {
    id: 'condition-1',
    reward_rule_id: 'rule-1',
    merchant_category_id: null,
    included_category_ids: [],
    excluded_category_ids: [],
    included_mccs: [],
    included_mcc_ranges: [],
    excluded_mccs: [],
    included_merchant_ids: [],
    excluded_merchant_ids: [],
    included_country_codes: [],
    excluded_country_codes: [],
    included_currency_codes: [],
    channel: 'either',
    included_payment_methods: [],
    starts_at: null,
    ends_at: null,
    min_amount_usd: null,
    max_amount_usd: null,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function ruleRow(
  overrides: Partial<RewardRuleRow> = {},
  conditions: RewardRuleConditionRow[] = [],
): RewardRuleRow & { reward_rule_conditions: RewardRuleConditionRow[] } {
  return {
    id: 'rule-1',
    card_product_id: 'product-1',
    reward_program_id: null,
    label: '1% cash back on everything else',
    kind: 'base',
    reward_type: 'cash_back_percent',
    reward_unit: 'usd',
    base_rate: 1,
    bonus_rate: 0,
    fixed_amount_usd: null,
    priority: 10,
    stack_group: 'category',
    is_stackable: false,
    cap_amount: null,
    cap_applies_to: 'spend',
    cap_period: 'none',
    post_cap_rate: null,
    starts_at: null,
    ends_at: null,
    requires_enrollment: false,
    enrollment_url: null,
    enrollment_notes: null,
    spend_threshold_usd: null,
    source_id: null,
    last_verified_at: '2026-07-01T00:00:00.000Z',
    verification_status: 'verified',
    is_active: true,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
    reward_rule_conditions: conditions,
  };
}

function productRow(overrides: Partial<CardProductRow> = {}): CardProductRow {
  return {
    id: 'product-1',
    slug: 'demo-card',
    issuer_id: 'issuer-1',
    custom_issuer_name: null,
    reward_program_id: 'program-1',
    name: 'DEMO — Test Card',
    card_kind: 'personal_credit',
    network: 'other',
    annual_fee_usd: 95,
    foreign_transaction_fee_percent: 3,
    supported_country_codes: ['US'],
    summary: null,
    is_user_defined: false,
    created_by: null,
    is_fictional: true,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function usageRow(overrides: Partial<RewardUsageRow> = {}): RewardUsageRow {
  return {
    id: 'usage-1',
    user_id: 'user-1',
    user_card_id: 'user-card-1',
    reward_rule_id: 'rule-1',
    period_start: '2026-01-01T00:00:00.000Z',
    period_end: '2027-01-01T00:00:00.000Z',
    cap_period: 'calendar_year',
    qualifying_spend_usd: 0,
    accrued_reward_units: 0,
    accrued_reward_usd: 0,
    is_user_adjusted: false,
    last_recorded_at: '2026-07-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function offerRow(overrides: Partial<UserOfferRow> = {}): UserOfferRow {
  return {
    id: 'offer-1',
    user_id: 'user-1',
    user_card_id: 'user-card-1',
    merchant_id: null,
    merchant_label: 'Greenleaf Market',
    title: '$10 back',
    description: null,
    reward_type: 'statement_credit',
    reward_unit: 'usd',
    rate: 0,
    fixed_amount_usd: 10,
    minimum_spend_usd: 50,
    max_benefit_usd: null,
    status: 'available',
    channel: 'either',
    starts_at: null,
    ends_at: null,
    enrolled_at: null,
    redeemed_at: null,
    is_user_entered: true,
    source_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function enrollmentRow(overrides: Partial<UserRuleEnrollmentRow> = {}): UserRuleEnrollmentRow {
  return {
    id: 'enrollment-1',
    user_id: 'user-1',
    user_card_id: 'user-card-1',
    reward_rule_id: 'rule-1',
    status: 'enrolled',
    enrolled_at: '2026-07-01T00:00:00.000Z',
    period_start: null,
    period_end: null,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as UserRuleEnrollmentRow;
}

/** A whole snapshot row, in the nested shape PostgREST returns. */
function snapshotRow(
  overrides: {
    readonly card?: Partial<UserCardRow>;
    readonly product?: Partial<CardProductRow> | null;
    readonly rules?: (RewardRuleRow & { reward_rule_conditions: RewardRuleConditionRow[] })[];
    readonly issuerName?: string | null;
    readonly enrollments?: UserRuleEnrollmentRow[];
    readonly offers?: UserOfferRow[];
    readonly usage?: RewardUsageRow[];
  } = {},
) {
  const base: UserCardRow = {
    id: 'user-card-1',
    user_id: 'user-1',
    card_product_id: 'product-1',
    nickname: null,
    last_four_cipher: null,
    last_four_key_id: null,
    display_order: 0,
    is_archived: false,
    is_excluded_from_recommendations: false,
    account_opened_on: '2024-03-14',
    is_preferred: false,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides.card,
  };

  return {
    ...base,
    card_products:
      overrides.product === null
        ? null
        : {
            ...productRow(overrides.product ?? {}),
            issuers:
              overrides.issuerName === undefined
                ? { name: 'DEMO — Test Bank' }
                : overrides.issuerName === null
                  ? null
                  : { name: overrides.issuerName },
            reward_programs: {
              id: 'program-1',
              unit: 'points' as RewardUnit,
              default_cents_per_unit: 1,
            },
            reward_rules: overrides.rules ?? [ruleRow()],
          },
    user_rule_enrollments: overrides.enrollments ?? [],
    user_offers: overrides.offers ?? [],
    reward_usage: overrides.usage ?? [],
  } as Parameters<typeof toCard>[0];
}

describe('toCondition', () => {
  it('unions the scalar category with the array, without duplicating', () => {
    // The schema offers both so a single-category rule stays readable in the admin
    // UI. Reading only one of them would silently narrow the rule.
    const condition = toCondition(
      conditionRow({
        merchant_category_id: CATEGORY_GROCERY,
        included_category_ids: [CATEGORY_GROCERY, CATEGORY_GAS],
      }),
    );

    expect(condition.categoryIds).toEqual([CATEGORY_GROCERY, CATEGORY_GAS]);
  });

  it('reads the scalar category on its own', () => {
    expect(
      toCondition(conditionRow({ merchant_category_id: CATEGORY_GROCERY })).categoryIds,
    ).toEqual([CATEGORY_GROCERY]);
  });

  it('converts half-open MCC ranges to the inclusive form the engine expects', () => {
    // `[5411,5412)` from Postgres is the single code 5411, not 5411 through 5412.
    expect(
      toCondition(conditionRow({ included_mcc_ranges: ['[5411,5412)'] })).includedMccRanges,
    ).toEqual([[5411, 5411]]);
  });

  it('parses timestamps into Dates', () => {
    const condition = toCondition(
      conditionRow({
        starts_at: '2026-07-01T00:00:00.000Z',
        ends_at: '2026-10-01T00:00:00.000Z',
      }),
    );

    expect(condition.startsAt).toEqual(new Date('2026-07-01T00:00:00.000Z'));
    expect(condition.endsAt).toEqual(new Date('2026-10-01T00:00:00.000Z'));
  });

  it('keeps a null date as null rather than turning it into the epoch', () => {
    const condition = toCondition(conditionRow());
    expect(condition.startsAt).toBeNull();
    expect(condition.endsAt).toBeNull();
  });

  it('carries every constraint column through', () => {
    const condition = toCondition(
      conditionRow({
        excluded_category_ids: [CATEGORY_GAS],
        included_mccs: [5411],
        excluded_mccs: [5300],
        included_merchant_ids: ['merchant-a'],
        excluded_merchant_ids: ['merchant-b'],
        included_country_codes: ['US'],
        excluded_country_codes: ['MX'],
        included_currency_codes: ['USD'],
        channel: 'online',
        included_payment_methods: ['apple_pay'],
        min_amount_usd: 25,
        max_amount_usd: 500,
      }),
    );

    expect(condition).toMatchObject({
      excludedCategoryIds: [CATEGORY_GAS],
      includedMccs: [5411],
      excludedMccs: [5300],
      includedMerchantIds: ['merchant-a'],
      excludedMerchantIds: ['merchant-b'],
      includedCountryCodes: ['US'],
      excludedCountryCodes: ['MX'],
      includedCurrencyCodes: ['USD'],
      channel: 'online',
      includedPaymentMethods: ['apple_pay'],
      minAmountUsd: 25,
      maxAmountUsd: 500,
    });
  });
});

describe('toCard', () => {
  it('maps the product, issuer and fee fields', () => {
    const card = toCard(snapshotRow());

    expect(card).toMatchObject({
      userCardId: 'user-card-1',
      cardProductId: 'product-1',
      displayName: 'DEMO — Test Card',
      issuerName: 'DEMO — Test Bank',
      annualFeeUsd: 95,
      foreignTransactionFeePercent: 3,
      supportedCountryCodes: ['US'],
    });
    expect(card.accountOpenedOn).toEqual(new Date('2024-03-14'));
  });

  it('prefers the nickname in the display name', () => {
    const card = toCard(snapshotRow({ card: { nickname: 'Grocery card' } }));

    expect(card.displayName).toContain('Grocery card');
    expect(card.nickname).toBe('Grocery card');
  });

  it('falls back to the custom issuer name on a user-defined product', () => {
    // `issuers` is catalog-editor-only by RLS, so a user-created product carries its
    // issuer as free text instead. Showing "Unknown issuer" here would look broken.
    const card = toCard(
      snapshotRow({
        product: {
          issuer_id: null,
          custom_issuer_name: 'My Credit Union',
          is_user_defined: true,
        },
        issuerName: null,
      }),
    );

    expect(card.issuerName).toBe('My Credit Union');
  });

  it('says "Unknown" rather than crashing when the product join is empty', () => {
    // An RLS-filtered or deleted product should degrade, not blank the wallet.
    const card = toCard(snapshotRow({ product: null }));

    expect(card.displayName).toBe('Unknown card');
    expect(card.issuerName).toBe('Unknown issuer');
    expect(card.rules).toEqual([]);
    expect(card.supportedCountryCodes).toEqual([]);
  });

  it('drops inactive rules, which the engine must never consider', () => {
    const card = toCard(
      snapshotRow({
        rules: [ruleRow({ id: 'active' }), ruleRow({ id: 'retired', is_active: false })],
      }),
    );

    expect(card.rules.map((rule) => rule.id)).toEqual(['active']);
  });

  it('treats anything other than "enrolled" as not enrolled', () => {
    // Enrollment is self-reported, and claiming a bonus the user has not activated
    // costs them real money. The conservative reading is the only safe one.
    const card = toCard(
      snapshotRow({
        enrollments: [
          enrollmentRow({ reward_rule_id: 'r-yes', status: 'enrolled' }),
          enrollmentRow({ id: 'e2', reward_rule_id: 'r-not', status: 'not_enrolled' }),
          enrollmentRow({ id: 'e3', reward_rule_id: 'r-unknown', status: 'unknown' }),
        ],
      }),
    );

    expect(card.enrollments).toEqual({
      'r-yes': true,
      'r-not': false,
      'r-unknown': false,
    });
  });

  it('keeps only the most recent usage row per rule', () => {
    const card = toCard(
      snapshotRow({
        usage: [
          usageRow({
            id: 'old',
            period_start: '2025-01-01T00:00:00.000Z',
            period_end: '2026-01-01T00:00:00.000Z',
            qualifying_spend_usd: 5000,
          }),
          usageRow({
            id: 'current',
            period_start: '2026-01-01T00:00:00.000Z',
            period_end: '2027-01-01T00:00:00.000Z',
            qualifying_spend_usd: 1200,
          }),
        ],
      }),
    );

    expect(card.capUsage['rule-1']?.qualifyingSpendUsd).toBe(1200);
    expect(card.capUsage['rule-1']?.periodStart).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('keeps the newest usage row regardless of the order it arrives in', () => {
    const card = toCard(
      snapshotRow({
        usage: [
          usageRow({
            id: 'current',
            period_start: '2026-01-01T00:00:00.000Z',
            qualifying_spend_usd: 1200,
          }),
          usageRow({
            id: 'old',
            period_start: '2025-01-01T00:00:00.000Z',
            qualifying_spend_usd: 5000,
          }),
        ],
      }),
    );

    expect(card.capUsage['rule-1']?.qualifyingSpendUsd).toBe(1200);
  });

  it('includes available and enrolled offers, and excludes the rest', () => {
    const card = toCard(
      snapshotRow({
        offers: [
          offerRow({ id: 'available', status: 'available' }),
          offerRow({
            id: 'enrolled',
            status: 'enrolled',
            enrolled_at: '2026-07-01T00:00:00.000Z',
          }),
          offerRow({ id: 'redeemed', status: 'redeemed' }),
          offerRow({ id: 'expired', status: 'expired' }),
        ],
      }),
    );

    expect(card.offers.map((offer) => offer.id)).toEqual(['available', 'enrolled']);
    expect(card.offers.find((offer) => offer.id === 'available')?.isEnrolled).toBe(false);
    expect(card.offers.find((offer) => offer.id === 'enrolled')?.isEnrolled).toBe(true);
  });

  it('keeps a card the user excluded, so the engine can say why it was skipped', () => {
    const card = toCard(
      snapshotRow({ card: { is_excluded_from_recommendations: true, is_preferred: true } }),
    );

    expect(card.isExcludedFromRecommendations).toBe(true);
    expect(card.isPreferred).toBe(true);
  });

  it('nests each rule’s conditions under it', () => {
    const card = toCard(
      snapshotRow({
        rules: [
          ruleRow({ id: 'bonus', base_rate: 6 }, [
            conditionRow({ id: 'c1', merchant_category_id: CATEGORY_GROCERY }),
          ]),
        ],
      }),
    );

    expect(card.rules[0]?.conditions).toHaveLength(1);
    expect(card.rules[0]?.conditions[0]?.categoryIds).toEqual([CATEGORY_GROCERY]);
  });

  it('parses rule dates and the verification timestamp', () => {
    const card = toCard(
      snapshotRow({
        rules: [
          ruleRow({
            starts_at: '2026-07-01T00:00:00.000Z',
            ends_at: '2026-10-01T00:00:00.000Z',
            last_verified_at: '2026-07-01T00:00:00.000Z',
          }),
        ],
      }),
    );

    expect(card.rules[0]?.startsAt).toEqual(new Date('2026-07-01T00:00:00.000Z'));
    expect(card.rules[0]?.endsAt).toEqual(new Date('2026-10-01T00:00:00.000Z'));
    expect(card.rules[0]?.lastVerifiedAt).toEqual(new Date('2026-07-01T00:00:00.000Z'));
  });
});

describe('buildValuation', () => {
  function preference(
    overrides: Partial<UserRewardPreferenceRow> = {},
  ): UserRewardPreferenceRow {
    return {
      id: 'pref-1',
      user_id: 'user-1',
      reward_program_id: null,
      unit: 'points',
      cents_per_unit: 1,
      prefers_cash_back_only: false,
      minimum_switch_benefit_usd: 0,
      notes: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('uses the catalog default when the user has said nothing', () => {
    const valuation = buildValuation(
      [],
      new Map([['program-1', { unit: 'points', centsPerUnit: 1.25 }]]),
    );

    expect(valuation.byProgramId['program-1']).toBe(1.25);
    expect(valuation.byUnit).toEqual({ usd: 1, points: 1, miles: 1 });
  });

  it('lets a user preference override the catalog default', () => {
    const valuation = buildValuation(
      [preference({ reward_program_id: 'program-1', cents_per_unit: 0.8 })],
      new Map([['program-1', { unit: 'points', centsPerUnit: 1.25 }]]),
    );

    expect(valuation.byProgramId['program-1']).toBe(0.8);
  });

  it('honours an explicit valuation of zero', () => {
    // Someone who says a currency is worthless to them means it. Folding the
    // defaults in first is what makes a user's `0` win over the catalog's 1.25¢
    // rather than being read as "no preference set".
    const valuation = buildValuation(
      [preference({ reward_program_id: 'program-1', cents_per_unit: 0 })],
      new Map([['program-1', { unit: 'points', centsPerUnit: 1.25 }]]),
    );

    expect(valuation.byProgramId['program-1']).toBe(0);
  });

  it('treats a null program as the user’s default for that unit', () => {
    const valuation = buildValuation(
      [preference({ reward_program_id: null, unit: 'miles', cents_per_unit: 1.1 })],
      new Map(),
    );

    expect(valuation.byUnit.miles).toBe(1.1);
    expect(valuation.byProgramId).toEqual({});
  });

  it('applies cash-back-only if it is set on any row', () => {
    const valuation = buildValuation(
      [
        preference({ id: 'a', prefers_cash_back_only: false }),
        preference({ id: 'b', reward_program_id: 'program-2', prefers_cash_back_only: true }),
      ],
      new Map(),
    );

    expect(valuation.prefersCashBackOnly).toBe(true);
  });

  it('takes the highest switch threshold across rows', () => {
    // The threshold is a wallet-wide preference stored per row, so the strictest
    // value the user has expressed is the one to respect.
    const valuation = buildValuation(
      [
        preference({ id: 'a', minimum_switch_benefit_usd: 0.25 }),
        preference({ id: 'b', reward_program_id: 'p2', minimum_switch_benefit_usd: 1 }),
      ],
      new Map(),
    );

    expect(valuation.minimumSwitchBenefitUsd).toBe(1);
  });

  it('defaults to a zero threshold and cash-back-agnostic when unset', () => {
    const valuation = buildValuation([], new Map());

    expect(valuation.minimumSwitchBenefitUsd).toBe(0);
    expect(valuation.prefersCashBackOnly).toBe(false);
  });
});
