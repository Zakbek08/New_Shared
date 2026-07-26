/**
 * What a point is worth to this user.
 *
 * The single biggest lever on the recommendation, and the reason two people with
 * identical wallets can correctly get different answers. WalletWise stores the
 * user's own figure and never substitutes an industry average — an average would be
 * a number nobody agreed to.
 *
 * A valuation of **zero is meaningful** and must survive the whole round trip: it
 * says "these points are worthless to me", which is a legitimate position and one
 * the engine honours (see `resolveCentsPerUnit`).
 */
import type { RewardPreferenceInput } from '@/domain/schemas';
import { DataError, fromPostgrestError, toDataError } from '@/lib/errors';
import { getSupabaseClient } from '@/lib/supabase';
import { track } from '@/services/analytics';
import type { RewardUnit, UserRewardPreferenceRow } from '@/types/database';

/** A reward program the user actually holds, with their valuation of it. */
export interface ProgramValuation {
  readonly rewardProgramId: string;
  readonly programName: string;
  readonly unit: RewardUnit;
  /** The catalog's figure, for reference. */
  readonly defaultCentsPerUnit: number;
  /** The user's figure, or `null` when they have not set one. */
  readonly userCentsPerUnit: number | null;
  /** Which figure the engine will actually use. */
  readonly effectiveCentsPerUnit: number;
  /** Card names in the wallet that earn this currency. */
  readonly cardNames: readonly string[];
}

export interface WalletValuations {
  readonly programs: readonly ProgramValuation[];
  /** Per-unit fallbacks, for a program the catalog does not know. */
  readonly byUnit: Readonly<Record<RewardUnit, number | null>>;
  readonly prefersCashBackOnly: boolean;
  readonly minimumSwitchBenefitUsd: number;
  /** True when the user has never saved a preference. */
  readonly isDefault: boolean;
}

const WALLET_PROGRAM_SELECT = `
  nickname,
  card_products (
    name,
    reward_programs ( id, name, unit, default_cents_per_unit )
  )
`;

type WalletProgramRow = {
  nickname: string | null;
  card_products: {
    name: string;
    reward_programs: {
      id: string;
      name: string;
      unit: RewardUnit;
      default_cents_per_unit: number;
    } | null;
  } | null;
};

export async function listRewardPreferences(): Promise<UserRewardPreferenceRow[]> {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase.from('user_reward_preferences').select('*');
    if (error !== null) throw fromPostgrestError(error);
    return data ?? [];
  } catch (cause) {
    throw toDataError(cause);
  }
}

/**
 * The valuation screen's data: every program in the wallet, joined to the user's
 * figure for it.
 *
 * Only programs the user's own cards earn are listed. Asking someone to value a
 * currency they do not hold is busy-work, and a long list of irrelevant programs
 * makes the two that matter harder to find.
 */
export async function loadWalletValuations(): Promise<WalletValuations> {
  const supabase = getSupabaseClient();

  try {
    const [walletResult, preferenceResult] = await Promise.all([
      supabase.from('user_cards').select(WALLET_PROGRAM_SELECT).eq('is_archived', false),
      supabase.from('user_reward_preferences').select('*'),
    ]);

    if (walletResult.error !== null) throw fromPostgrestError(walletResult.error);
    if (preferenceResult.error !== null) throw fromPostgrestError(preferenceResult.error);

    const preferences = preferenceResult.data ?? [];
    const rows = (walletResult.data ?? []) as unknown as WalletProgramRow[];

    const byProgramId = new Map<string, number>();
    const byUnit: Record<RewardUnit, number | null> = { usd: null, points: null, miles: null };
    let prefersCashBackOnly = false;
    let minimumSwitchBenefitUsd = 0;

    for (const preference of preferences) {
      if (preference.reward_program_id === null) {
        byUnit[preference.unit] = preference.cents_per_unit;
      } else {
        byProgramId.set(preference.reward_program_id, preference.cents_per_unit);
      }
      if (preference.prefers_cash_back_only) prefersCashBackOnly = true;
      minimumSwitchBenefitUsd = Math.max(
        minimumSwitchBenefitUsd,
        preference.minimum_switch_benefit_usd,
      );
    }

    // Collapse the wallet to distinct programs, collecting the cards that earn each.
    const programs = new Map<string, ProgramValuation>();
    for (const row of rows) {
      const program = row.card_products?.reward_programs;
      if (program == null) continue;
      // Cash back needs no valuation: a dollar is a dollar.
      if (program.unit === 'usd') continue;

      const cardName = row.nickname ?? row.card_products?.name ?? 'Unknown card';
      const existing = programs.get(program.id);

      if (existing !== undefined) {
        programs.set(program.id, {
          ...existing,
          cardNames: [...existing.cardNames, cardName],
        });
        continue;
      }

      const userValue = byProgramId.get(program.id) ?? null;
      programs.set(program.id, {
        rewardProgramId: program.id,
        programName: program.name,
        unit: program.unit,
        defaultCentsPerUnit: program.default_cents_per_unit,
        userCentsPerUnit: userValue,
        // Mirrors `resolveCentsPerUnit`: the user's program figure wins, then their
        // per-unit default, then the catalog's. A user's explicit 0 wins over both.
        effectiveCentsPerUnit:
          userValue ?? byUnit[program.unit] ?? program.default_cents_per_unit,
        cardNames: [cardName],
      });
    }

    return {
      programs: [...programs.values()].sort((left, right) =>
        left.programName.localeCompare(right.programName, 'en'),
      ),
      byUnit,
      prefersCashBackOnly,
      minimumSwitchBenefitUsd,
      isDefault: preferences.length === 0,
    };
  } catch (cause) {
    throw toDataError(cause);
  }
}

/**
 * Saves one valuation.
 *
 * Upserted on `(user_id, reward_program_id)` — declared `unique nulls not distinct`,
 * so the null-program row that carries a per-unit default is a single row rather
 * than one per save.
 */
export async function upsertRewardPreference(
  input: RewardPreferenceInput,
): Promise<UserRewardPreferenceRow> {
  const supabase = getSupabaseClient();

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError !== null || userData.user === null) {
      throw new DataError('unauthenticated', 'Please sign in again.');
    }

    const { data, error } = await supabase
      .from('user_reward_preferences')
      .upsert(
        {
          user_id: userData.user.id,
          reward_program_id: input.rewardProgramId,
          unit: input.unit,
          cents_per_unit: input.centsPerUnit,
          prefers_cash_back_only: input.prefersCashBackOnly,
          minimum_switch_benefit_usd: input.minimumSwitchBenefitUsd,
        },
        { onConflict: 'user_id,reward_program_id' },
      )
      .select('*')
      .single();

    if (error !== null) throw fromPostgrestError(error);

    // The valuation itself is not logged: it is a statement about how this person
    // redeems, which is closer to personal preference than to telemetry.
    track('preferences_updated', {
      unit: input.unit,
      hasProgram: input.rewardProgramId !== null,
      prefersCashBackOnly: input.prefersCashBackOnly,
    });

    return data;
  } catch (cause) {
    throw toDataError(cause);
  }
}

/**
 * Applies the two wallet-wide switches to every preference row.
 *
 * They are stored per row but read as wallet-wide (`buildValuation` takes the
 * strictest value across rows), so a partial write would leave the engine honouring
 * a setting the screen shows as off. Writing them everywhere keeps the two in step.
 *
 * When no preference row exists yet, one is created against the null program — the
 * per-unit default row — so the switch has somewhere to live.
 */
export async function updateGlobalPreferences(patch: {
  readonly prefersCashBackOnly?: boolean;
  readonly minimumSwitchBenefitUsd?: number;
}): Promise<void> {
  const supabase = getSupabaseClient();

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError !== null || userData.user === null) {
      throw new DataError('unauthenticated', 'Please sign in again.');
    }

    const { data: existing, error: readError } = await supabase
      .from('user_reward_preferences')
      .select('id');

    if (readError !== null) throw fromPostgrestError(readError);

    const update = {
      ...(patch.prefersCashBackOnly === undefined
        ? {}
        : { prefers_cash_back_only: patch.prefersCashBackOnly }),
      ...(patch.minimumSwitchBenefitUsd === undefined
        ? {}
        : { minimum_switch_benefit_usd: patch.minimumSwitchBenefitUsd }),
    };

    if ((existing ?? []).length === 0) {
      const { error: insertError } = await supabase.from('user_reward_preferences').insert({
        user_id: userData.user.id,
        reward_program_id: null,
        unit: 'points',
        cents_per_unit: 1,
        prefers_cash_back_only: patch.prefersCashBackOnly ?? false,
        minimum_switch_benefit_usd: patch.minimumSwitchBenefitUsd ?? 0,
      });
      if (insertError !== null) throw fromPostgrestError(insertError);
    } else {
      const { error: updateError } = await supabase
        .from('user_reward_preferences')
        .update(update)
        .eq('user_id', userData.user.id);
      if (updateError !== null) throw fromPostgrestError(updateError);
    }

    track('preferences_updated', {
      prefersCashBackOnly: patch.prefersCashBackOnly,
      hasSwitchThreshold: patch.minimumSwitchBenefitUsd !== undefined,
    });
  } catch (cause) {
    throw toDataError(cause);
  }
}
