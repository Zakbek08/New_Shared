/**
 * The wallet-snapshot loader.
 *
 * This is the LAST IMPURE STEP. It materialises everything the engine needs —
 * cards, products, rules, conditions, enrollments, offers, cap usage and the
 * user's valuations — and everything downstream of it is a pure function.
 *
 * One round trip for the wallet plus one for the preferences. The engine cannot
 * fetch, by design, so an N+1 here would be a real performance problem rather
 * than a style complaint.
 */
import type {
  EvaluableCard,
  EvaluableCondition,
  EvaluableOffer,
  EvaluableRule,
  RewardValuation,
} from '@/domain/rewards';
import { fromPostgrestError, toDataError } from '@/lib/errors';
import { parseInt4Ranges } from '@/lib/int4range';
import { formatCardName } from '@/lib/format';
import { getSupabaseClient } from '@/lib/supabase';
import type {
  CardProductRow,
  IssuerRow,
  RewardProgramRow,
  RewardRuleConditionRow,
  RewardRuleRow,
  RewardUnit,
  RewardUsageRow,
  UserCardRow,
  UserOfferRow,
  UserRewardPreferenceRow,
  UserRuleEnrollmentRow,
} from '@/types/database';

/**
 * Everything in one query.
 *
 * `reward_rules` is filtered to active rules server-side; the rest is filtered in
 * the mapper, because PostgREST cannot express a condition on a doubly-nested
 * resource without turning the join inner and dropping parent rows.
 */
const SNAPSHOT_SELECT = `
  *,
  card_products (
    *,
    issuers ( name ),
    reward_programs ( id, unit, default_cents_per_unit ),
    reward_rules (
      *,
      reward_rule_conditions ( * )
    )
  ),
  user_rule_enrollments ( * ),
  user_offers ( * ),
  reward_usage ( * )
`;

type SnapshotRow = UserCardRow & {
  card_products:
    | (CardProductRow & {
        issuers: Pick<IssuerRow, 'name'> | null;
        reward_programs: Pick<
          RewardProgramRow,
          'id' | 'unit' | 'default_cents_per_unit'
        > | null;
        reward_rules: (RewardRuleRow & {
          reward_rule_conditions: RewardRuleConditionRow[];
        })[];
      })
    | null;
  user_rule_enrollments: UserRuleEnrollmentRow[];
  user_offers: UserOfferRow[];
  reward_usage: RewardUsageRow[];
};

/** `null`-safe ISO string to Date. */
const toDate = (value: string | null): Date | null => (value === null ? null : new Date(value));

function toCondition(row: RewardRuleConditionRow): EvaluableCondition {
  // The scalar `merchant_category_id` and the `included_category_ids` array are
  // unioned: the schema offers both so a single-category rule stays readable in
  // the admin UI while a multi-category one is still expressible.
  const categoryIds = [
    ...(row.merchant_category_id === null ? [] : [row.merchant_category_id]),
    ...row.included_category_ids,
  ];

  return {
    id: row.id,
    categoryIds: [...new Set(categoryIds)],
    excludedCategoryIds: row.excluded_category_ids,
    includedMccs: row.included_mccs,
    includedMccRanges: parseInt4Ranges(row.included_mcc_ranges),
    excludedMccs: row.excluded_mccs,
    includedMerchantIds: row.included_merchant_ids,
    excludedMerchantIds: row.excluded_merchant_ids,
    includedCountryCodes: row.included_country_codes,
    excludedCountryCodes: row.excluded_country_codes,
    includedCurrencyCodes: row.included_currency_codes,
    channel: row.channel,
    includedPaymentMethods: row.included_payment_methods,
    startsAt: toDate(row.starts_at),
    endsAt: toDate(row.ends_at),
    minAmountUsd: row.min_amount_usd,
    maxAmountUsd: row.max_amount_usd,
  };
}

function toRule(
  row: RewardRuleRow & { reward_rule_conditions: RewardRuleConditionRow[] },
): EvaluableRule {
  return {
    id: row.id,
    cardProductId: row.card_product_id,
    rewardProgramId: row.reward_program_id,
    label: row.label,
    kind: row.kind,
    rewardType: row.reward_type,
    rewardUnit: row.reward_unit,
    baseRate: row.base_rate,
    bonusRate: row.bonus_rate,
    fixedAmountUsd: row.fixed_amount_usd,
    priority: row.priority,
    stackGroup: row.stack_group,
    isStackable: row.is_stackable,
    capAmount: row.cap_amount,
    capAppliesTo: row.cap_applies_to,
    capPeriod: row.cap_period,
    postCapRate: row.post_cap_rate,
    startsAt: toDate(row.starts_at),
    endsAt: toDate(row.ends_at),
    requiresEnrollment: row.requires_enrollment,
    spendThresholdUsd: row.spend_threshold_usd,
    lastVerifiedAt: toDate(row.last_verified_at),
    verificationStatus: row.verification_status,
    isActive: row.is_active,
    conditions: row.reward_rule_conditions.map(toCondition),
  };
}

function toOffer(row: UserOfferRow): EvaluableOffer {
  return {
    id: row.id,
    title: row.title,
    merchantId: row.merchant_id,
    merchantLabel: row.merchant_label,
    rewardType: row.reward_type,
    rewardUnit: row.reward_unit,
    rate: row.rate,
    fixedAmountUsd: row.fixed_amount_usd,
    minimumSpendUsd: row.minimum_spend_usd,
    maxBenefitUsd: row.max_benefit_usd,
    channel: row.channel,
    startsAt: toDate(row.starts_at),
    endsAt: toDate(row.ends_at),
    isEnrolled: row.enrolled_at !== null,
  };
}

function toCard(row: SnapshotRow): EvaluableCard {
  const product = row.card_products;

  const rules = (product?.reward_rules ?? []).filter((rule) => rule.is_active).map(toRule);

  // Enrollment is self-reported. Anything other than an explicit `enrolled` is
  // treated as not enrolled, which is the conservative reading.
  const enrollments: Record<string, boolean> = {};
  for (const enrollment of row.user_rule_enrollments) {
    enrollments[enrollment.reward_rule_id] = enrollment.status === 'enrolled';
  }

  // Keep only the most recent usage row per rule. The engine checks the window
  // itself, so an older row would simply be ignored — but sending one row per
  // rule keeps the snapshot small.
  const capUsage: Record<string, EvaluableCard['capUsage'][string]> = {};
  for (const usage of row.reward_usage) {
    const existing = capUsage[usage.reward_rule_id];
    const periodStart = new Date(usage.period_start);
    if (existing === undefined || periodStart.getTime() > existing.periodStart.getTime()) {
      capUsage[usage.reward_rule_id] = {
        periodStart,
        periodEnd: new Date(usage.period_end),
        qualifyingSpendUsd: usage.qualifying_spend_usd,
        accruedRewardUsd: usage.accrued_reward_usd,
      };
    }
  }

  const offers = row.user_offers
    .filter((offer) => offer.status === 'available' || offer.status === 'enrolled')
    .map(toOffer);

  return {
    userCardId: row.id,
    cardProductId: row.card_product_id,
    displayName: formatCardName(product?.name ?? 'Unknown card', row.nickname),
    issuerName: product?.issuers?.name ?? product?.custom_issuer_name ?? 'Unknown issuer',
    nickname: row.nickname,
    annualFeeUsd: product?.annual_fee_usd ?? 0,
    foreignTransactionFeePercent: product?.foreign_transaction_fee_percent ?? 0,
    supportedCountryCodes: product?.supported_country_codes ?? [],
    isPreferred: row.is_preferred,
    isExcludedFromRecommendations: row.is_excluded_from_recommendations,
    accountOpenedOn: row.account_opened_on === null ? null : new Date(row.account_opened_on),
    rules,
    enrollments,
    capUsage,
    offers,
  };
}

/**
 * Builds the user's reward valuation.
 *
 * `RewardValuation` has two slots and `resolveCentsPerUnit` reads them in a fixed
 * order — `byProgramId`, then `byUnit` — so the four-level precedence the product
 * needs has to be flattened into them here:
 *
 *   1. the user's figure for this specific program   → `byProgramId`
 *   2. the user's default for this unit type         → `byUnit`
 *   3. the catalog's figure for this program         → `byProgramId`, only when
 *                                                      neither 1 nor 2 was given
 *   4. `1` per unit as a last resort                → `byUnit`
 *
 * The user's rows are therefore read **first**, and a catalog default is folded in
 * only where the user has said nothing that covers it. Doing it the other way round
 * — catalog first, user second — looks equivalent but is not: the catalog's
 * program-level figure would sit in `byProgramId` and silently outrank the user's own
 * per-unit default, overruling them on the figure that decides which card wins.
 *
 * A user figure of `0` is kept as `0` throughout: it means "worthless to me", not
 * "unset".
 */
export function buildValuation(
  preferences: readonly UserRewardPreferenceRow[],
  programDefaults: ReadonlyMap<string, { unit: RewardUnit; centsPerUnit: number }>,
): RewardValuation {
  const byProgramId: Record<string, number> = {};
  const byUnit: Record<RewardUnit, number> = { usd: 1, points: 1, miles: 1 };

  /** Units the user gave an explicit default for, which outranks a catalog figure. */
  const unitsSetByUser = new Set<RewardUnit>();

  let prefersCashBackOnly = false;
  let minimumSwitchBenefitUsd = 0;

  for (const preference of preferences) {
    if (preference.reward_program_id === null) {
      // A null program means "my default for this unit type".
      byUnit[preference.unit] = preference.cents_per_unit;
      unitsSetByUser.add(preference.unit);
    } else {
      byProgramId[preference.reward_program_id] = preference.cents_per_unit;
    }

    // Either of these set on any row applies to the whole wallet.
    if (preference.prefers_cash_back_only) prefersCashBackOnly = true;
    minimumSwitchBenefitUsd = Math.max(
      minimumSwitchBenefitUsd,
      preference.minimum_switch_benefit_usd,
    );
  }

  for (const [programId, program] of programDefaults) {
    if (byProgramId[programId] !== undefined) continue;
    if (unitsSetByUser.has(program.unit)) continue;
    byProgramId[programId] = program.centsPerUnit;
  }

  return { byProgramId, byUnit, prefersCashBackOnly, minimumSwitchBenefitUsd };
}

export interface WalletSnapshot {
  readonly cards: readonly EvaluableCard[];
  readonly valuation: RewardValuation;
}

/**
 * Loads everything the engine needs.
 *
 * Archived cards are excluded. Cards the user has switched off are *included*, so
 * the engine can report them as `card_excluded_by_user` rather than leaving the
 * user wondering where a card went.
 */
export async function loadWalletSnapshot(): Promise<WalletSnapshot> {
  const supabase = getSupabaseClient();

  try {
    const [walletResult, preferenceResult] = await Promise.all([
      supabase.from('user_cards').select(SNAPSHOT_SELECT).eq('is_archived', false),
      supabase.from('user_reward_preferences').select('*'),
    ]);

    if (walletResult.error !== null) throw fromPostgrestError(walletResult.error);
    if (preferenceResult.error !== null) throw fromPostgrestError(preferenceResult.error);

    const rows = (walletResult.data ?? []) as unknown as SnapshotRow[];

    const programDefaults = new Map<string, { unit: RewardUnit; centsPerUnit: number }>();
    for (const row of rows) {
      const program = row.card_products?.reward_programs;
      if (program != null) {
        programDefaults.set(program.id, {
          unit: program.unit,
          centsPerUnit: program.default_cents_per_unit,
        });
      }
    }

    return {
      cards: rows.map(toCard),
      valuation: buildValuation(preferenceResult.data ?? [], programDefaults),
    };
  } catch (cause) {
    throw toDataError(cause);
  }
}

export { toCard as __toCardForTests, toCondition as __toConditionForTests };
