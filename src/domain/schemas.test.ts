/**
 * Validation tests, with a strong bias toward the security requirements: the
 * schemas must actively refuse card credentials, not merely fail to ask for
 * them.
 */
import {
  addUserCardSchema,
  lastFourSchema,
  passwordSchema,
  purchaseIntentSchema,
  registrationSchema,
  rewardPreferenceSchema,
  rewardRuleSchema,
  safeTextSchema,
  userOfferSchema,
} from './schemas';

const validPurchase = {
  merchant: 'Greenleaf Market',
  amountUsd: 120,
  channel: 'in_store' as const,
};

describe('credential rejection', () => {
  const schema = safeTextSchema(500);

  it.each([
    ['a bare 16-digit number', '4111111111111111'],
    ['a spaced card number', '4111 1111 1111 1111'],
    ['a hyphenated card number', '4111-1111-1111-1111'],
    ['a 13-digit number', '4111111111111'],
    ['a card number inside a sentence', 'my card is 4111111111111111 thanks'],
  ])('rejects %s', (_label, value) => {
    const result = schema.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/card number/i);
  });

  it.each([
    ['a labelled CVV', 'cvv 123'],
    ['a labelled CVC', 'cvc: 4321'],
    ['a spelled-out security code', 'security code 999'],
  ])('rejects %s', (_label, value) => {
    const result = schema.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/security code/i);
  });

  it.each([
    ['a labelled PIN', 'pin 4821'],
    ['a labelled password', 'password hunter2xyz'],
  ])('rejects %s', (_label, value) => {
    const result = schema.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/PIN|password/i);
  });

  it('allows ordinary merchant names and notes', () => {
    for (const value of [
      'Greenleaf Market',
      'Trattoria Nove — birthday dinner',
      'Fuelworks pump 3',
      'Order #12345',
      'Split with Sam, 50/50',
    ]) {
      expect(schema.safeParse(value).success).toBe(true);
    }
  });

  it('rejects credentials in the purchase-form merchant field too', () => {
    const result = purchaseIntentSchema.safeParse({
      ...validPurchase,
      merchant: '4111111111111111',
    });
    expect(result.success).toBe(false);
  });

  it('rejects credentials in a card nickname', () => {
    const result = addUserCardSchema.safeParse({
      cardProductId: '55555555-0000-4000-8000-000000000001',
      nickname: '4111 1111 1111 1111',
    });
    expect(result.success).toBe(false);
  });
});

describe('lastFourSchema', () => {
  it('accepts exactly four digits', () => {
    expect(lastFourSchema.safeParse('1234').success).toBe(true);
    expect(lastFourSchema.safeParse('0007').success).toBe(true);
  });

  it('rejects anything longer, so a full number cannot be entered piecemeal', () => {
    for (const value of ['12345', '411111111111', '4111111111111111']) {
      expect(lastFourSchema.safeParse(value).success).toBe(false);
    }
  });

  it('rejects anything shorter or non-numeric', () => {
    for (const value of ['123', '', 'abcd', '12 34', '12-34']) {
      expect(lastFourSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe('passwordSchema', () => {
  it('accepts a password meeting every requirement', () => {
    expect(passwordSchema.safeParse('Wallet1Wise2').success).toBe(true);
  });

  it.each([
    ['too short', 'Short1Aa'],
    ['no upper case', 'walletwise123'],
    ['no lower case', 'WALLETWISE123'],
    ['no digit', 'WalletWiseAbc'],
  ])('rejects a password that is %s', (_label, value) => {
    expect(passwordSchema.safeParse(value).success).toBe(false);
  });

  it('matches the minimum length configured for Supabase Auth', () => {
    // supabase/config.toml sets minimum_password_length = 10.
    expect(passwordSchema.safeParse('Aa1bcdefg').success).toBe(false);
    expect(passwordSchema.safeParse('Aa1bcdefgh').success).toBe(true);
  });
});

describe('registrationSchema', () => {
  const base = {
    email: 'Person@Example.com',
    password: 'Wallet1Wise2',
    confirmPassword: 'Wallet1Wise2',
    acceptedDisclaimers: true as const,
  };

  it('accepts a complete registration and normalises the email', () => {
    const result = registrationSchema.safeParse(base);
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe('person@example.com');
  });

  it('rejects mismatched passwords, pointing at the confirmation field', () => {
    const result = registrationSchema.safeParse({ ...base, confirmPassword: 'Different1A' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['confirmPassword']);
  });

  it('requires the disclaimers to be accepted', () => {
    const result = registrationSchema.safeParse({ ...base, acceptedDisclaimers: false });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/disclaimer/i);
  });

  it('rejects an invalid email address', () => {
    expect(registrationSchema.safeParse({ ...base, email: 'not-an-email' }).success).toBe(
      false,
    );
  });
});

describe('purchaseIntentSchema', () => {
  it('accepts a well-formed purchase and applies the documented defaults', () => {
    const result = purchaseIntentSchema.safeParse(validPurchase);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      amountUsd: 120,
      countryCode: 'US',
      currencyCode: 'USD',
      paymentMethod: 'physical_card',
      categorySlug: null,
    });
  });

  it('rejects a zero-dollar purchase', () => {
    // There is no best card for a $0 purchase, and the engine should never be
    // asked to rank one.
    const result = purchaseIntentSchema.safeParse({ ...validPurchase, amountUsd: 0 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/greater than \$0/);
  });

  it('rejects a negative amount', () => {
    expect(purchaseIntentSchema.safeParse({ ...validPurchase, amountUsd: -50 }).success).toBe(
      false,
    );
  });

  it.each([
    ['text', 'not a number'],
    ['empty', ''],
    ['infinity', Number.POSITIVE_INFINITY],
    ['NaN', Number.NaN],
  ])('rejects an invalid amount: %s', (_label, amountUsd) => {
    expect(purchaseIntentSchema.safeParse({ ...validPurchase, amountUsd }).success).toBe(false);
  });

  it('rejects more than two decimal places', () => {
    expect(
      purchaseIntentSchema.safeParse({ ...validPurchase, amountUsd: 12.345 }).success,
    ).toBe(false);
    expect(purchaseIntentSchema.safeParse({ ...validPurchase, amountUsd: 12.34 }).success).toBe(
      true,
    );
  });

  it('coerces a numeric string, because form inputs give strings', () => {
    const result = purchaseIntentSchema.safeParse({ ...validPurchase, amountUsd: '120.50' });
    expect(result.success).toBe(true);
    expect(result.data?.amountUsd).toBe(120.5);
  });

  it('accepts a missing category, which is a valid state the engine handles', () => {
    const result = purchaseIntentSchema.safeParse({ ...validPurchase, categorySlug: null });
    expect(result.success).toBe(true);
    expect(result.data?.categorySlug).toBeNull();
  });

  it('rejects an unknown category rather than falling back silently', () => {
    expect(
      purchaseIntentSchema.safeParse({ ...validPurchase, categorySlug: 'crypto' }).success,
    ).toBe(false);
  });

  it('normalises country and currency codes to upper case', () => {
    const result = purchaseIntentSchema.safeParse({
      ...validPurchase,
      countryCode: 'fr',
      currencyCode: 'eur',
    });
    expect(result.success).toBe(true);
    expect(result.data?.countryCode).toBe('FR');
    expect(result.data?.currencyCode).toBe('EUR');
  });

  it('rejects malformed country and currency codes', () => {
    expect(
      purchaseIntentSchema.safeParse({ ...validPurchase, countryCode: 'USA' }).success,
    ).toBe(false);
    expect(
      purchaseIntentSchema.safeParse({ ...validPurchase, currencyCode: 'US' }).success,
    ).toBe(false);
  });

  it('rejects "either" as a channel: a real purchase is one or the other', () => {
    expect(
      purchaseIntentSchema.safeParse({ ...validPurchase, channel: 'either' }).success,
    ).toBe(false);
  });
});

describe('rewardPreferenceSchema', () => {
  it('accepts a user valuation', () => {
    const result = rewardPreferenceSchema.safeParse({ unit: 'points', centsPerUnit: 1.25 });
    expect(result.success).toBe(true);
    expect(result.data?.centsPerUnit).toBe(1.25);
  });

  it('accepts a zero valuation as a deliberate choice', () => {
    expect(rewardPreferenceSchema.safeParse({ unit: 'miles', centsPerUnit: 0 }).success).toBe(
      true,
    );
  });

  it('rejects a negative valuation', () => {
    expect(rewardPreferenceSchema.safeParse({ unit: 'points', centsPerUnit: -1 }).success).toBe(
      false,
    );
  });

  it('rejects an implausibly high valuation as a likely typo', () => {
    const result = rewardPreferenceSchema.safeParse({ unit: 'points', centsPerUnit: 125 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/per point/i);
  });
});

describe('userOfferSchema', () => {
  const base = {
    userCardId: '11111111-1111-4111-8111-111111111111',
    title: '10% back at Greenleaf',
    rewardType: 'cash_back_percent' as const,
    rate: 10,
    merchantLabel: 'Greenleaf Market',
  };

  it('accepts a percentage offer', () => {
    expect(userOfferSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a fixed statement-credit offer with no rate', () => {
    const result = userOfferSchema.safeParse({
      ...base,
      rewardType: 'statement_credit',
      rate: 0,
      fixedAmountUsd: 20,
      minimumSpendUsd: 100,
    });
    expect(result.success).toBe(true);
  });

  it('requires either a rate or a fixed amount', () => {
    const result = userOfferSchema.safeParse({ ...base, rate: 0 });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes('rate'))).toBe(true);
  });

  it('requires a merchant, by id or by label', () => {
    const result = userOfferSchema.safeParse({ ...base, merchantLabel: undefined });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes('merchantLabel'))).toBe(
      true,
    );
  });

  it('rejects an end date before the start date', () => {
    const result = userOfferSchema.safeParse({
      ...base,
      startsAt: '2026-08-01',
      endsAt: '2026-07-01',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes('endsAt'))).toBe(true);
  });
});

describe('rewardRuleSchema', () => {
  const base = {
    cardProductId: '55555555-0000-4000-8000-000000000001',
    label: '6% cash back at supermarkets',
    kind: 'category_bonus' as const,
    rewardType: 'cash_back_percent' as const,
    rewardUnit: 'usd' as const,
    baseRate: 6,
  };

  it('accepts a valid category bonus', () => {
    expect(rewardRuleSchema.safeParse(base).success).toBe(true);
  });

  it('mirrors the database constraint that a cap needs a period', () => {
    const result = rewardRuleSchema.safeParse({ ...base, capAmount: 6000 });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes('capPeriod'))).toBe(true);
  });

  it('mirrors the database constraint that a period needs a cap', () => {
    expect(rewardRuleSchema.safeParse({ ...base, capPeriod: 'calendar_year' }).success).toBe(
      false,
    );
  });

  it('accepts a cap and period together', () => {
    expect(
      rewardRuleSchema.safeParse({
        ...base,
        capAmount: 6000,
        capPeriod: 'calendar_year',
        postCapRate: 1,
      }).success,
    ).toBe(true);
  });

  it('requires a rate rule to actually earn something', () => {
    const result = rewardRuleSchema.safeParse({ ...base, baseRate: 0, bonusRate: 0 });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes('baseRate'))).toBe(true);
  });

  it('requires a statement credit to name an amount', () => {
    const result = rewardRuleSchema.safeParse({
      ...base,
      rewardType: 'statement_credit',
      baseRate: 0,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes('fixedAmountUsd'))).toBe(
      true,
    );
  });

  it('refuses to mark a rule verified without a source and a date', () => {
    const result = rewardRuleSchema.safeParse({ ...base, verificationStatus: 'verified' });
    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some((issue) => issue.path.includes('verificationStatus')),
    ).toBe(true);
  });

  it('accepts a verified rule that has both', () => {
    expect(
      rewardRuleSchema.safeParse({
        ...base,
        verificationStatus: 'verified',
        sourceId: '88888888-0000-4000-8000-000000000001',
        lastVerifiedAt: '2026-07-01',
      }).success,
    ).toBe(true);
  });

  it('rejects an end date before the start date', () => {
    expect(
      rewardRuleSchema.safeParse({ ...base, startsAt: '2026-10-01', endsAt: '2026-07-01' })
        .success,
    ).toBe(false);
  });
});
