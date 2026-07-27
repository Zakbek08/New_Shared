/**
 * Card-product summaries.
 *
 * Two things matter here beyond "it returns a string". First, the headline is the
 * *best bonus*, not the first rule, because the order rows come back in is not a
 * ranking. Second, the verification shown for a card is the **weakest** of its rules:
 * a card carrying one disputed rate must not present itself as verified, and getting
 * that backwards would overstate how much of the catalog has been checked.
 */
import type { RuleSummaryFields } from './summary';
import { headlineRuleLabel, weakestVerification } from './summary';

function rule(overrides: Partial<RuleSummaryFields> = {}): RuleSummaryFields {
  return {
    id: 'rule-1',
    label: '2% cash back on every purchase',
    kind: 'base',
    reward_type: 'cash_back_percent',
    base_rate: 2,
    bonus_rate: 0,
    is_active: true,
    verification_status: 'verified',
    last_verified_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('headlineRuleLabel', () => {
  it('has no headline when there are no rules', () => {
    expect(headlineRuleLabel([])).toBeNull();
  });

  // base 1 + bonus 5 = 6 beats base 2 + bonus 0 = 2, regardless of array order.
  it('picks the highest total of base and bonus, not the first rule', () => {
    const label = headlineRuleLabel([
      rule({ id: 'flat', label: '2% on everything' }),
      rule({
        id: 'grocery',
        label: '6% at supermarkets',
        kind: 'category_bonus',
        base_rate: 1,
        bonus_rate: 5,
      }),
    ]);

    expect(label).toBe('6% at supermarkets');
  });

  it('prefers a bonus rule over the base rule when the totals tie', () => {
    const label = headlineRuleLabel([
      rule({ id: 'flat', label: '3% on everything', base_rate: 3 }),
      rule({
        id: 'dining',
        label: '3% at restaurants',
        kind: 'category_bonus',
        base_rate: 0,
        bonus_rate: 3,
      }),
    ]);

    expect(label).toBe('3% at restaurants');
  });

  it('ignores retired rules, even when they were the best rate', () => {
    const label = headlineRuleLabel([
      rule({ id: 'flat', label: '2% on everything' }),
      rule({
        id: 'gone',
        label: '10% on everything, last year',
        base_rate: 10,
        is_active: false,
      }),
    ]);

    expect(label).toBe('2% on everything');
  });
});

describe('weakestVerification', () => {
  it('reports nothing when every rule is inactive', () => {
    expect(weakestVerification([rule({ is_active: false })])).toEqual({
      status: null,
      lastVerifiedAt: null,
    });
  });

  it('reports the single rule when there is only one', () => {
    expect(weakestVerification([rule()])).toEqual({
      status: 'verified',
      lastVerifiedAt: '2026-07-01T00:00:00.000Z',
    });
  });

  // The point of the whole function: one bad rate downgrades the card.
  it('reports the weakest status, not the best', () => {
    const result = weakestVerification([
      rule({ id: 'good' }),
      rule({
        id: 'bad',
        verification_status: 'disputed',
        last_verified_at: '2024-01-15T00:00:00.000Z',
      }),
    ]);

    expect(result).toEqual({
      status: 'disputed',
      lastVerifiedAt: '2024-01-15T00:00:00.000Z',
    });
  });

  it('treats "not yet verified" as weaker than "may be out of date"', () => {
    const result = weakestVerification([
      rule({ id: 'stale', verification_status: 'stale' }),
      rule({ id: 'none', verification_status: 'unverified', last_verified_at: null }),
    ]);

    expect(result.status).toBe('unverified');
    expect(result.lastVerifiedAt).toBeNull();
  });

  // "No longer offered" is a definite statement about the rule, not a doubt about
  // the evidence, so it must not outrank an unchecked cardholder report.
  it('treats a cardholder report as weaker than a retired rule', () => {
    const result = weakestVerification([
      rule({ id: 'retired', verification_status: 'retired' }),
      rule({ id: 'reported', verification_status: 'user_reported' }),
    ]);

    expect(result.status).toBe('user_reported');
  });

  it('skips inactive rules when choosing the weakest', () => {
    const result = weakestVerification([
      rule({ id: 'good' }),
      rule({ id: 'bad', verification_status: 'disputed', is_active: false }),
    ]);

    expect(result.status).toBe('verified');
  });
});
