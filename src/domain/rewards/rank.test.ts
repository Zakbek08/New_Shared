/**
 * Ranking tests, working on synthetic candidates so the ordering rules can be
 * exercised in isolation from the reward arithmetic.
 */
import type { ConfidenceLevel, RewardUnit } from '@/types/database';

import { compareCandidates, overallConfidence, rankCandidates } from './rank';
import { card } from './__fixtures__/wallet';
import type { RecommendationCandidate, RecommendationWarning, RewardBreakdown } from './types';

function candidate(options: {
  readonly id: string;
  readonly net: number;
  readonly name?: string;
  readonly isPreferred?: boolean;
  readonly confidence?: ConfidenceLevel;
  readonly unit?: RewardUnit;
  readonly warnings?: readonly RecommendationWarning[];
  readonly isEligible?: boolean;
  /**
   * A foreign transaction fee, with `net` treated as the already-floored figure.
   *
   * Set this to build the abroad case, where two cards both report $0.00 net but
   * one lost less to the fee.
   */
  readonly fee?: number;
  /** Gross reward before the fee. Defaults to `net`, the no-fee case. */
  readonly gross?: number;
}): RecommendationCandidate {
  const breakdown: RewardBreakdown = {
    appliedRuleId: `${options.id}-rule`,
    appliedRuleLabel: 'Test rule',
    appliedOfferId: null,
    rewardType:
      options.unit === 'usd' || options.unit === undefined
        ? 'cash_back_percent'
        : 'points_per_dollar',
    rewardUnit: options.unit ?? 'usd',
    effectiveRate: 2,
    withinCapSpendUsd: 0,
    overCapSpendUsd: 0,
    postCapRate: null,
    grossRewardUnits: options.gross ?? options.net,
    appliedCentsPerUnit: null,
    rewardValueUsd: options.gross ?? options.net,
    offerValueUsd: 0,
    statementCreditUsd: 0,
    foreignTransactionFeeUsd: options.fee ?? 0,
    netValueUsd: options.net,
  };

  return {
    card: card({
      userCardId: options.id,
      displayName: options.name ?? options.id,
      isPreferred: options.isPreferred ?? false,
    }),
    rank: 0,
    isEligible: options.isEligible ?? true,
    breakdown,
    confidence: options.confidence ?? 'high',
    reason: 'Test reason',
    ineligibilityCode: (options.isEligible ?? true) ? null : 'category_mismatch',
    capAmountUsd: null,
    capRemainingUsd: null,
    capPeriod: null,
    sourceVerifiedAt: null,
    verificationStatus: 'verified',
    warnings: options.warnings ?? [],
  };
}

describe('compareCandidates', () => {
  it('orders by net value first', () => {
    const better = candidate({ id: 'a', net: 7.2 });
    const worse = candidate({ id: 'b', net: 2.4 });
    expect(compareCandidates(better, worse)).toBeLessThan(0);
    expect(compareCandidates(worse, better)).toBeGreaterThan(0);
  });

  it('is antisymmetric, so the sort is stable', () => {
    const a = candidate({ id: 'a', net: 5, name: 'A' });
    const b = candidate({ id: 'b', net: 5, name: 'B' });
    expect(Math.sign(compareCandidates(a, b))).toBe(-Math.sign(compareCandidates(b, a)));
  });

  it('returns zero only for genuinely indistinguishable candidates', () => {
    const a = candidate({ id: 'x', net: 5, name: 'Same Name' });
    const b = candidate({ id: 'y', net: 5, name: 'Same Name' });
    expect(compareCandidates(a, b)).toBe(0);
  });
});

describe('rankCandidates — ordering', () => {
  it('sorts eligible candidates best first and stamps ranks', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'low', net: 1 }),
        candidate({ id: 'high', net: 9 }),
        candidate({ id: 'mid', net: 5 }),
      ],
      0,
    );

    expect(ranked.eligible.map((c) => c.card.userCardId)).toEqual(['high', 'mid', 'low']);
    expect(ranked.eligible.map((c) => c.rank)).toEqual([1, 2, 3]);
    expect(ranked.recommended?.card.userCardId).toBe('high');
    expect(ranked.runnerUp?.card.userCardId).toBe('mid');
    expect(ranked.advantageOverRunnerUpUsd).toBe(4);
  });

  it('separates ineligible candidates and orders them by name', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'z', net: 0, name: 'Zebra', isEligible: false }),
        candidate({ id: 'a', net: 0, name: 'Apple', isEligible: false }),
        candidate({ id: 'ok', net: 3 }),
      ],
      0,
    );

    expect(ranked.eligible).toHaveLength(1);
    expect(ranked.ineligible.map((c) => c.card.displayName)).toEqual(['Apple', 'Zebra']);
    expect(ranked.ineligible.map((c) => c.rank)).toEqual([1, 2]);
  });

  it('handles a wallet where nothing qualifies', () => {
    const ranked = rankCandidates([candidate({ id: 'a', net: 0, isEligible: false })], 0);

    expect(ranked.recommended).toBeNull();
    expect(ranked.runnerUp).toBeNull();
    expect(ranked.advantageOverRunnerUpUsd).toBeNull();
  });

  it('reports a null advantage when there is only one eligible card', () => {
    const ranked = rankCandidates([candidate({ id: 'only', net: 5 })], 0);
    expect(ranked.runnerUp).toBeNull();
    expect(ranked.advantageOverRunnerUpUsd).toBeNull();
  });

  it('never reports a negative advantage', () => {
    const ranked = rankCandidates(
      [candidate({ id: 'a', net: 5 }), candidate({ id: 'b', net: 5 })],
      0,
    );
    expect(ranked.advantageOverRunnerUpUsd).toBe(0);
  });

  it('rounds the advantage to cents', () => {
    // 7.2 - 6 is 1.2000000000000002 in IEEE-754.
    const ranked = rankCandidates(
      [candidate({ id: 'a', net: 7.2 }), candidate({ id: 'b', net: 6 })],
      0,
    );
    expect(ranked.advantageOverRunnerUpUsd).toBe(1.2);
  });
});

describe('rankCandidates — tie breaks, in order', () => {
  it('1. then the pre-floor net, when a fee wiped out both rewards', () => {
    // Abroad on a $120 purchase with a 3% fee ($3.60): a 2% card earns $2.40 and a
    // 0.5% card earns $0.60. Both report $0.00 because a reward is never negative,
    // but the 2% card costs the user $1.80 less. Ranking them as equal would tell
    // someone to reach for the worse card.
    const ranked = rankCandidates(
      [
        candidate({ id: 'thin', net: 0, name: 'A Thin', gross: 0.6, fee: 3.6 }),
        candidate({ id: 'thick', net: 0, name: 'Z Thick', gross: 2.4, fee: 3.6 }),
      ],
      0,
    );

    expect(ranked.recommended?.card.userCardId).toBe('thick');
  });

  it('2. prefers the preferred card', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'plain', net: 5, name: 'A Plain' }),
        candidate({ id: 'pref', net: 5, name: 'Z Preferred', isPreferred: true }),
      ],
      0,
    );

    expect(ranked.recommended?.card.userCardId).toBe('pref');
    expect(ranked.tieBrokenByPreference).toBe(true);
  });

  it('3. then higher confidence', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'low', net: 5, name: 'A', confidence: 'low' }),
        candidate({ id: 'high', net: 5, name: 'B', confidence: 'high' }),
      ],
      0,
    );
    expect(ranked.recommended?.card.userCardId).toBe('high');
  });

  it('4. then cash back over points', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'points', net: 5, name: 'A', unit: 'points' }),
        candidate({ id: 'cash', net: 5, name: 'B', unit: 'usd' }),
      ],
      0,
    );
    expect(ranked.recommended?.card.userCardId).toBe('cash');
  });

  it('5. then fewer warnings', () => {
    const ranked = rankCandidates(
      [
        candidate({
          id: 'noisy',
          net: 5,
          name: 'A',
          warnings: ['cap_nearly_reached', 'source_stale'],
        }),
        candidate({ id: 'clean', net: 5, name: 'B', warnings: [] }),
      ],
      0,
    );
    expect(ranked.recommended?.card.userCardId).toBe('clean');
  });

  it('6. then alphabetically, so the answer never shifts on refresh', () => {
    const forwards = rankCandidates(
      [
        candidate({ id: 'z', net: 5, name: 'Zebra' }),
        candidate({ id: 'a', net: 5, name: 'Apple' }),
      ],
      0,
    );
    const backwards = rankCandidates(
      [
        candidate({ id: 'a', net: 5, name: 'Apple' }),
        candidate({ id: 'z', net: 5, name: 'Zebra' }),
      ],
      0,
    );

    expect(forwards.recommended?.card.displayName).toBe('Apple');
    expect(backwards.recommended?.card.displayName).toBe('Apple');
  });

  it('does not claim a preference tie-break when the values differ', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'pref', net: 9, isPreferred: true }),
        candidate({ id: 'other', net: 5 }),
      ],
      0,
    );
    expect(ranked.tieBrokenByPreference).toBe(false);
  });
});

describe('rankCandidates — minimum switch benefit', () => {
  it('holds the preferred card when the gain is below the threshold', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'better', net: 2.46, name: 'Better' }),
        candidate({ id: 'pref', net: 2.4, name: 'Preferred', isPreferred: true }),
      ],
      0.5,
    );

    expect(ranked.recommended?.card.userCardId).toBe('pref');
    expect(ranked.heldForMinimumBenefit).toBe(true);
    // Reporting a negative advantage would be nonsense.
    expect(ranked.advantageOverRunnerUpUsd).toBe(0);
  });

  it('keeps the rest of the order behind the promoted card', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'better', net: 2.46, name: 'Better' }),
        candidate({ id: 'pref', net: 2.4, name: 'Preferred', isPreferred: true }),
        candidate({ id: 'worst', net: 1, name: 'Worst' }),
      ],
      0.5,
    );

    expect(ranked.eligible.map((c) => c.card.userCardId)).toEqual(['pref', 'better', 'worst']);
  });

  it('switches when the gain clears the threshold', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'better', net: 7.2, name: 'Better' }),
        candidate({ id: 'pref', net: 2.4, name: 'Preferred', isPreferred: true }),
      ],
      0.5,
    );

    expect(ranked.recommended?.card.userCardId).toBe('better');
    expect(ranked.heldForMinimumBenefit).toBe(false);
  });

  it('does nothing when the threshold is zero', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'better', net: 2.46, name: 'Better' }),
        candidate({ id: 'pref', net: 2.4, name: 'Preferred', isPreferred: true }),
      ],
      0,
    );
    expect(ranked.recommended?.card.userCardId).toBe('better');
  });

  it('does nothing when the preferred card already won', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'pref', net: 9, name: 'Preferred', isPreferred: true }),
        candidate({ id: 'other', net: 5, name: 'Other' }),
      ],
      0.5,
    );
    expect(ranked.heldForMinimumBenefit).toBe(false);
    expect(ranked.advantageOverRunnerUpUsd).toBe(4);
  });

  it('does nothing when the preferred card did not qualify', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'better', net: 2.46, name: 'Better' }),
        candidate({
          id: 'pref',
          net: 0,
          name: 'Preferred',
          isPreferred: true,
          isEligible: false,
        }),
      ],
      0.5,
    );
    expect(ranked.recommended?.card.userCardId).toBe('better');
  });

  it('compares at the boundary using rounded cents', () => {
    // A gain of exactly the threshold is enough to switch.
    const ranked = rankCandidates(
      [
        candidate({ id: 'better', net: 2.9, name: 'Better' }),
        candidate({ id: 'pref', net: 2.4, name: 'Preferred', isPreferred: true }),
      ],
      0.5,
    );
    expect(ranked.recommended?.card.userCardId).toBe('better');
  });
});

describe('overallConfidence', () => {
  it('reports the recommended card’s confidence', () => {
    expect(overallConfidence(candidate({ id: 'a', net: 5, confidence: 'medium' }))).toBe(
      'medium',
    );
  });

  it('reports low when there is no recommendation', () => {
    expect(overallConfidence(null)).toBe('low');
  });
});
