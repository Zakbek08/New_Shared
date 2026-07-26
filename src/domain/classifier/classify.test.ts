import { CATEGORY, MERCHANT } from '@/domain/rewards/__fixtures__/wallet';

import { classifyPurchase, normaliseMerchantName } from './classify';
import type { ClassifiableMerchant, ClassifierInput } from './types';

const merchant = (overrides: Partial<ClassifiableMerchant> = {}): ClassifiableMerchant => ({
  id: MERCHANT.greenleafMarket,
  displayName: 'DEMO — Greenleaf Market',
  aliases: ['greenleaf', 'green leaf market'],
  primaryCategoryId: CATEGORY.grocery,
  knownMcc: 5411,
  mccConfidence: 'high',
  hasAmbiguousCoding: false,
  countryCode: 'US',
  isOnlineOnly: false,
  ...overrides,
});

const bulkbarn = merchant({
  id: MERCHANT.bulkbarnWarehouse,
  displayName: 'DEMO — BulkBarn Warehouse',
  aliases: ['bulkbarn', 'bulk barn'],
  primaryCategoryId: CATEGORY.warehouseClub,
  knownMcc: 5300,
  mccConfidence: 'medium',
  hasAmbiguousCoding: true,
});

const input = (overrides: Partial<ClassifierInput> = {}): ClassifierInput => ({
  merchantInput: 'Greenleaf Market',
  userSelectedCategoryId: null,
  mcc: null,
  countryCode: 'US',
  channel: 'in_store',
  ...overrides,
});

describe('normaliseMerchantName', () => {
  it('strips the demo prefix, punctuation and extra whitespace', () => {
    expect(normaliseMerchantName('DEMO — Greenleaf Market')).toBe('greenleaf market');
    expect(normaliseMerchantName('  Trattoria  Nove!  ')).toBe('trattoria nove');
    expect(normaliseMerchantName('Kettle & Crumb Cafe')).toBe('kettle crumb cafe');
  });

  it('makes differently-written forms compare equal', () => {
    expect(normaliseMerchantName('DEMO — Greenleaf Market')).toBe(
      normaliseMerchantName('greenleaf market'),
    );
  });
});

describe('exact merchant match', () => {
  it('matches the catalog name, ignoring the demo prefix and case', () => {
    const result = classifyPurchase(input({ merchantInput: 'greenleaf market' }), [merchant()]);

    expect(result.matchKind).toBe('exact_merchant');
    expect(result.merchantId).toBe(MERCHANT.greenleafMarket);
    expect(result.categoryId).toBe(CATEGORY.grocery);
    expect(result.mcc).toBe(5411);
    expect(result.confidence).toBe('high');
  });

  it('matches an alias', () => {
    const result = classifyPurchase(input({ merchantInput: 'green leaf market' }), [
      merchant(),
    ]);
    expect(result.matchKind).toBe('exact_merchant');
  });

  it('inherits the merchant’s own coding confidence', () => {
    const result = classifyPurchase(input(), [merchant({ mccConfidence: 'medium' })]);
    expect(result.confidence).toBe('medium');
  });

  it('drops to low confidence and warns for a merchant known to code oddly', () => {
    const result = classifyPurchase(input({ merchantInput: 'BulkBarn Warehouse' }), [
      merchant(),
      bulkbarn,
    ]);

    expect(result.merchantId).toBe(MERCHANT.bulkbarnWarehouse);
    expect(result.categoryId).toBe(CATEGORY.warehouseClub);
    expect(result.hasAmbiguousCoding).toBe(true);
    expect(result.confidence).toBe('low');
  });

  it('outranks the user’s own selection, because the issuer codes the merchant', () => {
    // The user taps "Grocery" at a warehouse club. Their intent is reasonable and
    // the grocery bonus still will not apply.
    const result = classifyPurchase(
      input({
        merchantInput: 'BulkBarn Warehouse',
        userSelectedCategoryId: CATEGORY.grocery,
      }),
      [bulkbarn],
    );

    expect(result.matchKind).toBe('exact_merchant');
    expect(result.categoryId).toBe(CATEGORY.warehouseClub);
    expect(result.disagreesWithUserSelection).toBe(true);
    expect(result.hasAmbiguousCoding).toBe(true);
    expect(result.confidence).toBe('low');
    // The user's choice is kept as an alternative rather than discarded.
    expect(result.alternativeCategoryIds).toEqual([CATEGORY.grocery]);
  });

  it('does not flag a disagreement when the user agrees', () => {
    const result = classifyPurchase(input({ userSelectedCategoryId: CATEGORY.grocery }), [
      merchant(),
    ]);
    expect(result.disagreesWithUserSelection).toBe(false);
    expect(result.hasAmbiguousCoding).toBe(false);
  });
});

describe('MCC evidence', () => {
  it('uses a supplied MCC when no merchant matches', () => {
    const result = classifyPurchase(input({ merchantInput: 'Some Unknown Shop', mcc: 5812 }), [
      merchant(),
    ]);

    expect(result.matchKind).toBe('known_mcc');
    expect(result.categoryId).toBe(CATEGORY.dining);
    expect(result.confidence).toBe('high');
  });

  it('reports ambiguity when one MCC maps to several categories', () => {
    // 4111 sits in both general travel and transit.
    const result = classifyPurchase(
      input({ merchantInput: 'Unknown Transit Co', mcc: 4111 }),
      [],
    );

    expect(result.matchKind).toBe('known_mcc');
    expect(result.confidence).toBe('medium');
    expect(result.hasAmbiguousCoding).toBe(true);
    expect(result.alternativeCategoryIds.length).toBeGreaterThan(0);
  });

  it('falls past an MCC it cannot map', () => {
    const result = classifyPurchase(
      input({ merchantInput: 'Unknown', mcc: 9999, userSelectedCategoryId: CATEGORY.dining }),
      [],
    );
    expect(result.matchKind).toBe('user_selected');
  });
});

describe('user-selected category', () => {
  it('is used when there is no merchant or MCC evidence', () => {
    const result = classifyPurchase(
      input({ merchantInput: 'Xyzzy', userSelectedCategoryId: CATEGORY.dining }),
      [],
    );

    expect(result.matchKind).toBe('user_selected');
    expect(result.categoryId).toBe(CATEGORY.dining);
    // The most reliable option a user has: it removes our guesswork.
    expect(result.confidence).toBe('high');
    expect(result.hasAmbiguousCoding).toBe(false);
  });
});

describe('inferred from a partial name', () => {
  it('matches a distinctive token', () => {
    const result = classifyPurchase(input({ merchantInput: 'greenleaf downtown' }), [
      merchant(),
    ]);

    expect(result.matchKind).toBe('inferred');
    expect(result.merchantId).toBe(MERCHANT.greenleafMarket);
  });

  it('caps confidence at medium, since the match is only a guess', () => {
    const result = classifyPurchase(input({ merchantInput: 'greenleaf downtown' }), [
      merchant({ mccConfidence: 'high' }),
    ]);
    expect(result.confidence).toBe('medium');
  });

  it('ignores tokens too short to be distinctive', () => {
    const result = classifyPurchase(input({ merchantInput: 'a b' }), [merchant()]);
    expect(result.matchKind).toBe('unknown');
  });

  it('picks the longest shared token, deterministically', () => {
    const trattoria = merchant({
      id: MERCHANT.trattoriaNove,
      displayName: 'DEMO — Trattoria Nove',
      aliases: [],
      primaryCategoryId: CATEGORY.dining,
      knownMcc: 5812,
    });

    const forwards = classifyPurchase(input({ merchantInput: 'trattoria' }), [
      merchant(),
      trattoria,
    ]);
    const backwards = classifyPurchase(input({ merchantInput: 'trattoria' }), [
      trattoria,
      merchant(),
    ]);

    expect(forwards.merchantId).toBe(MERCHANT.trattoriaNove);
    expect(backwards.merchantId).toBe(MERCHANT.trattoriaNove);
  });
});

describe('unknown', () => {
  it('reports unknown rather than guessing', () => {
    const result = classifyPurchase(input({ merchantInput: 'Zzzzqqq' }), [merchant()]);

    expect(result.matchKind).toBe('unknown');
    expect(result.categoryId).toBeNull();
    expect(result.merchantId).toBeNull();
    expect(result.confidence).toBe('low');
  });

  it('handles empty input', () => {
    const result = classifyPurchase(input({ merchantInput: '   ' }), [merchant()]);
    expect(result.matchKind).toBe('unknown');
  });

  it('handles an empty catalog', () => {
    expect(classifyPurchase(input(), []).matchKind).toBe('unknown');
  });
});

describe('plausibility filtering', () => {
  it('will not match an online-only merchant to an in-store purchase', () => {
    const onlineOnly = merchant({
      displayName: 'DEMO — Orbital Goods',
      aliases: ['orbital'],
      isOnlineOnly: true,
      primaryCategoryId: CATEGORY.onlineShopping,
    });

    expect(
      classifyPurchase(input({ merchantInput: 'Orbital Goods', channel: 'in_store' }), [
        onlineOnly,
      ]).matchKind,
    ).toBe('unknown');

    expect(
      classifyPurchase(input({ merchantInput: 'Orbital Goods', channel: 'online' }), [
        onlineOnly,
      ]).matchKind,
    ).toBe('exact_merchant');
  });

  it('will not match a merchant in a different country', () => {
    const french = merchant({
      displayName: 'DEMO — Maison Bleue',
      aliases: ['maison bleue'],
      countryCode: 'FR',
      primaryCategoryId: CATEGORY.dining,
    });

    expect(
      classifyPurchase(input({ merchantInput: 'Maison Bleue', countryCode: 'US' }), [french])
        .matchKind,
    ).toBe('unknown');

    expect(
      classifyPurchase(input({ merchantInput: 'Maison Bleue', countryCode: 'FR' }), [french])
        .matchKind,
    ).toBe('exact_merchant');
  });
});

describe('determinism', () => {
  it('gives the same answer every time', () => {
    const catalog = [merchant(), bulkbarn];
    const first = classifyPurchase(input(), catalog);
    const second = classifyPurchase(input(), catalog);
    expect(second).toEqual(first);
  });

  it('does not depend on catalog order', () => {
    const forwards = classifyPurchase(input(), [merchant(), bulkbarn]);
    const backwards = classifyPurchase(input(), [bulkbarn, merchant()]);
    expect(backwards.merchantId).toBe(forwards.merchantId);
  });
});
