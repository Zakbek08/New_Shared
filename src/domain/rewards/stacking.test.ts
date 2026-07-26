/**
 * Paths the main matrix does not reach: spend thresholds, mixed-unit stacking, and
 * the offer matcher's own edge cases.
 */
import { evaluateWallet } from './evaluate';
import { bestOffer, offerApplies } from './offers';
import { levelFromRank, rankOf } from './confidence';
import { stackContributions } from './stacking';
import {
  CATEGORY,
  MERCHANT,
  PROGRAM,
  baseRule,
  capUsage,
  card,
  condition,
  context,
  intent,
  offer,
  rule,
  valuation,
} from './__fixtures__/wallet';

const evaluate = (
  cards: Parameters<typeof evaluateWallet>[1],
  overrides: Partial<Parameters<typeof evaluateWallet>[0]> = {},
  ctx: Partial<Parameters<typeof evaluateWallet>[2]> = {},
) => evaluateWallet(intent(overrides), cards, context(ctx));

const codeOf = (result: ReturnType<typeof evaluateWallet>, userCardId: string) =>
  result.ineligible.find((candidate) => candidate.card.userCardId === userCardId)
    ?.ineligibilityCode;

// ===========================================================================
// Spend thresholds
// ===========================================================================

describe('spend thresholds', () => {
  const thresholdCard = (spentSoFar: number | null) =>
    card({
      userCardId: 'threshold',
      rules: [
        baseRule(1),
        rule({
          id: 'unlocked',
          label: '5% once you have spent $1,000',
          kind: 'spend_threshold_bonus',
          baseRate: 5,
          spendThresholdUsd: 1000,
        }),
      ],
      capUsage:
        spentSoFar === null ? {} : { unlocked: capUsage({ qualifyingSpendUsd: spentSoFar }) },
    });

  it('withholds the bonus until the threshold is met', () => {
    // $600 of $1,000 spent: only the 1% base rule applies. 120 × 1% = $1.20.
    const result = evaluate([thresholdCard(600)]);
    expect(result.recommended?.breakdown.netValueUsd).toBe(1.2);
    expect(result.recommended?.breakdown.appliedRuleId).toBe('rule-base');
  });

  it('pays the bonus once the threshold is reached exactly', () => {
    // $1,000 spent meets the $1,000 threshold. 120 × 5% = $6.00.
    const result = evaluate([thresholdCard(1000)]);
    expect(result.recommended?.breakdown.netValueUsd).toBe(6);
    expect(result.recommended?.breakdown.appliedRuleId).toBe('unlocked');
  });

  it('pays the bonus once the threshold is exceeded', () => {
    expect(evaluate([thresholdCard(2500)]).recommended?.breakdown.netValueUsd).toBe(6);
  });

  it('treats no recorded spend as nothing spent', () => {
    const result = evaluate([thresholdCard(null)]);
    expect(result.recommended?.breakdown.netValueUsd).toBe(1.2);
  });

  it('reports spend_threshold_not_met when the threshold rule is the only one', () => {
    const onlyThreshold = card({
      userCardId: 'only-threshold',
      rules: [rule({ id: 'unlocked', baseRate: 5, spendThresholdUsd: 1000 })],
    });
    expect(codeOf(evaluate([onlyThreshold]), 'only-threshold')).toBe('spend_threshold_not_met');
  });
});

// ===========================================================================
// Mixed-unit stacking — the caveat documented in stacking.ts
// ===========================================================================

describe('mixed-unit stacking', () => {
  it('sums the dollar value across units but reports the primary’s unit', () => {
    const mixed = card({
      userCardId: 'mixed',
      rules: [
        // 3% cash back = $3.60 on $120.
        baseRule(3, { id: 'cash', stackGroup: 'cash' }),
        // 2x points at 1¢ = $2.40 on $120, stacking.
        rule({
          id: 'points',
          baseRate: 2,
          rewardUnit: 'points',
          rewardProgramId: PROGRAM.cobaltPoints,
          stackGroup: 'points',
          isStackable: true,
        }),
      ],
    });

    const result = evaluate(
      [mixed],
      {},
      {
        valuation: valuation({ byProgramId: { [PROGRAM.cobaltPoints]: 1 } }),
      },
    );

    const breakdown = result.recommended!.breakdown;

    // The dollar total is complete: 3.60 + 2.40 = 6.00.
    expect(breakdown.rewardValueUsd).toBe(6);
    // The headline describes the primary contribution only, which keeps it truthful
    // rather than summing incompatible units.
    expect(breakdown.rewardUnit).toBe('usd');
    expect(breakdown.grossRewardUnits).toBe(3.6);
    expect(breakdown.effectiveRate).toBe(3);
  });

  it('composes two non-stackable rules in different groups', () => {
    const twoGroups = card({
      userCardId: 'two-groups',
      rules: [
        baseRule(2, { id: 'a', stackGroup: 'first' }),
        baseRule(3, { id: 'b', stackGroup: 'second' }),
      ],
    });

    // Different groups compose: 120 × 2% + 120 × 3% = $6.00.
    expect(evaluate([twoGroups]).recommended?.breakdown.rewardValueUsd).toBe(6);
  });

  it('keeps only the best rule within one group', () => {
    const oneGroup = card({
      userCardId: 'one-group',
      rules: [
        baseRule(2, { id: 'a', stackGroup: 'same' }),
        baseRule(3, { id: 'b', stackGroup: 'same' }),
      ],
    });

    // Same group: only the 3% rule applies. 120 × 3% = $3.60.
    expect(evaluate([oneGroup]).recommended?.breakdown.rewardValueUsd).toBe(3.6);
  });
});

describe('stackContributions', () => {
  it('returns an empty stack for no contributions', () => {
    const stacked = stackContributions([]);
    expect(stacked.primary).toBeNull();
    expect(stacked.rewardValueUsd).toBe(0);
    expect(stacked.unit).toBeNull();
    expect(stacked.effectiveRate).toBeNull();
  });
});

// ===========================================================================
// Offer matching, directly
// ===========================================================================

describe('offerApplies', () => {
  it('rejects an offer with neither a merchant id nor a label', () => {
    // The database forbids this; refusing to apply it is the safe reading.
    expect(offerApplies(offer({ rate: 10 }), intent(), context().asOf)).toBe(false);
  });

  it('rejects an offer whose label is only whitespace', () => {
    expect(
      offerApplies(offer({ merchantLabel: '   ', rate: 10 }), intent(), context().asOf),
    ).toBe(false);
  });

  it('matches a label that is a substring of what the user typed', () => {
    expect(
      offerApplies(
        offer({ merchantLabel: 'Greenleaf', rate: 10 }),
        intent({ merchantInput: 'Greenleaf Market Downtown' }),
        context().asOf,
      ),
    ).toBe(true);
  });

  it('matches when what the user typed is a substring of the label', () => {
    expect(
      offerApplies(
        offer({ merchantLabel: 'Greenleaf Market Downtown', rate: 10 }),
        intent({ merchantInput: 'Greenleaf' }),
        context().asOf,
      ),
    ).toBe(true);
  });

  it('prefers the merchant id over the label when both are present', () => {
    const withBoth = offer({
      merchantId: MERCHANT.trattoriaNove,
      merchantLabel: 'Greenleaf Market',
      rate: 10,
    });
    // The id does not match this purchase, so the label is not consulted.
    expect(offerApplies(withBoth, intent(), context().asOf)).toBe(false);
  });

  it('rejects an offer that has not started yet', () => {
    expect(
      offerApplies(
        offer({
          merchantId: MERCHANT.greenleafMarket,
          rate: 10,
          startsAt: new Date('2026-12-01T00:00:00.000Z'),
        }),
        intent(),
        context().asOf,
      ),
    ).toBe(false);
  });
});

describe('bestOffer', () => {
  it('returns nothing on either side when no offer applies', () => {
    expect(bestOffer([], intent(), valuation(), context().asOf)).toEqual({
      applied: null,
      awaitingActivation: null,
    });
  });

  it('does not count an offer the user has not activated', () => {
    // A targeted offer pays nothing until it is activated with the issuer. Counting
    // it would promise money the purchase will not earn.
    const result = bestOffer(
      [offer({ merchantId: MERCHANT.greenleafMarket, rate: 10, isEnrolled: false })],
      intent(),
      valuation(),
      context().asOf,
    );

    expect(result.applied).toBeNull();
    // Still surfaced, with what it would be worth, so the UI can prompt for it:
    // 120 × 10% = $12.00.
    expect(result.awaitingActivation?.valueUsd).toBe(12);
    expect(result.awaitingActivation?.requiresActivation).toBe(true);
  });

  it('prefers an activated smaller offer over an unactivated larger one', () => {
    // $6 the user can claim beats $12 they cannot.
    const result = bestOffer(
      [
        offer({ id: 'small', merchantId: MERCHANT.greenleafMarket, rate: 5, isEnrolled: true }),
        offer({
          id: 'large',
          merchantId: MERCHANT.greenleafMarket,
          rate: 10,
          isEnrolled: false,
        }),
      ],
      intent(),
      valuation(),
      context().asOf,
    );

    expect(result.applied?.offer.id).toBe('small');
    expect(result.awaitingActivation?.offer.id).toBe('large');
  });

  it('values a points offer with the user’s per-unit figure', () => {
    // 120 × 3 = 360 points × 1.5¢ = $5.40.
    const result = bestOffer(
      [
        offer({
          merchantId: MERCHANT.greenleafMarket,
          rewardType: 'points_per_dollar',
          rewardUnit: 'points',
          rate: 3,
        }),
      ],
      intent(),
      valuation({ byUnit: { usd: 1, points: 1.5, miles: 1.5 } }),
      context().asOf,
    );

    expect(result.applied?.valueUsd).toBe(5.4);
  });

  it('values a points offer at zero for a cash-back-only user', () => {
    const result = bestOffer(
      [
        offer({
          merchantId: MERCHANT.greenleafMarket,
          rewardType: 'points_per_dollar',
          rewardUnit: 'points',
          rate: 3,
        }),
      ],
      intent(),
      valuation({ prefersCashBackOnly: true }),
      context().asOf,
    );

    expect(result.applied?.valueUsd).toBe(0);
  });

  it('breaks a value tie on offer id, so the result is stable', () => {
    const offers = [
      offer({ id: 'bbb', merchantId: MERCHANT.greenleafMarket, rate: 5 }),
      offer({ id: 'aaa', merchantId: MERCHANT.greenleafMarket, rate: 5 }),
    ];

    expect(bestOffer(offers, intent(), valuation(), context().asOf).applied?.offer.id).toBe(
      'aaa',
    );
    expect(
      bestOffer([...offers].reverse(), intent(), valuation(), context().asOf).applied?.offer.id,
    ).toBe('aaa');
  });

  it('reports when the benefit cap trimmed the value', () => {
    const result = bestOffer(
      [offer({ merchantId: MERCHANT.greenleafMarket, rate: 10, maxBenefitUsd: 5 })],
      intent(),
      valuation(),
      context().asOf,
    );

    expect(result.applied?.valueUsd).toBe(5);
    expect(result.applied?.wasBenefitCapped).toBe(true);
  });

  it('handles a fixed-amount offer type', () => {
    const result = bestOffer(
      [
        offer({
          merchantId: MERCHANT.greenleafMarket,
          rewardType: 'fixed_amount',
          fixedAmountUsd: 15,
        }),
      ],
      intent(),
      valuation(),
      context().asOf,
    );

    expect(result.applied?.valueUsd).toBe(15);
  });
});

// ===========================================================================
// Confidence helpers
// ===========================================================================

describe('levelFromRank', () => {
  it('round-trips with rankOf', () => {
    for (const level of ['low', 'medium', 'high'] as const) {
      expect(levelFromRank(rankOf(level))).toBe(level);
    }
  });

  it('clamps an out-of-range rank rather than returning undefined', () => {
    expect(levelFromRank(-5)).toBe('low');
    expect(levelFromRank(99)).toBe('high');
  });
});

// ===========================================================================
// A rule that qualifies but earns nothing
// ===========================================================================

describe('zero-earning rules', () => {
  it('reports zero_value_reward when a rule qualifies at a zero rate', () => {
    const zeroRate = card({
      userCardId: 'zero',
      rules: [rule({ id: 'nothing', baseRate: 0, bonusRate: 0 })],
    });
    expect(codeOf(evaluate([zeroRate]), 'zero')).toBe('zero_value_reward');
  });

  it('still surfaces an activation warning on a zero-earning card', () => {
    const blocked = card({
      userCardId: 'blocked',
      rules: [
        rule({ id: 'zero-base', baseRate: 0 }),
        rule({
          id: 'needs-activation',
          baseRate: 5,
          requiresEnrollment: true,
          conditions: [condition({ categoryIds: [CATEGORY.grocery] })],
        }),
      ],
    });

    const candidate = evaluate([blocked]).ineligible.find(
      (entry) => entry.card.userCardId === 'blocked',
    );
    expect(candidate?.warnings).toContain('enrollment_required');
  });
});
