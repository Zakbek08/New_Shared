/**
 * Writing cap progress, and activating a rotating bonus.
 *
 * `reward_usage` is the only reason the engine knows a cap is partly used, and this
 * module is its only writer. The arithmetic is not here — it is in
 * `src/domain/rewards/usage.ts`, tested against hand-checked figures. This file
 * reads the current row, asks the domain what the new total is, and writes it.
 *
 * WHY READ-THEN-WRITE RATHER THAN AN INCREMENT
 * PostgREST cannot express `set qualifying_spend_usd = qualifying_spend_usd + $1`.
 * Two confirmations racing could therefore lose one increment. That is an acceptable
 * trade for a self-reported estimate that the UI already labels as one — and the
 * failure direction is safe: a lost increment makes the cap look emptier, so
 * WalletWise under-claims rather than over-claims a bonus.
 */
import { mergeUsage, adjustedUsage, type UsageDelta } from '@/domain/rewards';
import type { CapUsageSnapshot } from '@/domain/rewards';
import { DataError, fromPostgrestError, toDataError } from '@/lib/errors';
import { getSupabaseClient } from '@/lib/supabase';
import { track } from '@/services/analytics';
import type { EnrollmentStatus, RewardUsageRow } from '@/types/database';

/** The usage row covering `delta`'s window, or `null` when there is none. */
async function findUsageRow(delta: UsageDelta): Promise<RewardUsageRow | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('reward_usage')
    .select('*')
    .eq('user_card_id', delta.userCardId)
    .eq('reward_rule_id', delta.rewardRuleId)
    .eq('period_start', delta.periodStart.toISOString())
    .eq('period_end', delta.periodEnd.toISOString())
    .maybeSingle();

  if (error !== null) throw fromPostgrestError(error);
  return data ?? null;
}

function toSnapshot(row: RewardUsageRow): CapUsageSnapshot {
  return {
    periodStart: new Date(row.period_start),
    periodEnd: new Date(row.period_end),
    qualifyingSpendUsd: row.qualifying_spend_usd,
    accruedRewardUsd: row.accrued_reward_usd,
  };
}

/**
 * Adds an accepted recommendation's consumption to the cap.
 *
 * Upserted on `reward_usage_unique_window`, so a second confirmation in the same
 * window updates the row rather than colliding with the unique constraint.
 */
export async function recordRewardUsage(delta: UsageDelta): Promise<void> {
  const supabase = getSupabaseClient();

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError !== null || userData.user === null) {
      throw new DataError('unauthenticated', 'Please sign in again.');
    }

    const existing = await findUsageRow(delta);
    const merged = mergeUsage(existing === null ? null : toSnapshot(existing), delta);

    // Units are tracked separately from dollars: the dollar figure depends on the
    // user's valuation, which they can change, while the units earned cannot.
    const accruedUnits = (existing?.accrued_reward_units ?? 0) + delta.accruedRewardUnits;

    const { error } = await supabase.from('reward_usage').upsert(
      {
        user_id: userData.user.id,
        user_card_id: delta.userCardId,
        reward_rule_id: delta.rewardRuleId,
        cap_period: delta.capPeriod,
        period_start: delta.periodStart.toISOString(),
        period_end: delta.periodEnd.toISOString(),
        qualifying_spend_usd: merged.qualifyingSpendUsd,
        accrued_reward_units: Math.round(accruedUnits * 1e6) / 1e6,
        accrued_reward_usd: merged.accruedRewardUsd,
        is_user_adjusted: false,
        last_recorded_at: new Date().toISOString(),
      },
      { onConflict: 'user_card_id,reward_rule_id,period_start,period_end' },
    );

    if (error !== null) throw fromPostgrestError(error);

    // Redaction bands the amount, so this records that a cap moved without
    // recording how much the user spent.
    track('reward_usage_recorded', {
      capPeriod: delta.capPeriod,
      qualifyingSpendUsd: delta.qualifyingSpendUsd,
      isUserAdjusted: false,
    });
  } catch (cause) {
    throw toDataError(cause);
  }
}

/**
 * A user-typed correction: "I have already spent $2,000 of this bonus."
 *
 * Replaces the total rather than adding to it, and marks the row `is_user_adjusted`
 * so the cap tracker can say the figure came from the user rather than from
 * confirmed recommendations.
 */
export async function adjustCapUsage(options: {
  readonly window: Pick<
    UsageDelta,
    'userCardId' | 'rewardRuleId' | 'capPeriod' | 'periodStart' | 'periodEnd'
  >;
  readonly qualifyingSpendUsd: number;
  readonly accruedRewardUsd: number;
  readonly capAmountUsd: number | null;
  readonly appliesTo: 'spend' | 'reward';
}): Promise<void> {
  const supabase = getSupabaseClient();

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError !== null || userData.user === null) {
      throw new DataError('unauthenticated', 'Please sign in again.');
    }

    const snapshot = adjustedUsage({
      delta: options.window,
      qualifyingSpendUsd: options.qualifyingSpendUsd,
      accruedRewardUsd: options.accruedRewardUsd,
      capAmountUsd: options.capAmountUsd,
      appliesTo: options.appliesTo,
    });

    const { error } = await supabase.from('reward_usage').upsert(
      {
        user_id: userData.user.id,
        user_card_id: options.window.userCardId,
        reward_rule_id: options.window.rewardRuleId,
        cap_period: options.window.capPeriod,
        period_start: snapshot.periodStart.toISOString(),
        period_end: snapshot.periodEnd.toISOString(),
        qualifying_spend_usd: snapshot.qualifyingSpendUsd,
        accrued_reward_usd: snapshot.accruedRewardUsd,
        is_user_adjusted: true,
        last_recorded_at: new Date().toISOString(),
      },
      { onConflict: 'user_card_id,reward_rule_id,period_start,period_end' },
    );

    if (error !== null) throw fromPostgrestError(error);

    track('reward_usage_recorded', {
      capPeriod: options.window.capPeriod,
      qualifyingSpendUsd: options.qualifyingSpendUsd,
      isUserAdjusted: true,
    });
  } catch (cause) {
    throw toDataError(cause);
  }
}

/**
 * Records whether the user has activated a bonus that requires it.
 *
 * Self-reported, and treated conservatively by the engine: anything other than
 * `enrolled` counts as not enrolled, because claiming a bonus the user never
 * activated costs them real money at the till.
 */
export async function setRuleEnrollment(options: {
  readonly userCardId: string;
  readonly rewardRuleId: string;
  readonly status: EnrollmentStatus;
  readonly expiresAt?: Date | null;
}): Promise<void> {
  const supabase = getSupabaseClient();

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError !== null || userData.user === null) {
      throw new DataError('unauthenticated', 'Please sign in again.');
    }

    const { error } = await supabase.from('user_rule_enrollments').upsert(
      {
        user_id: userData.user.id,
        user_card_id: options.userCardId,
        reward_rule_id: options.rewardRuleId,
        status: options.status,
        enrolled_at: options.status === 'enrolled' ? new Date().toISOString() : null,
        expires_at: options.expiresAt?.toISOString() ?? null,
      },
      { onConflict: 'user_card_id,reward_rule_id' },
    );

    if (error !== null) throw fromPostgrestError(error);

    track('rotating_category_activated', { status: options.status });
  } catch (cause) {
    throw toDataError(cause);
  }
}
