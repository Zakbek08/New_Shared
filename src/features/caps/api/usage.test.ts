/**
 * Cap-usage and enrollment writes.
 *
 * These are the writes that make a cap move. The arithmetic lives in
 * `src/domain/rewards/usage.ts` and is tested there; what is asserted here is that
 * the right row is found, the right total is written, and the upsert targets the
 * unique constraint rather than colliding with it.
 */
import {
  callArgs,
  createSupabaseFake,
  postgrestError,
  type SupabaseFake,
} from '@/test-support/supabaseFake';

const fakeRef: { current: SupabaseFake | null } = { current: null };

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => fakeRef.current?.client,
  resetSupabaseClient: jest.fn(),
}));

import type { UsageDelta } from '@/domain/rewards';

import { adjustCapUsage, recordRewardUsage, setRuleEnrollment } from './usage';

const USER = { id: 'user-1', email: 'person@example.com' };

const PERIOD_START = new Date('2026-01-01T00:00:00.000Z');
const PERIOD_END = new Date('2027-01-01T00:00:00.000Z');

const delta: UsageDelta = {
  userCardId: 'card-1',
  rewardRuleId: 'rule-1',
  capPeriod: 'calendar_year',
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  qualifyingSpendUsd: 120,
  accruedRewardUnits: 7.2,
  accruedRewardUsd: 7.2,
};

const usageRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'usage-1',
  user_id: USER.id,
  user_card_id: 'card-1',
  reward_rule_id: 'rule-1',
  period_start: PERIOD_START.toISOString(),
  period_end: PERIOD_END.toISOString(),
  cap_period: 'calendar_year',
  qualifying_spend_usd: 1200,
  accrued_reward_units: 72,
  accrued_reward_usd: 72,
  is_user_adjusted: false,
  last_recorded_at: '2026-07-01T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  ...overrides,
});

describe('recordRewardUsage', () => {
  it('writes the delta when no row exists yet', async () => {
    fakeRef.current = createSupabaseFake({
      results: [{ data: null }, { data: null }],
      user: USER,
    });

    await recordRewardUsage(delta);

    expect(fakeRef.current.writes[0]).toMatchObject({
      user_id: USER.id,
      user_card_id: 'card-1',
      reward_rule_id: 'rule-1',
      cap_period: 'calendar_year',
      period_start: PERIOD_START.toISOString(),
      period_end: PERIOD_END.toISOString(),
      qualifying_spend_usd: 120,
      accrued_reward_usd: 7.2,
      is_user_adjusted: false,
    });
  });

  it('adds to the existing total rather than overwriting it', async () => {
    // $1,200 recorded plus this $120 purchase is $1,320. Overwriting would reset the
    // cap on every confirmation and hand the user a bonus they had already used.
    fakeRef.current = createSupabaseFake({
      results: [{ data: usageRow() }, { data: null }],
      user: USER,
    });

    await recordRewardUsage(delta);

    expect(fakeRef.current.writes[0]).toMatchObject({
      qualifying_spend_usd: 1320,
      accrued_reward_usd: 79.2,
      // Units are tracked separately, because the dollar figure depends on a valuation
      // the user can change while the units earned cannot.
      accrued_reward_units: 79.2,
    });
  });

  it('looks the row up by card, rule and window', async () => {
    fakeRef.current = createSupabaseFake({
      results: [{ data: null }, { data: null }],
      user: USER,
    });

    await recordRewardUsage(delta);

    const eqCalls = fakeRef.current.calls
      .filter((call) => call.method === 'eq')
      .map((call) => call.args);

    expect(eqCalls).toEqual([
      ['user_card_id', 'card-1'],
      ['reward_rule_id', 'rule-1'],
      ['period_start', PERIOD_START.toISOString()],
      ['period_end', PERIOD_END.toISOString()],
    ]);
  });

  it('upserts on the unique-window constraint', async () => {
    // `reward_usage_unique_window` covers exactly these four columns; targeting
    // anything else would make a second confirmation fail on the constraint.
    fakeRef.current = createSupabaseFake({
      results: [{ data: null }, { data: null }],
      user: USER,
    });

    await recordRewardUsage(delta);

    expect(callArgs(fakeRef.current, 'upsert')?.[1]).toMatchObject({
      onConflict: 'user_card_id,reward_rule_id,period_start,period_end',
    });
  });

  it('starts from zero when the stored row belongs to a previous window', async () => {
    // The lookup is window-scoped, so a stale row is simply not found. This is what
    // makes a cap reset.
    fakeRef.current = createSupabaseFake({
      results: [{ data: null }, { data: null }],
      user: USER,
    });

    await recordRewardUsage(delta);

    expect(fakeRef.current.writes[0]).toMatchObject({ qualifying_spend_usd: 120 });
  });

  it('refuses to write without a session', async () => {
    fakeRef.current = createSupabaseFake({ user: null });

    await expect(recordRewardUsage(delta)).rejects.toMatchObject({
      kind: 'unauthenticated',
    });
    expect(fakeRef.current.writes).toHaveLength(0);
  });

  it('surfaces a write failure', async () => {
    fakeRef.current = createSupabaseFake({
      results: [{ data: null }, { error: postgrestError('42501') }],
      user: USER,
    });

    await expect(recordRewardUsage(delta)).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('surfaces a read failure rather than writing a wrong total', async () => {
    // Writing after a failed read would silently overwrite whatever was there.
    fakeRef.current = createSupabaseFake({
      results: [{ error: postgrestError('42501') }],
      user: USER,
    });

    await expect(recordRewardUsage(delta)).rejects.toMatchObject({ kind: 'forbidden' });
    expect(fakeRef.current.writes).toHaveLength(0);
  });
});

describe('adjustCapUsage', () => {
  const window = {
    userCardId: 'card-1',
    rewardRuleId: 'rule-1',
    capPeriod: 'calendar_year' as const,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
  };

  it('replaces the total and marks the row user-adjusted', async () => {
    fakeRef.current = createSupabaseFake({ results: [{ data: null }], user: USER });

    await adjustCapUsage({
      window,
      qualifyingSpendUsd: 2000,
      accruedRewardUsd: 120,
      capAmountUsd: 6000,
      appliesTo: 'spend',
    });

    expect(fakeRef.current.writes[0]).toMatchObject({
      qualifying_spend_usd: 2000,
      accrued_reward_usd: 120,
      // The tracker uses this to say the figure came from the user rather than from
      // confirmed recommendations.
      is_user_adjusted: true,
    });
  });

  it('clamps a figure above the cap before writing it', async () => {
    fakeRef.current = createSupabaseFake({ results: [{ data: null }], user: USER });

    await adjustCapUsage({
      window,
      qualifyingSpendUsd: 9999,
      accruedRewardUsd: 0,
      capAmountUsd: 6000,
      appliesTo: 'spend',
    });

    expect(fakeRef.current.writes[0]).toMatchObject({ qualifying_spend_usd: 6000 });
  });

  it('does not read the existing row, because the user is stating a total', async () => {
    fakeRef.current = createSupabaseFake({ results: [{ data: null }], user: USER });

    await adjustCapUsage({
      window,
      qualifyingSpendUsd: 500,
      accruedRewardUsd: 30,
      capAmountUsd: 6000,
      appliesTo: 'spend',
    });

    expect(fakeRef.current.calls.some((call) => call.method === 'select')).toBe(false);
  });
});

describe('setRuleEnrollment', () => {
  it('stamps enrolled_at when the user says they activated the bonus', async () => {
    fakeRef.current = createSupabaseFake({ results: [{ data: null }], user: USER });

    await setRuleEnrollment({
      userCardId: 'card-1',
      rewardRuleId: 'rule-1',
      status: 'enrolled',
    });

    const write = fakeRef.current.writes[0] as Record<string, unknown>;
    expect(write).toMatchObject({
      user_id: USER.id,
      user_card_id: 'card-1',
      reward_rule_id: 'rule-1',
      status: 'enrolled',
    });
    expect(typeof write['enrolled_at']).toBe('string');
  });

  it('clears enrolled_at for any status other than enrolled', async () => {
    // The engine treats anything but `enrolled` as not enrolled, and a leftover
    // timestamp would contradict the status the user just set.
    fakeRef.current = createSupabaseFake({ results: [{ data: null }], user: USER });

    await setRuleEnrollment({
      userCardId: 'card-1',
      rewardRuleId: 'rule-1',
      status: 'not_enrolled',
    });

    expect(fakeRef.current.writes[0]).toMatchObject({
      status: 'not_enrolled',
      enrolled_at: null,
    });
  });

  it('upserts on the card-and-rule constraint', async () => {
    fakeRef.current = createSupabaseFake({ results: [{ data: null }], user: USER });

    await setRuleEnrollment({
      userCardId: 'card-1',
      rewardRuleId: 'rule-1',
      status: 'enrolled',
    });

    expect(callArgs(fakeRef.current, 'upsert')?.[1]).toMatchObject({
      onConflict: 'user_card_id,reward_rule_id',
    });
  });

  it('refuses to write without a session', async () => {
    fakeRef.current = createSupabaseFake({ user: null });

    await expect(
      setRuleEnrollment({
        userCardId: 'card-1',
        rewardRuleId: 'rule-1',
        status: 'enrolled',
      }),
    ).rejects.toMatchObject({ kind: 'unauthenticated' });
  });

  it('surfaces a failure', async () => {
    fakeRef.current = createSupabaseFake({
      results: [{ error: postgrestError('42501') }],
      user: USER,
    });

    await expect(
      setRuleEnrollment({
        userCardId: 'card-1',
        rewardRuleId: 'rule-1',
        status: 'enrolled',
      }),
    ).rejects.toMatchObject({ kind: 'forbidden' });
  });
});
