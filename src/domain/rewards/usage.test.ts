/**
 * Cap consumption from an accepted recommendation.
 *
 * This is the only writer of `reward_usage`, and `reward_usage` is the only reason
 * the engine knows a cap has been partly used. Get the arithmetic wrong and every
 * later recommendation is wrong with it — quietly, in the user's favour or against
 * it, with nothing on screen to reveal the error.
 */
import { evaluateWallet } from './evaluate';
import { adjustedUsage, mergeUsage, usageDeltaFor } from './usage';
import {
  AS_OF,
  CATEGORY,
  capUsage,
  card,
  categoryRule,
  context,
  intent,
  rule,
} from './__fixtures__/wallet';

/** Evaluates a $120 grocery purchase and returns the winning candidate. */
function winnerFor(cards: Parameters<typeof evaluateWallet>[1], asOf: Date = AS_OF) {
  const result = evaluateWallet(intent(), cards, context({ asOf }));
  if (result.recommended === null) throw new Error('fixture should produce a winner');
  return result.recommended;
}

const cappedGroceryCard = (spent = 0) =>
  card({
    userCardId: 'user-card-1',
    rules: [
      categoryRule({
        id: 'grocery-bonus',
        categoryId: CATEGORY.grocery,
        rate: 6,
        capAmount: 6000,
        capPeriod: 'calendar_year',
        postCapRate: 1,
      }),
    ],
    capUsage: spent === 0 ? {} : { 'grocery-bonus': capUsage({ qualifyingSpendUsd: spent }) },
  });

describe('usageDeltaFor', () => {
  it('records the whole purchase against an untouched cap', () => {
    // $120 at 6% under a $6,000 cap: all $120 of spend counts, earning $7.20.
    const delta = usageDeltaFor({ candidate: winnerFor([cappedGroceryCard()]), asOf: AS_OF });

    expect(delta).toEqual({
      userCardId: 'user-card-1',
      rewardRuleId: 'grocery-bonus',
      capPeriod: 'calendar_year',
      periodStart: new Date('2026-01-01T00:00:00.000Z'),
      periodEnd: new Date('2027-01-01T00:00:00.000Z'),
      qualifyingSpendUsd: 120,
      accruedRewardUnits: 7.2,
      accruedRewardUsd: 7.2,
    });
  });

  it('records only the portion that earned the bonus when the cap bit', () => {
    // $5,950 already spent leaves $50 under the cap; the other $70 earned the 1%
    // post-cap rate and must not consume cap it never used.
    const delta = usageDeltaFor({
      candidate: winnerFor([cappedGroceryCard(5950)]),
      asOf: AS_OF,
    });

    expect(delta?.qualifyingSpendUsd).toBe(50);
    // The reward is still the full $3.70 the purchase earned: $3.00 + $0.70.
    expect(delta?.accruedRewardUsd).toBe(3.7);
  });

  it('records nothing for an uncapped rule', () => {
    // There is no cap to track, and a row here would be noise in a table the engine
    // reads on every single evaluation.
    const uncapped = card({
      rules: [categoryRule({ categoryId: CATEGORY.grocery, rate: 2 })],
    });

    expect(usageDeltaFor({ candidate: winnerFor([uncapped]), asOf: AS_OF })).toBeNull();
  });

  it('records nothing for an ineligible candidate', () => {
    const diningOnly = card({
      userCardId: 'dining',
      rules: [categoryRule({ id: 'dining', categoryId: CATEGORY.dining, rate: 4 })],
    });
    const result = evaluateWallet(intent(), [diningOnly], context());
    const rejected = result.ineligible[0];

    expect(rejected).toBeDefined();
    expect(usageDeltaFor({ candidate: rejected!, asOf: AS_OF })).toBeNull();
  });

  it('resolves the window from the cap period, not from the purchase date', () => {
    // A quarterly cap on a July purchase belongs to Q3, which is what makes the cap
    // reset on 1 October rather than a year after the purchase.
    const quarterly = card({
      rules: [
        categoryRule({
          id: 'quarterly-bonus',
          categoryId: CATEGORY.grocery,
          rate: 5,
          capAmount: 1500,
          capPeriod: 'quarterly',
        }),
      ],
    });

    const delta = usageDeltaFor({ candidate: winnerFor([quarterly]), asOf: AS_OF });

    expect(delta?.periodStart).toEqual(new Date('2026-07-01T00:00:00.000Z'));
    expect(delta?.periodEnd).toEqual(new Date('2026-10-01T00:00:00.000Z'));
  });

  it('anchors a cardmember-year cap to the account open date', () => {
    const anniversary = card({
      accountOpenedOn: new Date('2024-03-14T00:00:00.000Z'),
      rules: [
        categoryRule({
          id: 'anniversary-bonus',
          categoryId: CATEGORY.grocery,
          rate: 5,
          capAmount: 3000,
          capPeriod: 'cardmember_year',
        }),
      ],
    });

    const delta = usageDeltaFor({ candidate: winnerFor([anniversary]), asOf: AS_OF });

    // AS_OF is 2026-07-26, so the current cardmember year runs 2026-03-14 to
    // 2027-03-14.
    expect(delta?.periodStart).toEqual(new Date('2026-03-14T00:00:00.000Z'));
    expect(delta?.periodEnd).toEqual(new Date('2027-03-14T00:00:00.000Z'));
  });

  it('gives a lifetime cap a bounded window, because the columns are NOT NULL', () => {
    const lifetime = card({
      rules: [
        categoryRule({
          id: 'intro-bonus',
          categoryId: CATEGORY.grocery,
          rate: 5,
          capAmount: 1000,
          capPeriod: 'lifetime',
        }),
      ],
    });

    const delta = usageDeltaFor({ candidate: winnerFor([lifetime]), asOf: AS_OF });

    expect(delta?.periodStart).toEqual(AS_OF);
    expect(delta?.periodEnd.getTime()).toBe(AS_OF.getTime() + 86_400_000);
    // `period_start < period_end` is a CHECK constraint, so this is not cosmetic.
    expect(delta!.periodStart.getTime()).toBeLessThan(delta!.periodEnd.getTime());
  });

  it('records points in units as well as in dollars', () => {
    // 3 points per dollar on $120 = 360 points, at 1.5¢ = $5.40.
    const pointsRule = rule({
      id: 'points-bonus',
      rewardUnit: 'points',
      rewardType: 'points_per_dollar',
      baseRate: 3,
      rewardProgramId: 'program-points',
      capAmount: 2000,
      capPeriod: 'calendar_year',
      conditions: [
        { ...categoryRule({ categoryId: CATEGORY.grocery, rate: 3 }).conditions[0]! },
      ],
    });

    const result = evaluateWallet(
      intent(),
      [card({ rules: [pointsRule] })],
      context({
        valuation: {
          byProgramId: { 'program-points': 1.5 },
          byUnit: { usd: 1, points: 1, miles: 1 },
          prefersCashBackOnly: false,
          minimumSwitchBenefitUsd: 0,
        },
      }),
    );

    const delta = usageDeltaFor({ candidate: result.recommended!, asOf: AS_OF });

    expect(delta?.accruedRewardUnits).toBe(360);
    expect(delta?.accruedRewardUsd).toBe(5.4);
  });

  it('is pure: the same candidate and instant give the same delta', () => {
    const candidate = winnerFor([cappedGroceryCard(1000)]);

    expect(usageDeltaFor({ candidate, asOf: AS_OF })).toEqual(
      usageDeltaFor({ candidate, asOf: AS_OF }),
    );
  });
});

describe('mergeUsage', () => {
  const delta = {
    userCardId: 'user-card-1',
    rewardRuleId: 'grocery-bonus',
    capPeriod: 'calendar_year' as const,
    periodStart: new Date('2026-01-01T00:00:00.000Z'),
    periodEnd: new Date('2027-01-01T00:00:00.000Z'),
    qualifyingSpendUsd: 120,
    accruedRewardUnits: 7.2,
    accruedRewardUsd: 7.2,
  };

  it('starts from zero when nothing was recorded', () => {
    expect(mergeUsage(null, delta)).toEqual({
      periodStart: delta.periodStart,
      periodEnd: delta.periodEnd,
      qualifyingSpendUsd: 120,
      accruedRewardUsd: 7.2,
    });
  });

  it('adds to an existing row for the same window', () => {
    // $1,200 already recorded plus this $120 purchase is $1,320.
    const existing = capUsage({ qualifyingSpendUsd: 1200, accruedRewardUsd: 72 });

    expect(mergeUsage(existing, delta)).toMatchObject({
      qualifyingSpendUsd: 1320,
      accruedRewardUsd: 79.2,
    });
  });

  it('starts from zero when the recorded row belongs to a previous window', () => {
    // This is how a cap resets. Carrying last year's $6,000 forward would tell the
    // user their bonus is exhausted when it is not.
    const lastYear = capUsage({
      periodStart: new Date('2025-01-01T00:00:00.000Z'),
      periodEnd: new Date('2026-01-01T00:00:00.000Z'),
      qualifyingSpendUsd: 6000,
      accruedRewardUsd: 360,
    });

    expect(mergeUsage(lastYear, delta)).toMatchObject({
      qualifyingSpendUsd: 120,
      accruedRewardUsd: 7.2,
    });
  });

  it('always stamps the delta’s own window', () => {
    const lastYear = capUsage({
      periodStart: new Date('2025-01-01T00:00:00.000Z'),
      periodEnd: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(mergeUsage(lastYear, delta).periodStart).toEqual(delta.periodStart);
    expect(mergeUsage(lastYear, delta).periodEnd).toEqual(delta.periodEnd);
  });

  it('rounds the sum to cents', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in IEEE-754, and this figure is persisted.
    const existing = capUsage({ qualifyingSpendUsd: 0.1, accruedRewardUsd: 0.1 });
    const penny = { ...delta, qualifyingSpendUsd: 0.2, accruedRewardUsd: 0.2 };

    expect(mergeUsage(existing, penny).qualifyingSpendUsd).toBe(0.3);
    expect(mergeUsage(existing, penny).accruedRewardUsd).toBe(0.3);
  });
});

describe('adjustedUsage', () => {
  const window = {
    periodStart: new Date('2026-01-01T00:00:00.000Z'),
    periodEnd: new Date('2027-01-01T00:00:00.000Z'),
  };

  it('replaces rather than adds, because the user is stating a total', () => {
    const usage = adjustedUsage({
      delta: window,
      qualifyingSpendUsd: 2000,
      accruedRewardUsd: 120,
      capAmountUsd: 6000,
      appliesTo: 'spend',
    });

    expect(usage.qualifyingSpendUsd).toBe(2000);
    expect(usage.accruedRewardUsd).toBe(120);
  });

  it('clamps a spend figure above the cap', () => {
    // A larger figure would make `capRemainingUsd` negative, and the engine treats
    // a cap as exhausted at zero regardless.
    const usage = adjustedUsage({
      delta: window,
      qualifyingSpendUsd: 9999,
      accruedRewardUsd: 0,
      capAmountUsd: 6000,
      appliesTo: 'spend',
    });

    expect(usage.qualifyingSpendUsd).toBe(6000);
  });

  it('clamps the reward figure instead when the cap applies to reward', () => {
    const usage = adjustedUsage({
      delta: window,
      qualifyingSpendUsd: 9999,
      accruedRewardUsd: 500,
      capAmountUsd: 300,
      appliesTo: 'reward',
    });

    expect(usage.accruedRewardUsd).toBe(300);
    // The spend figure is not the capped one, so it is recorded as stated.
    expect(usage.qualifyingSpendUsd).toBe(9999);
  });

  it('does not clamp when the rule is uncapped', () => {
    const usage = adjustedUsage({
      delta: window,
      qualifyingSpendUsd: 9999,
      accruedRewardUsd: 500,
      capAmountUsd: null,
      appliesTo: 'spend',
    });

    expect(usage.qualifyingSpendUsd).toBe(9999);
  });

  it('floors a negative figure at zero, which the column requires', () => {
    // `qualifying_spend_usd >= 0` is a CHECK constraint; a negative would be
    // rejected by the database rather than stored.
    const usage = adjustedUsage({
      delta: window,
      qualifyingSpendUsd: -50,
      accruedRewardUsd: -1,
      capAmountUsd: 6000,
      appliesTo: 'spend',
    });

    expect(usage.qualifyingSpendUsd).toBe(0);
    expect(usage.accruedRewardUsd).toBe(0);
  });

  it('accepts zero, which means "I have not used this bonus at all"', () => {
    const usage = adjustedUsage({
      delta: window,
      qualifyingSpendUsd: 0,
      accruedRewardUsd: 0,
      capAmountUsd: 6000,
      appliesTo: 'spend',
    });

    expect(usage.qualifyingSpendUsd).toBe(0);
  });
});

describe('the round trip: record a purchase, then re-evaluate', () => {
  it('shrinks the remaining cap by what the purchase consumed', () => {
    // The whole point of the table. $120 recorded against a $6,000 cap must leave
    // $5,880 for the next evaluation.
    const before = cappedGroceryCard();
    const delta = usageDeltaFor({ candidate: winnerFor([before]), asOf: AS_OF })!;
    const merged = mergeUsage(null, delta);

    const after = { ...before, capUsage: { 'grocery-bonus': merged } };
    const candidate = winnerFor([after]);

    expect(candidate.capRemainingUsd).toBe(5880);
    // The purchase still earns 6%, because $5,880 of headroom remains.
    expect(candidate.breakdown.netValueUsd).toBe(7.2);
  });

  it('drives the cap to exhaustion after enough recorded purchases', () => {
    // Fifty $120 purchases is $6,000 — exactly the cap. The fifty-first must fall to
    // the 1% post-cap rate: $1.20 rather than $7.20.
    let card = cappedGroceryCard();
    let usage = null as ReturnType<typeof mergeUsage> | null;

    for (let index = 0; index < 50; index += 1) {
      const delta = usageDeltaFor({ candidate: winnerFor([card]), asOf: AS_OF })!;
      usage = mergeUsage(usage, delta);
      card = { ...card, capUsage: { 'grocery-bonus': usage } };
    }

    expect(usage?.qualifyingSpendUsd).toBe(6000);

    const next = winnerFor([card]);
    expect(next.capRemainingUsd).toBe(0);
    expect(next.breakdown.netValueUsd).toBe(1.2);
  });
});
