import {
  capUtilisation,
  isCapExhausted,
  isCapNearlyReached,
  resolveRuleCap,
  usageAppliesToWindow,
} from './caps';
import { resolveCapWindow } from './capWindow';
import { AS_OF, capUsage, card, rule } from './__fixtures__/wallet';

const cappedRule = (overrides: Parameters<typeof rule>[0] = {}) =>
  rule({
    id: 'grocery',
    baseRate: 6,
    capAmount: 6000,
    capPeriod: 'calendar_year',
    postCapRate: 1,
    ...overrides,
  });

describe('resolveRuleCap — uncapped', () => {
  it('reports no cap for a rule without one', () => {
    const cap = resolveRuleCap(rule({ capAmount: null, capPeriod: 'none' }), card(), AS_OF);

    expect(cap.capAmountUsd).toBeNull();
    expect(cap.capRemainingUsd).toBeNull();
    expect(cap.capPeriod).toBeNull();
    expect(isCapExhausted(cap)).toBe(false);
  });
});

describe('resolveRuleCap — consumption', () => {
  it('reports the whole cap available when nothing has been used', () => {
    const cap = resolveRuleCap(cappedRule(), card(), AS_OF);

    expect(cap.capAmountUsd).toBe(6000);
    expect(cap.capRemainingUsd).toBe(6000);
    expect(cap.consumedUsd).toBe(0);
  });

  it('subtracts recorded spend in the current window', () => {
    // $6,000 annual cap with $4,760 already spent leaves $1,240.
    const cap = resolveRuleCap(
      cappedRule(),
      card({ capUsage: { grocery: capUsage({ qualifyingSpendUsd: 4760 }) } }),
      AS_OF,
    );

    expect(cap.capRemainingUsd).toBe(1240);
    expect(cap.consumedUsd).toBe(4760);
  });

  it('clamps a remaining cap at zero rather than going negative', () => {
    const cap = resolveRuleCap(
      cappedRule(),
      card({ capUsage: { grocery: capUsage({ qualifyingSpendUsd: 7000 }) } }),
      AS_OF,
    );

    expect(cap.capRemainingUsd).toBe(0);
    expect(isCapExhausted(cap)).toBe(true);
  });

  it('reports exactly zero left when the cap is precisely reached', () => {
    const cap = resolveRuleCap(
      cappedRule(),
      card({ capUsage: { grocery: capUsage({ qualifyingSpendUsd: 6000 }) } }),
      AS_OF,
    );

    expect(cap.capRemainingUsd).toBe(0);
    expect(isCapExhausted(cap)).toBe(true);
  });

  it('ignores usage recorded in a previous window, which is how caps reset', () => {
    const cap = resolveRuleCap(
      cappedRule({ capPeriod: 'quarterly' }),
      card({
        capUsage: {
          grocery: capUsage({
            // Q2 2026, while AS_OF is in Q3.
            periodStart: new Date('2026-04-01T00:00:00.000Z'),
            periodEnd: new Date('2026-07-01T00:00:00.000Z'),
            qualifyingSpendUsd: 6000,
          }),
        },
      }),
      AS_OF,
    );

    expect(cap.consumedUsd).toBe(0);
    expect(cap.capRemainingUsd).toBe(6000);
  });

  it('ignores usage belonging to a different rule', () => {
    const cap = resolveRuleCap(
      cappedRule(),
      card({ capUsage: { 'some-other-rule': capUsage({ qualifyingSpendUsd: 6000 }) } }),
      AS_OF,
    );

    expect(cap.capRemainingUsd).toBe(6000);
  });

  it('reads accrued reward, not spend, for a reward-denominated cap', () => {
    const cap = resolveRuleCap(
      cappedRule({ capAmount: 50, capAppliesTo: 'reward', capPeriod: 'cardmember_year' }),
      card({
        capUsage: {
          grocery: capUsage({ qualifyingSpendUsd: 9999, accruedRewardUsd: 20 }),
        },
      }),
      AS_OF,
    );

    expect(cap.appliesTo).toBe('reward');
    expect(cap.consumedUsd).toBe(20);
    expect(cap.capRemainingUsd).toBe(30);
  });
});

describe('resolveRuleCap — windows', () => {
  it('resolves a quarterly cap to the quarter containing asOf', () => {
    const cap = resolveRuleCap(cappedRule({ capPeriod: 'quarterly' }), card(), AS_OF);

    expect(cap.window?.startsAt?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(cap.window?.endsAt?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('uses the account anniversary for a cardmember-year cap', () => {
    const cap = resolveRuleCap(
      cappedRule({ capPeriod: 'cardmember_year' }),
      card({ accountOpenedOn: new Date('2022-03-15T00:00:00.000Z') }),
      AS_OF,
    );

    expect(cap.window?.startsAt?.toISOString()).toBe('2026-03-15T00:00:00.000Z');
  });

  it('treats a lifetime cap as always current', () => {
    const cap = resolveRuleCap(
      cappedRule({ capPeriod: 'lifetime' }),
      card({
        capUsage: {
          grocery: capUsage({
            periodStart: new Date('2019-01-01T00:00:00.000Z'),
            periodEnd: new Date('2020-01-01T00:00:00.000Z'),
            qualifyingSpendUsd: 1000,
          }),
        },
      }),
      AS_OF,
    );

    // Even a very old usage row counts against a lifetime cap.
    expect(cap.consumedUsd).toBe(1000);
    expect(cap.capRemainingUsd).toBe(5000);
  });

  it('treats an unresolvable promotional window as fully available', () => {
    // The database forbids a promotional cap with no end date; a hand-built
    // snapshot could still contain one, and blocking the rule would be worse.
    const cap = resolveRuleCap(
      cappedRule({ capPeriod: 'promotional_window', endsAt: null }),
      card(),
      AS_OF,
    );

    expect(cap.capRemainingUsd).toBe(6000);
    expect(cap.window).toBeNull();
  });
});

describe('usageAppliesToWindow', () => {
  const quarter = resolveCapWindow('quarterly', { asOf: AS_OF })!;

  it('counts a usage row for the same window', () => {
    expect(
      usageAppliesToWindow(
        quarter,
        capUsage({
          periodStart: new Date('2026-07-01T00:00:00.000Z'),
          periodEnd: new Date('2026-10-01T00:00:00.000Z'),
        }),
      ),
    ).toBe(true);
  });

  it('rejects a row ending exactly when the window starts', () => {
    expect(
      usageAppliesToWindow(
        quarter,
        capUsage({
          periodStart: new Date('2026-04-01T00:00:00.000Z'),
          periodEnd: new Date('2026-07-01T00:00:00.000Z'),
        }),
      ),
    ).toBe(false);
  });

  it('rejects a row starting exactly when the window ends', () => {
    expect(
      usageAppliesToWindow(
        quarter,
        capUsage({
          periodStart: new Date('2026-10-01T00:00:00.000Z'),
          periodEnd: new Date('2027-01-01T00:00:00.000Z'),
        }),
      ),
    ).toBe(false);
  });

  it('counts a partially overlapping row, tolerating a boundary difference', () => {
    expect(
      usageAppliesToWindow(
        quarter,
        capUsage({
          periodStart: new Date('2026-06-25T00:00:00.000Z'),
          periodEnd: new Date('2026-09-25T00:00:00.000Z'),
        }),
      ),
    ).toBe(true);
  });
});

describe('cap utilisation helpers', () => {
  it('reports the fraction used', () => {
    const cap = resolveRuleCap(
      cappedRule(),
      card({ capUsage: { grocery: capUsage({ qualifyingSpendUsd: 3000 }) } }),
      AS_OF,
    );
    expect(capUtilisation(cap)).toBeCloseTo(0.5, 6);
  });

  it('reports null utilisation for an uncapped rule', () => {
    expect(capUtilisation(resolveRuleCap(rule(), card(), AS_OF))).toBeNull();
  });

  it('flags a nearly-reached cap but not an exhausted one', () => {
    const nearly = resolveRuleCap(
      cappedRule(),
      card({ capUsage: { grocery: capUsage({ qualifyingSpendUsd: 5400 }) } }),
      AS_OF,
    );
    expect(isCapNearlyReached(nearly)).toBe(true);
    expect(isCapExhausted(nearly)).toBe(false);

    const exhausted = resolveRuleCap(
      cappedRule(),
      card({ capUsage: { grocery: capUsage({ qualifyingSpendUsd: 6000 }) } }),
      AS_OF,
    );
    // Exhausted is its own state, reported separately.
    expect(isCapNearlyReached(exhausted)).toBe(false);
    expect(isCapExhausted(exhausted)).toBe(true);
  });

  it('does not flag a cap with plenty left', () => {
    const cap = resolveRuleCap(
      cappedRule(),
      card({ capUsage: { grocery: capUsage({ qualifyingSpendUsd: 100 }) } }),
      AS_OF,
    );
    expect(isCapNearlyReached(cap)).toBe(false);
  });
});
