import { PROGRAM, valuation } from './__fixtures__/wallet';
import {
  isDeclinedUnit,
  isExplicitValuation,
  resolveCentsPerUnit,
  valueRewardUsd,
} from './valuation';

describe('resolveCentsPerUnit', () => {
  it('prefers the program-specific valuation', () => {
    const value = valuation({
      byProgramId: { [PROGRAM.cobaltPoints]: 1.25 },
      byUnit: { usd: 1, points: 0.8, miles: 0.8 },
    });
    expect(resolveCentsPerUnit('points', PROGRAM.cobaltPoints, value)).toBe(1.25);
  });

  it('falls back to the per-unit default when the program is unknown', () => {
    const value = valuation({ byProgramId: {}, byUnit: { usd: 1, points: 0.8, miles: 1.4 } });
    expect(resolveCentsPerUnit('points', PROGRAM.cobaltPoints, value)).toBe(0.8);
    expect(resolveCentsPerUnit('miles', null, value)).toBe(1.4);
  });

  it('keeps an explicit zero rather than falling through to the default', () => {
    // The single most important behaviour in this module: a user who says "these
    // points are worthless to me" must be believed.
    const value = valuation({
      byProgramId: { [PROGRAM.cobaltPoints]: 0 },
      byUnit: { usd: 1, points: 1.5, miles: 1.5 },
    });
    expect(resolveCentsPerUnit('points', PROGRAM.cobaltPoints, value)).toBe(0);
  });

  it('returns zero rather than inventing a number when nothing is set', () => {
    const value = valuation({ byProgramId: {}, byUnit: {} as never });
    expect(resolveCentsPerUnit('points', null, value)).toBe(0);
  });

  it('returns null for usd, where cents-per-dollar is meaningless', () => {
    expect(resolveCentsPerUnit('usd', null, valuation())).toBeNull();
  });
});

describe('valueRewardUsd', () => {
  it('treats a cash-back quantity as already being dollars', () => {
    expect(valueRewardUsd(7.2, 'usd', null, valuation())).toEqual({
      valueUsd: 7.2,
      centsPerUnit: null,
    });
  });

  it('values 480 points at 1.25¢ as $6.00', () => {
    const value = valuation({ byProgramId: { [PROGRAM.cobaltPoints]: 1.25 } });
    expect(valueRewardUsd(480, 'points', PROGRAM.cobaltPoints, value)).toEqual({
      valueUsd: 6,
      centsPerUnit: 1.25,
    });
  });

  it('values a high multiple on a low-value currency correctly', () => {
    const value = valuation({ byProgramId: { [PROGRAM.harborlineStayPoints]: 0.6 } });
    expect(valueRewardUsd(2000, 'points', PROGRAM.harborlineStayPoints, value).valueUsd).toBe(
      12,
    );
  });

  it('values everything non-cash at zero for a cash-back-only user', () => {
    const value = valuation({
      prefersCashBackOnly: true,
      byProgramId: { [PROGRAM.cobaltPoints]: 2 },
    });
    expect(valueRewardUsd(480, 'points', PROGRAM.cobaltPoints, value).valueUsd).toBe(0);
    // Cash back is unaffected.
    expect(valueRewardUsd(7.2, 'usd', null, value).valueUsd).toBe(7.2);
  });

  it('rounds the converted value to cents', () => {
    const value = valuation({ byUnit: { usd: 1, points: 1.1, miles: 1 } });
    // 480 × 1.1 / 100 = 5.28
    expect(valueRewardUsd(480, 'points', null, value).valueUsd).toBe(5.28);
  });
});

describe('isDeclinedUnit', () => {
  it('declines points and miles only for a cash-back-only user', () => {
    const cashOnly = valuation({ prefersCashBackOnly: true });
    expect(isDeclinedUnit('points', cashOnly)).toBe(true);
    expect(isDeclinedUnit('miles', cashOnly)).toBe(true);
    expect(isDeclinedUnit('usd', cashOnly)).toBe(false);
  });

  it('declines nothing by default', () => {
    const normal = valuation();
    expect(isDeclinedUnit('points', normal)).toBe(false);
  });
});

describe('isExplicitValuation', () => {
  it('is true when the program has its own figure', () => {
    expect(
      isExplicitValuation(
        'points',
        PROGRAM.cobaltPoints,
        valuation({ byProgramId: { [PROGRAM.cobaltPoints]: 1.25 } }),
      ),
    ).toBe(true);
  });

  it('is true when the unit has a default the user set', () => {
    expect(isExplicitValuation('points', null, valuation())).toBe(true);
  });

  it('is false when nothing is set, so the figure is an estimate', () => {
    expect(
      isExplicitValuation('points', null, valuation({ byProgramId: {}, byUnit: {} as never })),
    ).toBe(false);
  });

  it('is always true for cash back, which needs no valuation', () => {
    expect(
      isExplicitValuation('usd', null, valuation({ byProgramId: {}, byUnit: {} as never })),
    ).toBe(true);
  });

  it('counts an explicit zero as explicit', () => {
    expect(
      isExplicitValuation(
        'points',
        PROGRAM.cobaltPoints,
        valuation({ byProgramId: { [PROGRAM.cobaltPoints]: 0 } }),
      ),
    ).toBe(true);
  });
});
