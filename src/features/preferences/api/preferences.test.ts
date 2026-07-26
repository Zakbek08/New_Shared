/**
 * Reward-preference data access.
 *
 * One behaviour dominates this file: **a valuation of zero must survive the round
 * trip**. It means "these points are worthless to me", and any code path that reads
 * it as "unset" and substitutes a default overrules the user on a figure that
 * changes which card they are told to use.
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

import {
  listRewardPreferences,
  loadWalletValuations,
  updateGlobalPreferences,
  upsertRewardPreference,
} from './preferences';

const USER = { id: 'user-1', email: 'person@example.com' };

const preferenceRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'pref-1',
  user_id: USER.id,
  reward_program_id: 'program-points',
  unit: 'points',
  cents_per_unit: 1.25,
  prefers_cash_back_only: false,
  minimum_switch_benefit_usd: 0,
  notes: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  ...overrides,
});

/** A wallet row in the nested shape the program query returns. */
const walletRow = (
  overrides: {
    readonly nickname?: string | null;
    readonly productName?: string;
    readonly programId?: string;
    readonly programName?: string;
    readonly unit?: 'usd' | 'points' | 'miles';
    readonly defaultCents?: number;
    readonly noProgram?: boolean;
  } = {},
) => ({
  nickname: overrides.nickname ?? null,
  card_products: {
    name: overrides.productName ?? 'DEMO — Points Card',
    reward_programs:
      overrides.noProgram === true
        ? null
        : {
            id: overrides.programId ?? 'program-points',
            name: overrides.programName ?? 'DEMO — Cobalt Points',
            unit: overrides.unit ?? 'points',
            default_cents_per_unit: overrides.defaultCents ?? 1,
          },
  },
});

describe('listRewardPreferences', () => {
  it('returns the stored rows', async () => {
    fakeRef.current = createSupabaseFake({
      results: [{ data: [preferenceRow()] }],
      user: USER,
    });

    await expect(listRewardPreferences()).resolves.toHaveLength(1);
  });

  it('surfaces a failure as a DataError', async () => {
    fakeRef.current = createSupabaseFake({
      results: [{ error: postgrestError('42501') }],
      user: USER,
    });

    await expect(listRewardPreferences()).rejects.toMatchObject({ kind: 'forbidden' });
  });
});

describe('loadWalletValuations', () => {
  it('lists a program the wallet earns, with the catalog figure in force', async () => {
    fakeRef.current = createSupabaseFake({
      results: [{ data: [walletRow({ defaultCents: 1.1 })] }, { data: [] }],
      user: USER,
    });

    const valuations = await loadWalletValuations();

    expect(valuations.programs).toHaveLength(1);
    expect(valuations.programs[0]).toMatchObject({
      rewardProgramId: 'program-points',
      programName: 'DEMO — Cobalt Points',
      unit: 'points',
      defaultCentsPerUnit: 1.1,
      userCentsPerUnit: null,
      effectiveCentsPerUnit: 1.1,
    });
    expect(valuations.isDefault).toBe(true);
  });

  it('prefers the user’s figure over the catalog default', async () => {
    fakeRef.current = createSupabaseFake({
      results: [
        { data: [walletRow({ defaultCents: 1 })] },
        { data: [preferenceRow({ cents_per_unit: 1.8 })] },
      ],
      user: USER,
    });

    const [program] = (await loadWalletValuations()).programs;

    expect(program?.userCentsPerUnit).toBe(1.8);
    expect(program?.effectiveCentsPerUnit).toBe(1.8);
  });

  it('honours a user valuation of zero rather than falling back', async () => {
    // The whole point. `userValue ?? default` gets this right where a truthiness test
    // would silently restore the catalog's 1¢.
    fakeRef.current = createSupabaseFake({
      results: [
        { data: [walletRow({ defaultCents: 1 })] },
        { data: [preferenceRow({ cents_per_unit: 0 })] },
      ],
      user: USER,
    });

    const [program] = (await loadWalletValuations()).programs;

    expect(program?.userCentsPerUnit).toBe(0);
    expect(program?.effectiveCentsPerUnit).toBe(0);
  });

  it('falls back to the user’s per-unit default before the catalog’s', async () => {
    // A null-program row is the user's "all points are worth this" figure, which
    // outranks the catalog but not a program-specific figure.
    fakeRef.current = createSupabaseFake({
      results: [
        { data: [walletRow({ defaultCents: 1 })] },
        { data: [preferenceRow({ reward_program_id: null, cents_per_unit: 0.7 })] },
      ],
      user: USER,
    });

    const [program] = (await loadWalletValuations()).programs;

    expect(program?.userCentsPerUnit).toBeNull();
    expect(program?.effectiveCentsPerUnit).toBe(0.7);
  });

  it('collapses two cards on the same program into one row, listing both cards', async () => {
    // Asking someone to value the same currency twice is busy-work and invites two
    // contradictory answers.
    fakeRef.current = createSupabaseFake({
      results: [
        {
          data: [
            walletRow({ nickname: 'Everyday' }),
            walletRow({ nickname: 'Travel', productName: 'DEMO — Travel Card' }),
          ],
        },
        { data: [] },
      ],
      user: USER,
    });

    const { programs } = await loadWalletValuations();

    expect(programs).toHaveLength(1);
    expect(programs[0]?.cardNames).toEqual(['Everyday', 'Travel']);
  });

  it('omits cash-back cards, which need no valuation', async () => {
    // A dollar is a dollar. Asking for a valuation would imply otherwise.
    fakeRef.current = createSupabaseFake({
      results: [
        { data: [walletRow({ unit: 'usd', programName: 'DEMO — Cash Back' })] },
        { data: [] },
      ],
      user: USER,
    });

    expect((await loadWalletValuations()).programs).toEqual([]);
  });

  it('omits a card whose product has no program', async () => {
    fakeRef.current = createSupabaseFake({
      results: [{ data: [walletRow({ noProgram: true })] }, { data: [] }],
      user: USER,
    });

    expect((await loadWalletValuations()).programs).toEqual([]);
  });

  it('reads the wallet-wide switches, taking the strictest value across rows', async () => {
    fakeRef.current = createSupabaseFake({
      results: [
        { data: [walletRow()] },
        {
          data: [
            preferenceRow({ id: 'a', minimum_switch_benefit_usd: 0.25 }),
            preferenceRow({
              id: 'b',
              reward_program_id: 'program-miles',
              prefers_cash_back_only: true,
              minimum_switch_benefit_usd: 1,
            }),
          ],
        },
      ],
      user: USER,
    });

    const valuations = await loadWalletValuations();

    expect(valuations.prefersCashBackOnly).toBe(true);
    expect(valuations.minimumSwitchBenefitUsd).toBe(1);
    expect(valuations.isDefault).toBe(false);
  });

  it('sorts programs by name, so the list does not reshuffle', async () => {
    fakeRef.current = createSupabaseFake({
      results: [
        {
          data: [
            walletRow({ programId: 'z', programName: 'Zephyr Points' }),
            walletRow({ programId: 'a', programName: 'Alpine Miles', unit: 'miles' }),
          ],
        },
        { data: [] },
      ],
      user: USER,
    });

    expect((await loadWalletValuations()).programs.map((p) => p.programName)).toEqual([
      'Alpine Miles',
      'Zephyr Points',
    ]);
  });

  it('surfaces a wallet-query failure', async () => {
    fakeRef.current = createSupabaseFake({
      results: [{ error: postgrestError('42501') }, { data: [] }],
      user: USER,
    });

    await expect(loadWalletValuations()).rejects.toMatchObject({ kind: 'forbidden' });
  });
});

describe('upsertRewardPreference', () => {
  const input = {
    rewardProgramId: 'program-points',
    unit: 'points' as const,
    centsPerUnit: 1.4,
    prefersCashBackOnly: false,
    minimumSwitchBenefitUsd: 0.5,
  };

  it('upserts on the program key, so a second save updates rather than duplicates', async () => {
    fakeRef.current = createSupabaseFake({ results: [{ data: preferenceRow() }], user: USER });

    await upsertRewardPreference(input);

    expect(fakeRef.current.writes[0]).toMatchObject({
      user_id: USER.id,
      reward_program_id: 'program-points',
      unit: 'points',
      cents_per_unit: 1.4,
      minimum_switch_benefit_usd: 0.5,
    });
    expect(callArgs(fakeRef.current, 'upsert')?.[1]).toMatchObject({
      onConflict: 'user_id,reward_program_id',
    });
  });

  it('writes a zero exactly as entered', async () => {
    fakeRef.current = createSupabaseFake({ results: [{ data: preferenceRow() }], user: USER });

    await upsertRewardPreference({ ...input, centsPerUnit: 0 });

    expect(fakeRef.current.writes[0]).toMatchObject({ cents_per_unit: 0 });
  });

  it('refuses to write without a session', async () => {
    fakeRef.current = createSupabaseFake({ user: null });

    await expect(upsertRewardPreference(input)).rejects.toMatchObject({
      kind: 'unauthenticated',
    });
    expect(fakeRef.current.writes).toHaveLength(0);
  });
});

describe('updateGlobalPreferences', () => {
  it('updates every existing row, because the switch is read wallet-wide', async () => {
    // `buildValuation` takes the strictest value across rows, so a partial write would
    // leave the engine honouring a setting the screen shows as off.
    fakeRef.current = createSupabaseFake({
      results: [{ data: [{ id: 'pref-1' }, { id: 'pref-2' }] }, { data: null }],
      user: USER,
    });

    await updateGlobalPreferences({ prefersCashBackOnly: true });

    expect(fakeRef.current.writes[0]).toEqual({ prefers_cash_back_only: true });
    expect(fakeRef.current.calls.some((call) => call.method === 'update')).toBe(true);
  });

  it('scopes the update to the signed-in user', async () => {
    fakeRef.current = createSupabaseFake({
      results: [{ data: [{ id: 'pref-1' }] }, { data: null }],
      user: USER,
    });

    await updateGlobalPreferences({ minimumSwitchBenefitUsd: 1 });

    const eqCalls = fakeRef.current.calls.filter((call) => call.method === 'eq');
    expect(eqCalls.some((call) => call.args[0] === 'user_id' && call.args[1] === USER.id)).toBe(
      true,
    );
  });

  it('creates a row when the user has never saved a preference', async () => {
    // The switch needs somewhere to live, so a per-unit default row is created.
    fakeRef.current = createSupabaseFake({
      results: [{ data: [] }, { data: null }],
      user: USER,
    });

    await updateGlobalPreferences({ minimumSwitchBenefitUsd: 2 });

    expect(fakeRef.current.writes[0]).toMatchObject({
      user_id: USER.id,
      reward_program_id: null,
      minimum_switch_benefit_usd: 2,
      prefers_cash_back_only: false,
    });
  });

  it('writes only the switch that changed', async () => {
    fakeRef.current = createSupabaseFake({
      results: [{ data: [{ id: 'pref-1' }] }, { data: null }],
      user: USER,
    });

    await updateGlobalPreferences({ minimumSwitchBenefitUsd: 3 });

    expect(fakeRef.current.writes[0]).toEqual({ minimum_switch_benefit_usd: 3 });
  });

  it('surfaces a failure rather than reporting success', async () => {
    fakeRef.current = createSupabaseFake({
      results: [{ data: [{ id: 'pref-1' }] }, { error: postgrestError('42501') }],
      user: USER,
    });

    await expect(updateGlobalPreferences({ prefersCashBackOnly: true })).rejects.toMatchObject({
      kind: 'forbidden',
    });
  });
});
