/**
 * The details screen's wording is asserted here rather than through a render,
 * because what matters is that the sentence matches the rule it claims to
 * describe. A screen test would confirm text appeared; this confirms it is true.
 */
import {
  CATEGORY,
  MERCHANT,
  card,
  categoryRule,
  condition,
  rule,
} from '@/domain/rewards/__fixtures__/wallet';
import type { Classification } from '@/domain/classifier/types';

import {
  describeCategoryDecision,
  describeCondition,
  describeRuleRequirements,
  describeSource,
  otherRulesOnCard,
} from './ruleFacts';

function classification(overrides: Partial<Classification> = {}): Classification {
  return {
    merchantId: MERCHANT.greenleafMarket,
    resolvedMerchantName: 'Greenleaf Market',
    categoryId: CATEGORY.grocery,
    mcc: 5411,
    matchKind: 'exact_merchant',
    confidence: 'high',
    hasAmbiguousCoding: false,
    alternativeCategoryIds: [],
    disagreesWithUserSelection: false,
    ...overrides,
  };
}

describe('describeCondition', () => {
  it('says nothing about an unconstrained condition', () => {
    expect(describeCondition(condition())).toEqual([]);
  });

  it('names an included category by its display name', () => {
    expect(describeCondition(condition({ categoryIds: [CATEGORY.grocery] }))).toEqual([
      'Category is Grocery',
    ]);
  });

  it('joins several categories the way a person would', () => {
    expect(
      describeCondition(
        condition({ categoryIds: [CATEGORY.dining, CATEGORY.grocery, CATEGORY.gas] }),
      ),
    ).toEqual(['Category is Dining, Grocery and Gas']);
  });

  it('states an exclusion as a negative', () => {
    expect(
      describeCondition(condition({ excludedCategoryIds: [CATEGORY.warehouseClub] })),
    ).toEqual(['Category is not Warehouse club']);
  });

  it('collapses a single-code MCC range to one number', () => {
    expect(describeCondition(condition({ includedMccRanges: [[5411, 5411]] }))).toEqual([
      'Merchant category code is 5411',
    ]);
  });

  it('renders a multi-code MCC range as a span', () => {
    expect(describeCondition(condition({ includedMccRanges: [[5811, 5814]] }))).toEqual([
      'Merchant category code is 5811–5814',
    ]);
  });

  it('combines loose codes and ranges into one statement', () => {
    expect(
      describeCondition(condition({ includedMccs: [5541], includedMccRanges: [[5411, 5411]] })),
    ).toEqual(['Merchant category code is 5541 and 5411']);
  });

  it('counts merchants rather than listing opaque ids', () => {
    // A merchant id means nothing to a user, so the count is the honest summary.
    expect(
      describeCondition(
        condition({
          includedMerchantIds: [MERCHANT.greenleafMarket, MERCHANT.trattoriaNove],
        }),
      ),
    ).toEqual(['Purchase is at one of 2 specific merchants']);

    expect(
      describeCondition(condition({ includedMerchantIds: [MERCHANT.greenleafMarket] })),
    ).toEqual(['Purchase is at one specific merchant']);
  });

  it('makes the excluded-merchant count singular when there is one', () => {
    expect(
      describeCondition(condition({ excludedMerchantIds: [MERCHANT.bulkbarnWarehouse] })),
    ).toEqual(['Purchase is not at 1 excluded merchant']);
  });

  it('describes channel only when it is constrained', () => {
    expect(describeCondition(condition({ channel: 'either' }))).toEqual([]);
    expect(describeCondition(condition({ channel: 'online' }))).toEqual(['Purchase is online']);
    expect(describeCondition(condition({ channel: 'in_store' }))).toEqual([
      'Purchase is in store',
    ]);
  });

  it('spells out the payment methods a mobile-wallet bonus accepts', () => {
    expect(
      describeCondition(
        condition({ includedPaymentMethods: ['apple_pay', 'google_pay', 'samsung_pay'] }),
      ),
    ).toEqual(['Paid by Apple Pay, Google Pay and Samsung Pay']);
  });

  it('formats amount bounds as money', () => {
    expect(describeCondition(condition({ minAmountUsd: 25, maxAmountUsd: 1500 }))).toEqual([
      'Amount is at least $25.00',
      'Amount is at most $1,500.00',
    ]);
  });

  it('mentions a date window without restating the dates', () => {
    expect(
      describeCondition(condition({ startsAt: new Date('2026-07-01T00:00:00.000Z') })),
    ).toEqual(['Purchase falls inside the rule’s date window']);
  });

  it('returns country and currency constraints in a fixed order', () => {
    // Order is asserted deliberately: two renders of the same rule must read the
    // same way, or the screen looks unstable.
    expect(
      describeCondition(
        condition({
          includedCountryCodes: ['US', 'CA'],
          excludedCountryCodes: ['MX'],
          includedCurrencyCodes: ['USD'],
        }),
      ),
    ).toEqual(['Country is US and CA', 'Country is not MX', 'Currency is USD']);
  });
});

describe('describeRuleRequirements', () => {
  it('gathers the conditions and the rule-level requirements', () => {
    const grocery = categoryRule({
      categoryId: CATEGORY.grocery,
      rate: 6,
      capAmount: 6000,
      capPeriod: 'calendar_year',
    });

    expect(describeRuleRequirements(grocery)).toEqual([
      'Category is Grocery',
      '$6,000 of spend per calendar year is the cap',
    ]);
  });

  it('states activation and the spend threshold when the rule has them', () => {
    const activated = rule({
      requiresEnrollment: true,
      spendThresholdUsd: 500,
      conditions: [condition({ categoryIds: [CATEGORY.gas] })],
    });

    expect(describeRuleRequirements(activated)).toEqual([
      'Category is Gas',
      'The bonus is activated on this card',
      'Total spend has passed $500.00',
    ]);
  });

  it('names a reward cap as a reward cap, not a spend cap', () => {
    const rewardCapped = rule({
      capAmount: 300,
      capAppliesTo: 'reward',
      capPeriod: 'monthly',
      conditions: [],
    });

    expect(describeRuleRequirements(rewardCapped)).toContain(
      '$300 of reward per month is the cap',
    );
  });

  it('does not repeat a requirement two condition rows share', () => {
    // A bonus row and an exclusion row both naming the country is legitimate in
    // the schema. Saying "Country is US" twice looks like a bug to a user.
    const doubled = rule({
      conditions: [
        condition({ id: 'c1', includedCountryCodes: ['US'] }),
        condition({ id: 'c2', includedCountryCodes: ['US'], channel: 'online' }),
      ],
    });

    expect(describeRuleRequirements(doubled)).toEqual(['Country is US', 'Purchase is online']);
  });

  it('returns nothing for a rule with no conditions and no cap', () => {
    expect(describeRuleRequirements(rule({ conditions: [] }))).toEqual([]);
  });
});

describe('otherRulesOnCard', () => {
  it('puts the applied rule first and orders the rest by priority', () => {
    const applied = rule({ id: 'r-applied', priority: 50 });
    const higher = rule({ id: 'r-higher', priority: 300 });
    const lower = rule({ id: 'r-lower', priority: 100 });

    const ordered = otherRulesOnCard(card({ rules: [lower, higher, applied] }), 'r-applied');

    expect(ordered.map((entry) => entry.rule.id)).toEqual(['r-applied', 'r-higher', 'r-lower']);
    expect(ordered[0]?.isApplied).toBe(true);
    expect(ordered[1]?.isApplied).toBe(false);
  });

  it('omits inactive rules, which the engine never considered', () => {
    const active = rule({ id: 'r-active' });
    const retired = rule({ id: 'r-retired', isActive: false });

    expect(
      otherRulesOnCard(card({ rules: [active, retired] }), 'r-active').map(
        (entry) => entry.rule.id,
      ),
    ).toEqual(['r-active']);
  });

  it('breaks a priority tie on id, so the order is stable across renders', () => {
    const first = rule({ id: 'aaa', priority: 100 });
    const second = rule({ id: 'bbb', priority: 100 });

    expect(
      otherRulesOnCard(card({ rules: [second, first] }), null).map((entry) => entry.rule.id),
    ).toEqual(['aaa', 'bbb']);
  });

  it('handles a card whose winning rule id is unknown', () => {
    const only = rule({ id: 'r-only' });
    const ordered = otherRulesOnCard(card({ rules: [only] }), null);

    expect(ordered).toHaveLength(1);
    expect(ordered[0]?.isApplied).toBe(false);
  });
});

describe('describeCategoryDecision', () => {
  it('credits the catalog when the merchant is known', () => {
    expect(describeCategoryDecision(classification())).toBe(
      'Greenleaf Market is in our catalog, coded as Grocery.',
    );
  });

  it('names the code when the category came from an MCC', () => {
    expect(
      describeCategoryDecision(
        classification({ matchKind: 'known_mcc', resolvedMerchantName: null }),
      ),
    ).toBe('We used merchant category code 5411, which maps to Grocery.');
  });

  it('is explicit that a user-selected category was not cross-checked', () => {
    expect(
      describeCategoryDecision(
        classification({
          matchKind: 'user_selected',
          merchantId: null,
          resolvedMerchantName: null,
          mcc: null,
        }),
      ),
    ).toBe(
      'We used the category you picked, Grocery. We have no coding on file for this merchant to check it against.',
    );
  });

  it('calls a guess a guess', () => {
    // Understating an inferred match is how a user comes to trust a figure they
    // should not. The wording is deliberately unflattering.
    expect(
      describeCategoryDecision(
        classification({
          matchKind: 'inferred',
          confidence: 'low',
          merchantId: null,
          resolvedMerchantName: null,
          mcc: null,
        }),
      ),
    ).toBe('We guessed Grocery from the merchant name. This is the weakest kind of match.');
  });

  it('says plainly when no category could be worked out', () => {
    expect(
      describeCategoryDecision(
        classification({
          matchKind: 'unknown',
          categoryId: null,
          confidence: 'low',
          merchantId: null,
          resolvedMerchantName: null,
          mcc: null,
        }),
      ),
    ).toBe(
      'We could not work out a category, so only rules that apply to every purchase were considered.',
    );
  });

  it('explains a disagreement by pointing at the issuer, not the user', () => {
    const text = describeCategoryDecision(classification({ disagreesWithUserSelection: true }));

    expect(text).toContain('differs from the category you picked');
    expect(text).toContain('Your issuer decides the category');
  });

  it('lists the other categories the same evidence supports', () => {
    const text = describeCategoryDecision(
      classification({
        matchKind: 'known_mcc',
        mcc: 4111,
        categoryId: CATEGORY.generalTravel,
        alternativeCategoryIds: [CATEGORY.transit],
      }),
    );

    expect(text).toContain('The same evidence would also support Transit.');
  });
});

describe('describeSource', () => {
  it('reports the verification status in words', () => {
    const candidate = {
      verificationStatus: 'user_reported' as const,
    } as Parameters<typeof describeSource>[0];

    expect(describeSource(candidate)).toBe('Source status: Reported by a cardholder.');
  });

  it('admits when no source is recorded', () => {
    const candidate = { verificationStatus: null } as Parameters<typeof describeSource>[0];

    expect(describeSource(candidate)).toBe('No source recorded for this figure.');
  });
});
