/**
 * The "do not log sensitive user or financial data" requirement is only real if
 * it is tested. These cases are the enforcement.
 */
import { bucketAmount, maskCardLikeSequences, redact } from './redaction';

describe('maskCardLikeSequences', () => {
  it.each([
    ['4111111111111111', '[card-number-redacted]'],
    ['4111 1111 1111 1111', '[card-number-redacted]'],
    ['4111-1111-1111-1111', '[card-number-redacted]'],
    ['4111111111111', '[card-number-redacted]'],
  ])('masks %s', (input, expected) => {
    expect(maskCardLikeSequences(input)).toBe(expected);
  });

  it('masks a card number embedded in a longer string', () => {
    expect(maskCardLikeSequences('paid with 4111111111111111 today')).toBe(
      'paid with [card-number-redacted] today',
    );
  });

  it('leaves short numbers alone, so order ids and amounts survive', () => {
    expect(maskCardLikeSequences('order 12345')).toBe('order 12345');
    expect(maskCardLikeSequences('$120.50')).toBe('$120.50');
    expect(maskCardLikeSequences('last four 1234')).toBe('last four 1234');
  });
});

describe('bucketAmount', () => {
  it.each([
    [0, '0'],
    [4.99, '0-9'],
    [42, '10-99'],
    [120, '100-499'],
    [750, '500-999'],
    [2400, '1000-4999'],
    [99_999, '5000+'],
  ])('buckets %p as %s', (input, expected) => {
    expect(bucketAmount(input)).toBe(expected);
  });

  it('buckets by magnitude, ignoring sign', () => {
    expect(bucketAmount(-120)).toBe('100-499');
  });

  it('reports invalid input rather than guessing', () => {
    expect(bucketAmount(Number.NaN)).toBe('invalid');
  });
});

describe('redact', () => {
  it('drops every credential-shaped key', () => {
    const result = redact({
      cardNumber: '4111111111111111',
      cvv: '123',
      pin: '4821',
      password: 'hunter2',
      access_token: 'eyJhbGciOi',
      last_four_cipher: 'abc123def456',
    }) as Record<string, string>;

    for (const value of Object.values(result)) {
      expect(value).toBe('[redacted]');
    }
  });

  it('drops personal identifiers', () => {
    const result = redact({
      email: 'person@example.com',
      display_name: 'Person Example',
      phone: '+15551234567',
    }) as Record<string, string>;

    expect(result['email']).toBe('[redacted]');
    expect(result['display_name']).toBe('[redacted]');
    expect(result['phone']).toBe('[redacted]');
  });

  it('coarsens dollar amounts into bands', () => {
    const result = redact({ amountUsd: 120, net_value_usd: 7.2 }) as Record<string, string>;
    expect(result['amountUsd']).toBe('100-499');
    expect(result['net_value_usd']).toBe('0-9');
  });

  it('reduces user-typed free text to its length', () => {
    const result = redact({
      merchant: 'Greenleaf Market',
      notes: 'birthday dinner',
    }) as Record<string, string>;

    expect(result['merchant']).toBe('[16 chars]');
    expect(result['notes']).toBe('[15 chars]');
  });

  it('keeps the diagnostic fields telemetry actually exists for', () => {
    const result = redact({
      ineligibilityCode: 'cap_exhausted',
      capPeriod: 'quarterly',
      confidence: 'high',
      eligibleCount: 4,
      hasCodingWarning: true,
    }) as Record<string, unknown>;

    expect(result).toEqual({
      ineligibilityCode: 'cap_exhausted',
      capPeriod: 'quarterly',
      confidence: 'high',
      eligibleCount: 4,
      hasCodingWarning: true,
    });
  });

  it('masks card-like strings even under an innocuous key', () => {
    const result = redact({ someLabel: 'ref 4111111111111111' }) as Record<string, string>;
    expect(result['someLabel']).toBe('ref [card-number-redacted]');
  });

  it('applies the deny and length-only lists at any nesting depth', () => {
    const result = redact({
      recommendation: { card: { nickname: 'Everyday', cvv: '999', capPeriod: 'monthly' } },
    }) as { recommendation: { card: Record<string, string> } };

    // Denied outright.
    expect(result.recommendation.card['cvv']).toBe('[redacted]');
    // User-typed free text: length only, never content.
    expect(result.recommendation.card['nickname']).toBe('[8 chars]');
    // Non-sensitive diagnostics survive, even when nested.
    expect(result.recommendation.card['capPeriod']).toBe('monthly');
  });

  it('handles arrays, truncating long ones', () => {
    expect(redact({ codes: ['a', 'b'] })).toEqual({ codes: ['a', 'b'] });

    const long = redact({ codes: Array.from({ length: 25 }, (_, i) => `c${i}`) }) as {
      codes: string[];
    };
    expect(long.codes).toHaveLength(21);
    expect(long.codes[20]).toBe('[+5 more]');
  });

  it('survives circular references', () => {
    const node: Record<string, unknown> = { name: 'root' };
    node['self'] = node;
    expect(redact(node)).toEqual({ name: 'root', self: '[circular]' });
  });

  it('stops at a maximum depth rather than recursing without bound', () => {
    let deep: Record<string, unknown> = { value: 'bottom' };
    for (let i = 0; i < 12; i += 1) deep = { nested: deep };

    // Should complete and mark the cut-off rather than overflow the stack.
    expect(JSON.stringify(redact(deep))).toContain('[max-depth]');
  });

  it('serialises dates and errors without leaking interpolated input', () => {
    expect(redact({ at: new Date('2026-07-26T00:00:00.000Z') })).toEqual({
      at: '2026-07-26T00:00:00.000Z',
    });

    const result = redact(new Error('failed for 4111111111111111')) as {
      name: string;
      message: string;
    };
    expect(result.message).toBe('failed for [card-number-redacted]');
  });

  it('normalises undefined, functions and symbols to null', () => {
    expect(redact({ a: undefined, b: () => undefined, c: Symbol('x'), d: Number.NaN })).toEqual(
      { a: null, b: null, c: null, d: null },
    );
  });
});
