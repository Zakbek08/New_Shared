/**
 * Phase 5 exit criterion: **changing a valuation demonstrably changes the ranking.**
 *
 * This is the claim the whole preferences screen rests on, so it is tested end to end
 * over the real path: preference rows → `buildValuation` → `evaluateWallet`. Nothing
 * is stubbed between the stored figure and the recommended card.
 *
 * The arithmetic, by hand, on a $100 restaurant purchase:
 *
 *   Points card, 4 points per dollar = 400 points
 *     at 1.5¢  → $6.00   wins
 *     at 1.0¢  → $4.00   wins
 *     at 0.75¢ → $3.00   ties the cash card, and loses the tie-break
 *     at 0.5¢  → $2.00   loses to the cash card
 *     at 0.0¢  → $0.00   still listed, worth nothing
 *   Cash card, 3% cash back on $100 = $3.00
 */
import { evaluateWallet, type PurchaseIntent } from '@/domain/rewards';
import { CATEGORY, card, categoryRule, rule } from '@/domain/rewards/__fixtures__/wallet';
import { buildValuation } from '@/features/recommendations/api/snapshot';
import type { RewardUnit, UserRewardPreferenceRow } from '@/types/database';

const AS_OF = new Date('2026-07-26T14:30:00.000Z');
const PROGRAM_ID = 'program-cobalt-points';

/** 4x points on dining, in the user's wallet. */
const POINTS_CARD = card({
  userCardId: 'points-card',
  displayName: 'Points Card',
  rules: [
    rule({
      id: 'points-dining',
      label: '4x points on dining',
      rewardUnit: 'points',
      rewardType: 'points_per_dollar',
      baseRate: 4,
      rewardProgramId: PROGRAM_ID,
      conditions: [
        { ...categoryRule({ categoryId: CATEGORY.dining, rate: 4 }).conditions[0]! },
      ],
    }),
  ],
});

/** A flat 3% cash-back card, the rival. */
const CASH_CARD = card({
  userCardId: 'cash-card',
  displayName: 'Cash Card',
  rules: [categoryRule({ id: 'cash-dining', categoryId: CATEGORY.dining, rate: 3 })],
});

const INTENT: PurchaseIntent = {
  merchantInput: 'Trattoria Nove',
  amountUsd: 100,
  currencyCode: 'USD',
  countryCode: 'US',
  channel: 'in_store',
  paymentMethod: 'physical_card',
  categoryId: CATEGORY.dining,
  merchantId: null,
  mcc: 5812,
  categoryMatchKind: 'user_selected',
  categoryConfidence: 'high',
  hasAmbiguousCoding: false,
};

function preferenceRow(
  overrides: Partial<UserRewardPreferenceRow> = {},
): UserRewardPreferenceRow {
  return {
    id: 'pref-1',
    user_id: 'user-1',
    reward_program_id: PROGRAM_ID,
    unit: 'points',
    cents_per_unit: 1,
    prefers_cash_back_only: false,
    minimum_switch_benefit_usd: 0,
    notes: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

/** The catalog's own figure for the program, as `loadWalletSnapshot` supplies it. */
const CATALOG_DEFAULTS = new Map<string, { unit: RewardUnit; centsPerUnit: number }>([
  [PROGRAM_ID, { unit: 'points', centsPerUnit: 1 }],
]);

/** Runs the whole path: stored preference rows → valuation → engine. */
function rank(preferences: readonly UserRewardPreferenceRow[]) {
  return evaluateWallet(INTENT, [POINTS_CARD, CASH_CARD], {
    asOf: AS_OF,
    homeCurrencyCode: 'USD',
    valuation: buildValuation(preferences, CATALOG_DEFAULTS),
  });
}

describe('a valuation change re-ranks the wallet', () => {
  it('at 1.5¢ per point the points card wins with $6.00', () => {
    // 400 points × 1.5¢ = $6.00, against the cash card's $3.00.
    const result = rank([preferenceRow({ cents_per_unit: 1.5 })]);

    expect(result.recommended?.card.userCardId).toBe('points-card');
    expect(result.recommended?.breakdown.netValueUsd).toBe(6);
    expect(result.runnerUp?.breakdown.netValueUsd).toBe(3);
  });

  it('at 0.5¢ per point the cash card wins instead', () => {
    // 400 points × 0.5¢ = $2.00, which loses to $3.00. Same wallet, same purchase,
    // different answer — because the user values the currency differently.
    const result = rank([preferenceRow({ cents_per_unit: 0.5 })]);

    expect(result.recommended?.card.userCardId).toBe('cash-card');
    expect(result.recommended?.breakdown.netValueUsd).toBe(3);
    expect(result.runnerUp?.breakdown.netValueUsd).toBe(2);
  });

  it('flips the winner across the break-even point', () => {
    // Break-even is 0.75¢: 400 points × 0.75¢ = $3.00, exactly the cash card.
    const justBelow = rank([preferenceRow({ cents_per_unit: 0.74 })]);
    const justAbove = rank([preferenceRow({ cents_per_unit: 0.76 })]);

    expect(justBelow.recommended?.card.userCardId).toBe('cash-card');
    expect(justAbove.recommended?.card.userCardId).toBe('points-card');
  });

  it('breaks an exact tie towards cash back, which needs no redeeming', () => {
    // At 0.75¢ both are worth $3.00. Cash wins the tie-break on merit: no redemption
    // effort, no devaluation risk.
    const result = rank([preferenceRow({ cents_per_unit: 0.75 })]);

    expect(result.recommended?.breakdown.netValueUsd).toBe(3);
    expect(result.recommended?.card.userCardId).toBe('cash-card');
  });

  it('honours a valuation of zero, valuing the points card at $0.00', () => {
    // "These points are worthless to me" is a legitimate position, and the engine
    // takes it literally rather than substituting a default. The card stays in the
    // list at $0.00 with its 400 points still stated, so the user can see what it
    // earned and why that is worth nothing *to them*. Hiding it would obscure the
    // consequence of their own setting.
    const result = rank([preferenceRow({ cents_per_unit: 0 })]);

    expect(result.recommended?.card.userCardId).toBe('cash-card');

    const points = result.eligible.find(
      (candidate) => candidate.card.userCardId === 'points-card',
    );
    expect(points?.breakdown.netValueUsd).toBe(0);
    expect(points?.breakdown.grossRewardUnits).toBe(400);
    expect(points?.breakdown.appliedCentsPerUnit).toBe(0);
  });

  it('falls back to the catalog figure when the user has said nothing', () => {
    // No preference rows: the catalog's 1¢ applies, so 400 points is $4.00 and the
    // points card wins — but on a figure the user has not agreed to, which is why the
    // screen asks.
    const result = rank([]);

    expect(result.recommended?.card.userCardId).toBe('points-card');
    expect(result.recommended?.breakdown.netValueUsd).toBe(4);
  });

  it('lets a per-unit default apply to a program with no specific figure', () => {
    const result = rank([preferenceRow({ reward_program_id: null, cents_per_unit: 0.4 })]);

    // 400 × 0.4¢ = $1.60, so the cash card wins.
    expect(result.recommended?.card.userCardId).toBe('cash-card');
  });

  it('prefers the program-specific figure over the per-unit default', () => {
    const result = rank([
      preferenceRow({ id: 'unit', reward_program_id: null, cents_per_unit: 0.4 }),
      preferenceRow({ id: 'program', reward_program_id: PROGRAM_ID, cents_per_unit: 2 }),
    ]);

    // 400 × 2¢ = $8.00 beats $3.00.
    expect(result.recommended?.card.userCardId).toBe('points-card');
    expect(result.recommended?.breakdown.netValueUsd).toBe(8);
  });
});

describe('cash-back-only mode', () => {
  it('rules out a points card even when it would earn more', () => {
    // At 1.5¢ the points card is worth $6.00 against $3.00, and is still excluded:
    // the user asked not to be sent to a points card at all.
    const result = rank([preferenceRow({ cents_per_unit: 1.5, prefers_cash_back_only: true })]);

    expect(result.recommended?.card.userCardId).toBe('cash-card');
    expect(
      result.ineligible.find((candidate) => candidate.card.userCardId === 'points-card')
        ?.ineligibilityCode,
    ).toBe('non_cash_reward_declined');
  });

  it('says the exclusion was the user’s own choice', () => {
    const result = rank([preferenceRow({ cents_per_unit: 1.5, prefers_cash_back_only: true })]);

    const excluded = result.ineligible.find(
      (candidate) => candidate.card.userCardId === 'points-card',
    );

    // The reason has to point back at the setting, or the user will think the card
    // stopped earning.
    expect(excluded?.reason).toMatch(/you have asked us to ignore/i);
    expect(excluded?.reason).toMatch(/points or miles/i);
  });
});

describe('the minimum switch benefit', () => {
  const preferredCash = { ...CASH_CARD, isPreferred: true };

  function rankWithPreferred(threshold: number, centsPerUnit: number) {
    return evaluateWallet(INTENT, [POINTS_CARD, preferredCash], {
      asOf: AS_OF,
      homeCurrencyCode: 'USD',
      valuation: buildValuation(
        [
          preferenceRow({
            cents_per_unit: centsPerUnit,
            minimum_switch_benefit_usd: threshold,
          }),
        ],
        CATALOG_DEFAULTS,
      ),
    });
  }

  it('keeps the preferred card when the gain is below the threshold', () => {
    // 400 × 0.8¢ = $3.20 against the preferred card's $3.00: a 20-cent gain, below a
    // $1.00 threshold. Telling someone to dig out a different card for 20 cents is
    // the behaviour this setting exists to stop.
    const result = rankWithPreferred(1, 0.8);

    expect(result.recommended?.card.userCardId).toBe('cash-card');
    expect(result.explanation).toMatch(/not enough to be worth switching/i);
  });

  it('switches once the gain clears the threshold', () => {
    // 400 × 1.5¢ = $6.00, a $3.00 gain, well over the $1.00 threshold.
    const result = rankWithPreferred(1, 1.5);

    expect(result.recommended?.card.userCardId).toBe('points-card');
  });

  it('switches for any gain when the threshold is zero', () => {
    const result = rankWithPreferred(0, 0.8);

    expect(result.recommended?.card.userCardId).toBe('points-card');
    expect(result.recommended?.breakdown.netValueUsd).toBe(3.2);
  });
});

describe('determinism across the whole path', () => {
  it('gives byte-identical output for the same preferences', () => {
    const preferences = [preferenceRow({ cents_per_unit: 1.25 })];

    expect(rank(preferences)).toEqual(rank(preferences));
  });

  it('depends on the stored figure and nothing else', () => {
    // Two callers with the same wallet and different stored figures must differ, and
    // with the same figure must agree. That is the whole contract of this screen.
    expect(
      rank([preferenceRow({ cents_per_unit: 1.5 })]).recommended?.card.userCardId,
    ).not.toBe(rank([preferenceRow({ cents_per_unit: 0.5 })]).recommended?.card.userCardId);
  });
});
