/**
 * Money arithmetic is the foundation every reward figure sits on, so it gets
 * tested first and hardest. The full engine test matrix — caps, exclusions,
 * enrollment, tie-breaking, overlapping rules — arrives with the engine itself
 * in Phase 3; see TESTING.md for the plan.
 */
import {
  atLeastZero,
  foreignTransactionFee,
  percentOf,
  roundTo,
  roundUnits,
  roundUsd,
  splitAtCap,
  unitsFor,
  unitsToUsd,
} from './money';

describe('roundTo', () => {
  it('rounds halves away from zero rather than toward positive infinity', () => {
    expect(roundTo(0.5, 0)).toBe(1);
    expect(roundTo(-0.5, 0)).toBe(-1);
    expect(roundTo(1.5, 0)).toBe(2);
    // Half away from zero, not banker's rounding: 2.5 goes to 3, not to 2.
    expect(roundTo(2.5, 0)).toBe(3);
    expect(roundTo(-2.5, 0)).toBe(-3);
  });

  it('handles the IEEE-754 cases a naive implementation gets wrong', () => {
    // 1.005 * 100 is 100.49999999999999 in binary floating point.
    expect(roundTo(1.005, 2)).toBe(1.01);
    // 0.145 * 100 is 14.499999999999998.
    expect(roundTo(0.145, 2)).toBe(0.15);
    expect(roundTo(1.0049999, 2)).toBe(1);
  });

  it('stays correct at larger magnitudes, where an absolute epsilon nudge fails', () => {
    expect(roundTo(12345.675, 2)).toBe(12345.68);
    expect(roundTo(999999.994, 2)).toBe(999999.99);
  });

  it('never returns negative zero', () => {
    expect(roundTo(-0.001, 2)).toBe(0);
    expect(Object.is(roundTo(-0.001, 2), -0)).toBe(false);
  });

  it('rejects non-finite input rather than producing NaN downstream', () => {
    expect(() => roundTo(Number.NaN, 2)).toThrow(RangeError);
    expect(() => roundTo(Number.POSITIVE_INFINITY, 2)).toThrow(RangeError);
  });

  it('rejects an out-of-range decimal count', () => {
    expect(() => roundTo(1, -1)).toThrow(RangeError);
    expect(() => roundTo(1, 1.5)).toThrow(RangeError);
    expect(() => roundTo(1, 13)).toThrow(RangeError);
  });
});

describe('roundUsd and roundUnits', () => {
  it('rounds dollars to cents', () => {
    expect(roundUsd(7.199999)).toBe(7.2);
    expect(roundUsd(7.205)).toBe(7.21);
  });

  it('keeps six decimal places for fractional points', () => {
    expect(roundUnits(1 / 3)).toBe(0.333333);
    expect(roundUnits(480)).toBe(480);
  });
});

describe('percentage cash back', () => {
  it('computes the specification example: 6% of $120 is $7.20', () => {
    expect(percentOf(120, 6)).toBe(7.2);
  });

  it('computes the runner-up in the same example: 5% of $120 is $6.00', () => {
    expect(percentOf(120, 5)).toBe(6);
  });

  it('handles a flat 2% everywhere card', () => {
    expect(percentOf(120, 2)).toBe(2.4);
    expect(percentOf(43.17, 2)).toBe(0.86);
  });

  it('returns zero for a zero rate or a zero amount', () => {
    expect(percentOf(120, 0)).toBe(0);
    expect(percentOf(0, 6)).toBe(0);
  });

  it('rejects negative amounts and negative rates', () => {
    expect(() => percentOf(-1, 6)).toThrow(RangeError);
    expect(() => percentOf(120, -6)).toThrow(RangeError);
  });
});

describe('points and miles', () => {
  it('computes 4x on $120 as 480 points', () => {
    expect(unitsFor(120, 4)).toBe(480);
  });

  it('computes a fractional multiplier', () => {
    expect(unitsFor(43.17, 1.5)).toBe(64.755);
  });

  it('rejects a negative multiplier', () => {
    expect(() => unitsFor(120, -1)).toThrow(RangeError);
  });
});

describe('user-defined point valuation', () => {
  it('values 480 points at 1.25 cents each as $6.00', () => {
    expect(unitsToUsd(480, 1.25)).toBe(6);
  });

  it('values the same points differently for a different user', () => {
    // The whole reason valuations are per-user: identical earn, different answer.
    expect(unitsToUsd(480, 1)).toBe(4.8);
    expect(unitsToUsd(480, 2)).toBe(9.6);
  });

  it('treats a zero valuation as a real answer, not a missing one', () => {
    // A user who says "these points are worthless to me" must be believed,
    // rather than silently given a default.
    expect(unitsToUsd(480, 0)).toBe(0);
  });

  it('correctly values a high multiple on a low-value currency', () => {
    // 10x at 0.6 cents beats 3x at 1.3 cents, and the maths must show it.
    const hotelPoints = unitsToUsd(unitsFor(200, 10), 0.6);
    const airlineMiles = unitsToUsd(unitsFor(200, 3), 1.3);
    expect(hotelPoints).toBe(12);
    expect(airlineMiles).toBe(7.8);
    expect(hotelPoints).toBeGreaterThan(airlineMiles);
  });

  it('rejects a negative valuation', () => {
    expect(() => unitsToUsd(480, -1)).toThrow(RangeError);
  });
});

describe('splitAtCap', () => {
  it('treats a null cap as uncapped', () => {
    expect(splitAtCap(120, null)).toEqual({ withinCapUsd: 120, overCapUsd: 0 });
  });

  it('puts the whole purchase under the cap when there is room', () => {
    expect(splitAtCap(120, 500)).toEqual({ withinCapUsd: 120, overCapUsd: 0 });
  });

  it('splits a purchase that partially exceeds the remaining cap', () => {
    // The partially-remaining-cap case: $200 spend against $80 of cap left.
    expect(splitAtCap(200, 80)).toEqual({ withinCapUsd: 80, overCapUsd: 120 });
  });

  it('sends everything over the cap when the cap is exhausted', () => {
    expect(splitAtCap(120, 0)).toEqual({ withinCapUsd: 0, overCapUsd: 120 });
  });

  it('splits exactly at the boundary without leaking a rounding error', () => {
    expect(splitAtCap(120, 120)).toEqual({ withinCapUsd: 120, overCapUsd: 0 });
    expect(splitAtCap(120.01, 120)).toEqual({ withinCapUsd: 120, overCapUsd: 0.01 });
  });

  it('rejects a negative remaining cap', () => {
    expect(() => splitAtCap(120, -1)).toThrow(RangeError);
  });
});

describe('foreignTransactionFee', () => {
  it('charges nothing when the purchase is in the home currency', () => {
    expect(
      foreignTransactionFee(120, 3, { purchaseCurrency: 'USD', homeCurrency: 'USD' }),
    ).toBe(0);
  });

  it('charges the fee on a foreign-currency purchase', () => {
    expect(
      foreignTransactionFee(120, 3, { purchaseCurrency: 'EUR', homeCurrency: 'USD' }),
    ).toBe(3.6);
  });

  it('charges nothing for a no-fee card, even abroad', () => {
    expect(
      foreignTransactionFee(120, 0, { purchaseCurrency: 'EUR', homeCurrency: 'USD' }),
    ).toBe(0);
  });

  it('compares currency codes case-insensitively', () => {
    expect(
      foreignTransactionFee(120, 3, { purchaseCurrency: 'usd', homeCurrency: 'USD' }),
    ).toBe(0);
  });

  it('can outweigh a better earn rate, which is the point of tracking it', () => {
    // 3x miles at 1 cent on $100 = $3.00 gross, less a 3% fee = $0.00 net.
    // A 2% no-fee card returns $2.00 and should win.
    const highEarner =
      unitsToUsd(unitsFor(100, 3), 1) -
      foreignTransactionFee(100, 3, { purchaseCurrency: 'EUR', homeCurrency: 'USD' });
    const noFeeCard =
      percentOf(100, 2) -
      foreignTransactionFee(100, 0, { purchaseCurrency: 'EUR', homeCurrency: 'USD' });

    expect(highEarner).toBe(0);
    expect(noFeeCard).toBe(2);
    expect(noFeeCard).toBeGreaterThan(highEarner);
  });
});

describe('atLeastZero', () => {
  it('clamps a negative net value to zero', () => {
    expect(atLeastZero(-5)).toBe(0);
    expect(atLeastZero(0)).toBe(0);
    expect(atLeastZero(2.5)).toBe(2.5);
  });
});
