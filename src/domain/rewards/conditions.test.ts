import { CATEGORY, MERCHANT, AS_OF, condition, intent, rule } from './__fixtures__/wallet';
import {
  matchesCondition,
  matchesRule,
  mostInformativeCode,
  windowContains,
} from './conditions';

const outcome = (result: ReturnType<typeof matchesCondition>) =>
  result.matched ? 'matched' : result.code;

describe('windowContains', () => {
  it('includes the start bound and excludes the end bound', () => {
    const starts = new Date('2026-07-01T00:00:00.000Z');
    const ends = new Date('2026-10-01T00:00:00.000Z');

    expect(windowContains(starts, ends, starts).matched).toBe(true);
    expect(windowContains(starts, ends, new Date('2026-09-30T23:59:59.999Z')).matched).toBe(
      true,
    );
    // Exactly at the end instant the quarter is over.
    expect(outcome(windowContains(starts, ends, ends))).toBe('rule_expired');
  });

  it('reports a future window as not yet active', () => {
    expect(outcome(windowContains(new Date('2026-10-01T00:00:00.000Z'), null, AS_OF))).toBe(
      'rule_not_yet_active',
    );
  });

  it('treats null bounds as open-ended', () => {
    expect(windowContains(null, null, AS_OF).matched).toBe(true);
    expect(windowContains(null, new Date('2027-01-01T00:00:00.000Z'), AS_OF).matched).toBe(
      true,
    );
  });
});

describe('matchesCondition — empty arrays are no constraint', () => {
  it('matches anything when every field is empty', () => {
    expect(matchesCondition(condition(), intent(), AS_OF).matched).toBe(true);
  });

  it('matches a purchase with no category, merchant or MCC at all', () => {
    expect(
      matchesCondition(
        condition(),
        intent({ categoryId: null, merchantId: null, mcc: null }),
        AS_OF,
      ).matched,
    ).toBe(true);
  });
});

describe('matchesCondition — category', () => {
  it('matches a category in the OR-list', () => {
    const multi = condition({
      categoryIds: [CATEGORY.airfare, CATEGORY.hotel, CATEGORY.transit],
    });

    expect(matchesCondition(multi, intent({ categoryId: CATEGORY.hotel }), AS_OF).matched).toBe(
      true,
    );
    expect(
      matchesCondition(multi, intent({ categoryId: CATEGORY.transit }), AS_OF).matched,
    ).toBe(true);
  });

  it('rejects a category outside the list', () => {
    expect(
      outcome(
        matchesCondition(
          condition({ categoryIds: [CATEGORY.grocery] }),
          intent({ categoryId: CATEGORY.dining }),
          AS_OF,
        ),
      ),
    ).toBe('category_mismatch');
  });

  it('rejects a missing category rather than guessing one to fit', () => {
    expect(
      outcome(
        matchesCondition(
          condition({ categoryIds: [CATEGORY.grocery] }),
          intent({ categoryId: null }),
          AS_OF,
        ),
      ),
    ).toBe('category_mismatch');
  });

  it('rejects an explicitly excluded category', () => {
    expect(
      outcome(
        matchesCondition(
          condition({ excludedCategoryIds: [CATEGORY.warehouseClub] }),
          intent({ categoryId: CATEGORY.warehouseClub }),
          AS_OF,
        ),
      ),
    ).toBe('category_mismatch');
  });
});

describe('matchesCondition — MCC', () => {
  it('matches an MCC in the explicit list', () => {
    expect(
      matchesCondition(condition({ includedMccs: [5411, 5422] }), intent({ mcc: 5422 }), AS_OF)
        .matched,
    ).toBe(true);
  });

  it('matches an MCC inside an inclusive range', () => {
    const ranged = condition({ includedMccRanges: [[5811, 5814]] });
    for (const mcc of [5811, 5812, 5814]) {
      expect(matchesCondition(ranged, intent({ mcc }), AS_OF).matched).toBe(true);
    }
    expect(outcome(matchesCondition(ranged, intent({ mcc: 5815 }), AS_OF))).toBe(
      'mcc_mismatch',
    );
  });

  it('rejects a missing MCC when the rule constrains it', () => {
    expect(
      outcome(
        matchesCondition(condition({ includedMccs: [5411] }), intent({ mcc: null }), AS_OF),
      ),
    ).toBe('mcc_mismatch');
  });

  it('rejects an excluded MCC even when it is also included', () => {
    // Exclusions are absolute.
    expect(
      outcome(
        matchesCondition(
          condition({ includedMccs: [5411], excludedMccs: [5411] }),
          intent({ mcc: 5411 }),
          AS_OF,
        ),
      ),
    ).toBe('mcc_mismatch');
  });
});

describe('matchesCondition — merchant', () => {
  it('matches a merchant in the include list', () => {
    expect(
      matchesCondition(
        condition({ includedMerchantIds: [MERCHANT.harborlineGrand] }),
        intent({ merchantId: MERCHANT.harborlineGrand }),
        AS_OF,
      ).matched,
    ).toBe(true);
  });

  it('rejects a merchant outside a non-empty include list', () => {
    expect(
      outcome(
        matchesCondition(
          condition({ includedMerchantIds: [MERCHANT.harborlineGrand] }),
          intent({ merchantId: MERCHANT.greenleafMarket }),
          AS_OF,
        ),
      ),
    ).toBe('merchant_not_included');
  });

  it('rejects an excluded merchant — the warehouse-club case', () => {
    // "6% at supermarkets, but not warehouse clubs" is expressed this way.
    expect(
      outcome(
        matchesCondition(
          condition({
            categoryIds: [CATEGORY.grocery],
            excludedMerchantIds: [MERCHANT.bulkbarnWarehouse],
          }),
          intent({ merchantId: MERCHANT.bulkbarnWarehouse, categoryId: CATEGORY.grocery }),
          AS_OF,
        ),
      ),
    ).toBe('merchant_excluded');
  });

  it('reports the exclusion, not the category, when both would fail', () => {
    // The exclusion is the more useful thing to tell a user.
    expect(
      outcome(
        matchesCondition(
          condition({
            categoryIds: [CATEGORY.dining],
            excludedMerchantIds: [MERCHANT.bulkbarnWarehouse],
          }),
          intent({ merchantId: MERCHANT.bulkbarnWarehouse, categoryId: CATEGORY.grocery }),
          AS_OF,
        ),
      ),
    ).toBe('merchant_excluded');
  });
});

describe('matchesCondition — geography and currency', () => {
  it('matches a country in the include list, case-insensitively', () => {
    const us = condition({ includedCountryCodes: ['US'] });
    expect(matchesCondition(us, intent({ countryCode: 'us' }), AS_OF).matched).toBe(true);
  });

  it('rejects a country outside the include list', () => {
    expect(
      outcome(
        matchesCondition(
          condition({ includedCountryCodes: ['US'] }),
          intent({ countryCode: 'FR' }),
          AS_OF,
        ),
      ),
    ).toBe('country_not_supported');
  });

  it('rejects an excluded country', () => {
    expect(
      outcome(
        matchesCondition(
          condition({ excludedCountryCodes: ['FR'] }),
          intent({ countryCode: 'fr' }),
          AS_OF,
        ),
      ),
    ).toBe('country_not_supported');
  });

  it('rejects a currency outside the include list', () => {
    expect(
      outcome(
        matchesCondition(
          condition({ includedCurrencyCodes: ['USD'] }),
          intent({ currencyCode: 'EUR' }),
          AS_OF,
        ),
      ),
    ).toBe('currency_not_supported');
  });
});

describe('matchesCondition — channel', () => {
  it('either matches both channels', () => {
    const either = condition({ channel: 'either' });
    expect(matchesCondition(either, intent({ channel: 'online' }), AS_OF).matched).toBe(true);
    expect(matchesCondition(either, intent({ channel: 'in_store' }), AS_OF).matched).toBe(true);
  });

  it('online-only rejects an in-store purchase', () => {
    expect(
      outcome(
        matchesCondition(
          condition({ channel: 'online' }),
          intent({ channel: 'in_store' }),
          AS_OF,
        ),
      ),
    ).toBe('channel_mismatch');
  });

  it('in-store-only rejects an online purchase', () => {
    expect(
      outcome(
        matchesCondition(
          condition({ channel: 'in_store' }),
          intent({ channel: 'online' }),
          AS_OF,
        ),
      ),
    ).toBe('channel_mismatch');
  });
});

describe('matchesCondition — payment method', () => {
  const mobileWallet = condition({
    includedPaymentMethods: ['apple_pay', 'google_pay', 'samsung_pay'],
  });

  it('matches each mobile wallet', () => {
    for (const method of ['apple_pay', 'google_pay', 'samsung_pay'] as const) {
      expect(
        matchesCondition(mobileWallet, intent({ paymentMethod: method }), AS_OF).matched,
      ).toBe(true);
    }
  });

  it('rejects a contactless tap of the physical card', () => {
    // Deliberate: a card tap is not a mobile wallet on these products.
    expect(
      outcome(
        matchesCondition(mobileWallet, intent({ paymentMethod: 'contactless_card' }), AS_OF),
      ),
    ).toBe('payment_method_mismatch');
  });

  it('rejects a swipe', () => {
    expect(
      outcome(
        matchesCondition(mobileWallet, intent({ paymentMethod: 'physical_card' }), AS_OF),
      ),
    ).toBe('payment_method_mismatch');
  });
});

describe('matchesCondition — amount bounds', () => {
  it('accepts an amount exactly at the minimum', () => {
    expect(
      matchesCondition(condition({ minAmountUsd: 100 }), intent({ amountUsd: 100 }), AS_OF)
        .matched,
    ).toBe(true);
  });

  it('rejects an amount below the minimum', () => {
    expect(
      outcome(
        matchesCondition(condition({ minAmountUsd: 100 }), intent({ amountUsd: 99.99 }), AS_OF),
      ),
    ).toBe('amount_below_minimum');
  });

  it('accepts an amount exactly at the maximum', () => {
    expect(
      matchesCondition(condition({ maxAmountUsd: 500 }), intent({ amountUsd: 500 }), AS_OF)
        .matched,
    ).toBe(true);
  });

  it('rejects an amount above the maximum', () => {
    expect(
      outcome(
        matchesCondition(
          condition({ maxAmountUsd: 500 }),
          intent({ amountUsd: 500.01 }),
          AS_OF,
        ),
      ),
    ).toBe('amount_above_maximum');
  });
});

describe('matchesRule', () => {
  it('an unconditional rule always qualifies', () => {
    expect(matchesRule(rule({ conditions: [] }), intent(), AS_OF).matched).toBe(true);
  });

  it('ANDs every condition row', () => {
    // Grocery AND online. An in-store grocery purchase fails the second row.
    const twoRows = rule({
      conditions: [
        condition({ id: 'a', categoryIds: [CATEGORY.grocery] }),
        condition({ id: 'b', channel: 'online' }),
      ],
    });

    expect(matchesRule(twoRows, intent({ channel: 'online' }), AS_OF).matched).toBe(true);
    expect(outcome(matchesRule(twoRows, intent({ channel: 'in_store' }), AS_OF))).toBe(
      'channel_mismatch',
    );
  });

  it('checks the rule window as well as the conditions', () => {
    expect(
      outcome(
        matchesRule(rule({ endsAt: new Date('2026-07-01T00:00:00.000Z') }), intent(), AS_OF),
      ),
    ).toBe('rule_expired');
  });

  it('lets a condition window be narrower than the rule window', () => {
    // Q3 conditions on a rule valid all year: outside Q3 the condition governs.
    const quarterly = rule({
      startsAt: new Date('2026-01-01T00:00:00.000Z'),
      endsAt: new Date('2027-01-01T00:00:00.000Z'),
      conditions: [
        condition({
          startsAt: new Date('2026-07-01T00:00:00.000Z'),
          endsAt: new Date('2026-10-01T00:00:00.000Z'),
        }),
      ],
    });

    expect(matchesRule(quarterly, intent(), AS_OF).matched).toBe(true);
    expect(
      outcome(matchesRule(quarterly, intent(), new Date('2026-11-01T00:00:00.000Z'))),
    ).toBe('rule_expired');
  });
});

describe('mostInformativeCode', () => {
  it('prefers the reason the user can act on', () => {
    expect(mostInformativeCode(['category_mismatch', 'not_enrolled'])).toBe('not_enrolled');
    expect(mostInformativeCode(['mcc_mismatch', 'merchant_excluded'])).toBe(
      'merchant_excluded',
    );
    expect(mostInformativeCode(['category_mismatch', 'cap_exhausted'])).toBe('cap_exhausted');
  });

  it('is order-independent', () => {
    expect(mostInformativeCode(['not_enrolled', 'category_mismatch'])).toBe('not_enrolled');
    expect(mostInformativeCode(['category_mismatch', 'not_enrolled'])).toBe('not_enrolled');
  });

  it('returns null for no failures', () => {
    expect(mostInformativeCode([])).toBeNull();
  });
});
