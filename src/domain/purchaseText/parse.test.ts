import {
  extractAmountUsd,
  extractCategorySlug,
  extractChannel,
  extractMerchant,
  extractPaymentMethod,
  parsePurchaseText,
} from './parse';

describe('extractAmountUsd', () => {
  it.each([
    ['$12', 12],
    ['$43.17', 43.17],
    ['$1,234.50', 1234.5],
    ['43.17 dollars', 43.17],
    ['12 dollars', 12],
    ['12 bucks', 12],
    ['12 usd', 12],
    ['twelve dollars', 12],
    ['forty three dollars', 43],
    ['two hundred dollars', 200],
  ])('reads %s as %p', (text, expected) => {
    expect(extractAmountUsd(text)).toBe(expected);
  });

  it('reads a bare decimal, which is unambiguously money', () => {
    expect(extractAmountUsd('coffee 4.50')).toBe(4.5);
  });

  it('does not treat a bare integer as an amount', () => {
    // "gate 12" is a gate number, not twelve dollars.
    expect(extractAmountUsd('coffee at gate 12')).toBeNull();
    expect(extractAmountUsd('table 4')).toBeNull();
  });

  it('returns null when there is no amount', () => {
    expect(extractAmountUsd('lunch at the airport')).toBeNull();
    expect(extractAmountUsd('')).toBeNull();
  });

  it('rejects a zero or negative figure', () => {
    expect(extractAmountUsd('$0')).toBeNull();
    expect(extractAmountUsd('$0.00')).toBeNull();
  });

  it('rounds to two decimal places', () => {
    expect(extractAmountUsd('$12.999')).toBe(13);
  });
});

describe('extractPaymentMethod', () => {
  it.each([
    ['paid with Apple Pay', 'apple_pay'],
    ['used google pay', 'google_pay'],
    ['samsung pay', 'samsung_pay'],
    ['booked through the travel portal', 'issuer_travel_portal'],
    ['used my saved card', 'card_on_file'],
    ['swiped my card', 'physical_card'],
    ['inserted the chip', 'physical_card'],
  ])('reads "%s" as %s', (text, expected) => {
    expect(extractPaymentMethod(text)).toBe(expected);
  });

  it('distinguishes tapping a phone from tapping a card', () => {
    // A mobile-wallet bonus depends on this distinction, so it has to be right.
    expect(extractPaymentMethod('tapped my phone')).toBe('apple_pay');
    expect(extractPaymentMethod('tapped my card')).toBe('contactless_card');
    expect(extractPaymentMethod('contactless')).toBe('contactless_card');
  });

  it('returns null when the method is not stated', () => {
    expect(extractPaymentMethod('coffee at the airport')).toBeNull();
  });
});

describe('extractChannel', () => {
  it.each([
    ['ordered online', 'online'],
    ['bought it on their website', 'online'],
    ['food delivery', 'online'],
    ['in store', 'in_store'],
    ['paid in person', 'in_store'],
    ['swiped at the counter', 'in_store'],
  ])('reads "%s" as %s', (text, expected) => {
    expect(extractChannel(text)).toBe(expected);
  });

  it('returns null when the channel is not stated', () => {
    expect(extractChannel('twelve dollars of coffee')).toBeNull();
  });
});

describe('extractCategorySlug', () => {
  it.each([
    ['coffee at the airport', 'dining'],
    ['dinner with friends', 'dining'],
    ['weekly groceries', 'grocery'],
    ['filled up the car with fuel', 'gas'],
    ['booked a flight', 'airfare'],
    ['two nights at a hotel', 'hotel'],
    ['car rental for the week', 'general_travel'],
    ['subway fare', 'transit'],
    ['picked up a prescription at the pharmacy', 'pharmacy'],
    ['cinema tickets', 'entertainment'],
    ['bulk buy at the warehouse club', 'warehouse_club'],
  ])('reads "%s" as %s', (text, expected) => {
    expect(extractCategorySlug(text)).toBe(expected);
  });

  it('prefers the longer keyword when two match', () => {
    // "gas bill" is a utility, not a fill-up.
    expect(extractCategorySlug('paid the gas bill')).toBe('utilities');
  });

  it('never infers "other", which is a choice the user makes', () => {
    expect(extractCategorySlug('other stuff')).toBeNull();
  });

  it('returns null rather than guessing', () => {
    // A confident wrong category sends the user to the wrong card.
    expect(extractCategorySlug('paid for the thing')).toBeNull();
  });
});

describe('extractMerchant', () => {
  it.each([
    ['coffee at Kettle and Crumb', 'Kettle and Crumb'],
    ['ordered from Orbital Goods', 'Orbital Goods'],
    ['twelve dollars at Greenleaf Market', 'Greenleaf Market'],
  ])('reads "%s" as %p', (text, expected) => {
    expect(extractMerchant(text)).toBe(expected);
  });

  it('strips amounts and currency words out of the name', () => {
    expect(extractMerchant('at Greenleaf Market for $43.17')).toBe('Greenleaf Market');
    expect(extractMerchant('at Fuelworks 40 dollars')).toBe('Fuelworks');
  });

  it('stops at a connective', () => {
    expect(extractMerchant('at Trattoria Nove and then the cinema')).toBe('Trattoria Nove');
  });

  it('tidies shouted input but leaves ordinary capitalisation alone', () => {
    expect(extractMerchant('at GREENLEAF MARKET')).toBe('Greenleaf Market');
    expect(extractMerchant('at greenleaf market')).toBe('greenleaf market');
  });

  it('returns null when there is no "at" or "from" phrase', () => {
    // The merchant field is the easiest one for a user to fill in themselves.
    expect(extractMerchant('twelve dollars of coffee')).toBeNull();
  });

  it('returns null for a name too short to be real', () => {
    expect(extractMerchant('at a')).toBeNull();
  });
});

describe('parsePurchaseText', () => {
  it('parses the specification’s own free-text example', () => {
    // "coffee at the airport, tapped my phone, twelve dollars"
    const result = parsePurchaseText('coffee at the airport, tapped my phone, twelve dollars');

    expect(result.amountUsd).toBe(12);
    expect(result.categorySlug).toBe('dining');
    expect(result.paymentMethod).toBe('apple_pay');
    expect(result.recognised).toContain('amount');
    expect(result.recognised).toContain('category');
    expect(result.recognised).toContain('payment');
  });

  it('parses a full sentence', () => {
    const result = parsePurchaseText(
      'spent $43.17 on groceries at Greenleaf Market, swiped my card',
    );

    expect(result.amountUsd).toBe(43.17);
    expect(result.categorySlug).toBe('grocery');
    expect(result.merchant).toBe('Greenleaf Market');
    expect(result.paymentMethod).toBe('physical_card');
    expect(result.channel).toBe('in_store');
  });

  it('reports only what it recognised, leaving the rest for the user', () => {
    const result = parsePurchaseText('bought something');

    expect(result.amountUsd).toBeNull();
    expect(result.categorySlug).toBeNull();
    expect(result.recognised).toEqual([]);
  });

  it('returns an empty result for empty input', () => {
    expect(parsePurchaseText('   ').recognised).toEqual([]);
  });

  it('is deterministic', () => {
    const text = 'lunch at Trattoria Nove for twenty dollars with apple pay';
    expect(parsePurchaseText(text)).toEqual(parsePurchaseText(text));
  });

  it('never produces a reward figure', () => {
    // The parser's only job is structure. It has no concept of a rate.
    const result = parsePurchaseText('6% back on groceries at Greenleaf, $120');
    expect(Object.keys(result)).toEqual([
      'amountUsd',
      'merchant',
      'categorySlug',
      'channel',
      'paymentMethod',
      'recognised',
    ]);
  });
});
