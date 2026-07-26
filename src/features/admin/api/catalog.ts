/**
 * The administrative catalog: reading, editing and verifying reward rules.
 *
 * ACCESS IS ENFORCED BY THE DATABASE, NOT BY THIS FILE.
 * Every write below is subject to `can_edit_catalog()` in the RLS policies on
 * `reward_rules`, `reward_rule_conditions` and `sources`. A member who reaches these
 * functions — by any route, including a rebuilt client — gets SQLSTATE 42501, which
 * `fromPostgrestError` surfaces as a `forbidden` DataError. Hiding the admin screen
 * is a convenience for editors, never the control.
 *
 * Every write is also audited: `walletwise_private.audit_catalog_change()` fires on
 * insert, update and delete of these tables and records the actor, the action and the
 * **column names** that changed — never the values. See
 * `supabase/migrations/20260701000700_audit_logs.sql`.
 */
import { ruleFreshness, type RuleFreshness } from '@/domain/catalog/staleness';
import type {
  RewardRuleConditionInput,
  RewardRuleInput,
  SourceInput,
  VerificationInput,
} from '@/domain/schemas';
import { DataError, fromPostgrestError, toDataError } from '@/lib/errors';
import { formatInt4Ranges, parseInt4Ranges, type InclusiveRange } from '@/lib/int4range';
import { getSupabaseClient } from '@/lib/supabase';
import { track } from '@/services/analytics';
import type {
  AuditLogRow,
  RewardRuleConditionRow,
  RewardRuleRow,
  SourceRow,
  VerificationHistoryRow,
} from '@/types/database';

// ---------------------------------------------------------------------------
// Reading the catalog
// ---------------------------------------------------------------------------

/** A condition row in the shape the editor works in: inclusive MCC ranges. */
export interface EditableCondition {
  readonly id: string;
  readonly rewardRuleId: string;
  readonly merchantCategoryId: string | null;
  readonly includedCategoryIds: readonly string[];
  readonly excludedCategoryIds: readonly string[];
  readonly includedMccs: readonly number[];
  readonly includedMccRanges: readonly InclusiveRange[];
  readonly excludedMccs: readonly number[];
  readonly includedMerchantIds: readonly string[];
  readonly excludedMerchantIds: readonly string[];
  readonly includedCountryCodes: readonly string[];
  readonly excludedCountryCodes: readonly string[];
  readonly includedCurrencyCodes: readonly string[];
  readonly channel: RewardRuleConditionRow['channel'];
  readonly includedPaymentMethods: readonly RewardRuleConditionRow['included_payment_methods'][number][];
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly minAmountUsd: number | null;
  readonly maxAmountUsd: number | null;
  readonly notes: string | null;
}

/** A rule with its conditions, its product, its source and its derived freshness. */
export interface CatalogRule {
  readonly id: string;
  readonly cardProductId: string;
  readonly productName: string;
  readonly issuerName: string | null;
  readonly label: string;
  readonly kind: RewardRuleRow['kind'];
  readonly rewardType: RewardRuleRow['reward_type'];
  readonly rewardUnit: RewardRuleRow['reward_unit'];
  readonly baseRate: number;
  readonly bonusRate: number;
  readonly fixedAmountUsd: number | null;
  readonly priority: number;
  readonly stackGroup: string;
  readonly isStackable: boolean;
  readonly capAmount: number | null;
  readonly capAppliesTo: RewardRuleRow['cap_applies_to'];
  readonly capPeriod: RewardRuleRow['cap_period'];
  readonly postCapRate: number | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly requiresEnrollment: boolean;
  readonly enrollmentUrl: string | null;
  readonly spendThresholdUsd: number | null;
  readonly sourceId: string | null;
  readonly sourceLabel: string | null;
  readonly sourceUrl: string | null;
  readonly isFictionalSource: boolean;
  readonly lastVerifiedAt: string | null;
  readonly verificationStatus: RewardRuleRow['verification_status'];
  readonly isActive: boolean;
  readonly notes: string | null;
  readonly conditions: readonly EditableCondition[];
  /** Derived, not stored. See `src/domain/catalog/staleness.ts`. */
  readonly freshness: RuleFreshness;
}

const CATALOG_SELECT = `
  *,
  card_products ( name, issuers ( name ) ),
  sources ( label, url, is_fictional ),
  reward_rule_conditions ( * )
`;

type CatalogJoinRow = RewardRuleRow & {
  card_products: { name: string; issuers: { name: string } | null } | null;
  sources: { label: string; url: string | null; is_fictional: boolean } | null;
  reward_rule_conditions: RewardRuleConditionRow[];
};

function toEditableCondition(row: RewardRuleConditionRow): EditableCondition {
  return {
    id: row.id,
    rewardRuleId: row.reward_rule_id,
    merchantCategoryId: row.merchant_category_id,
    includedCategoryIds: row.included_category_ids,
    excludedCategoryIds: row.excluded_category_ids,
    includedMccs: row.included_mccs,
    // Postgres hands back the canonical half-open form; the editor works in
    // inclusive pairs, as the engine does.
    includedMccRanges: parseInt4Ranges(row.included_mcc_ranges),
    excludedMccs: row.excluded_mccs,
    includedMerchantIds: row.included_merchant_ids,
    excludedMerchantIds: row.excluded_merchant_ids,
    includedCountryCodes: row.included_country_codes,
    excludedCountryCodes: row.excluded_country_codes,
    includedCurrencyCodes: row.included_currency_codes,
    channel: row.channel,
    includedPaymentMethods: row.included_payment_methods,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    minAmountUsd: row.min_amount_usd,
    maxAmountUsd: row.max_amount_usd,
    notes: row.notes,
  };
}

function toCatalogRule(row: CatalogJoinRow, asOf: Date): CatalogRule {
  return {
    id: row.id,
    cardProductId: row.card_product_id,
    productName: row.card_products?.name ?? 'Unknown product',
    issuerName: row.card_products?.issuers?.name ?? null,
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
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    requiresEnrollment: row.requires_enrollment,
    enrollmentUrl: row.enrollment_url,
    spendThresholdUsd: row.spend_threshold_usd,
    sourceId: row.source_id,
    sourceLabel: row.sources?.label ?? null,
    sourceUrl: row.sources?.url ?? null,
    isFictionalSource: row.sources?.is_fictional ?? false,
    lastVerifiedAt: row.last_verified_at,
    verificationStatus: row.verification_status,
    isActive: row.is_active,
    notes: row.notes,
    conditions: row.reward_rule_conditions.map(toEditableCondition),
    freshness: ruleFreshness(
      {
        lastVerifiedAt: row.last_verified_at === null ? null : new Date(row.last_verified_at),
        verificationStatus: row.verification_status,
      },
      asOf,
    ),
  };
}

/**
 * Every catalog rule, with freshness derived against `asOf`.
 *
 * `asOf` is a parameter rather than a clock read: the caller supplies the instant, so
 * the staleness a test sees is the staleness a test chose.
 *
 * Retired rules are included. An editor curating the catalog needs to see what was
 * retired and why, and hiding them invites the same rule being added twice.
 */
export async function listCatalogRules(options: {
  readonly asOf: Date;
  readonly search?: string;
  readonly limit?: number;
}): Promise<CatalogRule[]> {
  const supabase = getSupabaseClient();

  try {
    let query = supabase
      .from('reward_rules')
      .select(CATALOG_SELECT)
      .order('last_verified_at', { ascending: true, nullsFirst: true })
      .limit(options.limit ?? 200);

    const search = options.search?.trim() ?? '';
    if (search.length >= 2) {
      // Escape the PostgREST filter metacharacters so a search string cannot
      // restructure the filter.
      query = query.ilike('label', `%${search.replace(/[%,()]/gu, ' ')}%`);
    }

    const { data, error } = await query;
    if (error !== null) throw fromPostgrestError(error);

    return ((data ?? []) as unknown as CatalogJoinRow[]).map((row) =>
      toCatalogRule(row, options.asOf),
    );
  } catch (cause) {
    throw toDataError(cause);
  }
}

export async function listSources(): Promise<SourceRow[]> {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('sources')
      .select('*')
      .order('label', { ascending: true });

    if (error !== null) throw fromPostgrestError(error);
    return data ?? [];
  } catch (cause) {
    throw toDataError(cause);
  }
}

// ---------------------------------------------------------------------------
// Writing rules
// ---------------------------------------------------------------------------

/** The insert payload for a rule, shared by the editor and the bulk importer. */
function ruleColumns(input: RewardRuleInput) {
  return {
    card_product_id: input.cardProductId,
    label: input.label,
    kind: input.kind,
    reward_type: input.rewardType,
    reward_unit: input.rewardUnit,
    base_rate: input.baseRate,
    bonus_rate: input.bonusRate,
    fixed_amount_usd: input.fixedAmountUsd,
    priority: input.priority,
    stack_group: input.stackGroup,
    is_stackable: input.isStackable,
    cap_amount: input.capAmount,
    cap_applies_to: input.capAppliesTo,
    cap_period: input.capPeriod,
    post_cap_rate: input.postCapRate,
    starts_at: input.startsAt?.toISOString() ?? null,
    ends_at: input.endsAt?.toISOString() ?? null,
    requires_enrollment: input.requiresEnrollment,
    enrollment_url: input.enrollmentUrl,
    spend_threshold_usd: input.spendThresholdUsd,
    source_id: input.sourceId,
    last_verified_at: input.lastVerifiedAt?.toISOString() ?? null,
    verification_status: input.verificationStatus,
    notes: input.notes ?? null,
  };
}

export async function createRewardRule(input: RewardRuleInput): Promise<RewardRuleRow> {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('reward_rules')
      .insert(ruleColumns(input))
      .select('*')
      .single();

    if (error !== null) throw fromPostgrestError(error);

    track('catalog_rule_edited', { action: 'insert', kind: input.kind });
    return data;
  } catch (cause) {
    throw toDataError(cause);
  }
}

export async function updateRewardRule(
  id: string,
  input: RewardRuleInput,
): Promise<RewardRuleRow> {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('reward_rules')
      .update(ruleColumns(input))
      .eq('id', id)
      .select('*')
      .single();

    if (error !== null) throw fromPostgrestError(error);

    track('catalog_rule_edited', { action: 'update', kind: input.kind });
    return data;
  } catch (cause) {
    throw toDataError(cause);
  }
}

/**
 * Retires a rule rather than deleting it.
 *
 * A delete would orphan the recommendations, cap-usage rows and verification history
 * that reference it, and would make an old answer unexplainable. Retiring sets
 * `is_active = false` and the `retired` status, which is what the engine already
 * screens on.
 */
export async function retireRewardRule(id: string): Promise<void> {
  const supabase = getSupabaseClient();

  try {
    const { error } = await supabase
      .from('reward_rules')
      .update({ is_active: false, verification_status: 'retired' })
      .eq('id', id);

    if (error !== null) throw fromPostgrestError(error);
    track('catalog_rule_edited', { action: 'retire' });
  } catch (cause) {
    throw toDataError(cause);
  }
}

/** Brings a retired rule back, as unverified — its old verification has expired. */
export async function reinstateRewardRule(id: string): Promise<void> {
  const supabase = getSupabaseClient();

  try {
    const { error } = await supabase
      .from('reward_rules')
      .update({ is_active: true, verification_status: 'unverified' })
      .eq('id', id);

    if (error !== null) throw fromPostgrestError(error);
    track('catalog_rule_edited', { action: 'reinstate' });
  } catch (cause) {
    throw toDataError(cause);
  }
}

// ---------------------------------------------------------------------------
// Writing conditions
// ---------------------------------------------------------------------------

function conditionColumns(input: RewardRuleConditionInput) {
  return {
    reward_rule_id: input.rewardRuleId,
    merchant_category_id: input.merchantCategoryId,
    included_category_ids: [...input.includedCategoryIds],
    excluded_category_ids: [...input.excludedCategoryIds],
    included_mccs: [...input.includedMccs],
    // Inclusive pairs out, canonical half-open literals in. Getting this backwards
    // widens every range by one code, which is invisible on screen.
    included_mcc_ranges: formatInt4Ranges(input.includedMccRanges),
    excluded_mccs: [...input.excludedMccs],
    included_merchant_ids: [...input.includedMerchantIds],
    excluded_merchant_ids: [...input.excludedMerchantIds],
    included_country_codes: [...input.includedCountryCodes],
    excluded_country_codes: [...input.excludedCountryCodes],
    included_currency_codes: [...input.includedCurrencyCodes],
    channel: input.channel,
    included_payment_methods: [...input.includedPaymentMethods],
    starts_at: input.startsAt?.toISOString() ?? null,
    ends_at: input.endsAt?.toISOString() ?? null,
    min_amount_usd: input.minAmountUsd,
    max_amount_usd: input.maxAmountUsd,
    notes: input.notes ?? null,
  };
}

export async function createCondition(
  input: RewardRuleConditionInput,
): Promise<RewardRuleConditionRow> {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('reward_rule_conditions')
      .insert(conditionColumns(input))
      .select('*')
      .single();

    if (error !== null) throw fromPostgrestError(error);
    track('catalog_rule_edited', { action: 'condition_insert' });
    return data;
  } catch (cause) {
    throw toDataError(cause);
  }
}

export async function updateCondition(
  id: string,
  input: RewardRuleConditionInput,
): Promise<RewardRuleConditionRow> {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('reward_rule_conditions')
      .update(conditionColumns(input))
      .eq('id', id)
      .select('*')
      .single();

    if (error !== null) throw fromPostgrestError(error);
    track('catalog_rule_edited', { action: 'condition_update' });
    return data;
  } catch (cause) {
    throw toDataError(cause);
  }
}

/**
 * Deletes a condition row.
 *
 * A real delete is right here, unlike a rule: a condition is part of a rule's
 * definition rather than something a past recommendation points at, and the audit
 * trigger records the deletion either way.
 */
export async function deleteCondition(id: string): Promise<void> {
  const supabase = getSupabaseClient();

  try {
    const { error } = await supabase.from('reward_rule_conditions').delete().eq('id', id);
    if (error !== null) throw fromPostgrestError(error);
    track('catalog_rule_edited', { action: 'condition_delete' });
  } catch (cause) {
    throw toDataError(cause);
  }
}

// ---------------------------------------------------------------------------
// Sources and verification
// ---------------------------------------------------------------------------

export async function createSource(input: SourceInput): Promise<SourceRow> {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('sources')
      .insert({
        label: input.label,
        url: input.url,
        publisher: input.publisher ?? null,
        document_type: input.documentType,
        published_on: input.publishedOn?.toISOString().slice(0, 10) ?? null,
        retrieved_on: input.retrievedOn?.toISOString().slice(0, 10) ?? null,
        notes: input.notes ?? null,
        is_fictional: input.isFictional,
      })
      .select('*')
      .single();

    if (error !== null) throw fromPostgrestError(error);
    return data;
  } catch (cause) {
    throw toDataError(cause);
  }
}

/**
 * Records a verification: appends to the history, then updates the rule.
 *
 * WHY THE HISTORY IS WRITTEN FIRST
 * `verification_history` is append-only — there is no UPDATE or DELETE policy on it
 * — so it cannot be rolled back. Writing it first means the worst failure leaves an
 * accurate record of an attempted verification with the rule unchanged, which a
 * reviewer can see and repeat. Writing the rule first and failing on the history
 * would leave a rule claiming to be verified with nothing recording who said so.
 *
 * `verified_by` is set to the signed-in user because the RLS policy requires it to
 * equal `auth.uid()` — an editor cannot attribute a verification to someone else.
 */
export async function recordVerification(
  input: VerificationInput,
  options: { readonly asOf?: Date } = {},
): Promise<VerificationHistoryRow> {
  const supabase = getSupabaseClient();
  const verifiedAt = (options.asOf ?? new Date()).toISOString();

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError !== null || userData.user === null) {
      throw new DataError('unauthenticated', 'Please sign in again.');
    }

    const { data: existing, error: readError } = await supabase
      .from('reward_rules')
      .select('verification_status')
      .eq('id', input.rewardRuleId)
      .single();

    if (readError !== null) throw fromPostgrestError(readError);

    const { data: history, error: historyError } = await supabase
      .from('verification_history')
      .insert({
        reward_rule_id: input.rewardRuleId,
        source_id: input.sourceId,
        previous_status: existing.verification_status,
        new_status: input.newStatus,
        verified_base_rate: input.verifiedBaseRate,
        verified_bonus_rate: input.verifiedBonusRate,
        verified_at: verifiedAt,
        verified_by: userData.user.id,
        note: input.note ?? null,
      })
      .select('*')
      .single();

    if (historyError !== null) throw fromPostgrestError(historyError);

    // Only a `verified` outcome stamps the date. Marking a rule disputed does not
    // make it freshly checked, and stamping the date would reset its staleness clock.
    const { error: ruleError } = await supabase
      .from('reward_rules')
      .update({
        verification_status: input.newStatus,
        ...(input.sourceId === null ? {} : { source_id: input.sourceId }),
        ...(input.newStatus === 'verified' ? { last_verified_at: verifiedAt } : {}),
      })
      .eq('id', input.rewardRuleId);

    if (ruleError !== null) throw fromPostgrestError(ruleError);

    track('catalog_rule_verified', {
      newStatus: input.newStatus,
      previousStatus: existing.verification_status,
      hasSource: input.sourceId !== null,
    });

    return history;
  } catch (cause) {
    throw toDataError(cause);
  }
}

export interface VerificationHistoryEntry {
  readonly id: string;
  readonly rewardRuleId: string;
  readonly previousStatus: VerificationHistoryRow['previous_status'];
  readonly newStatus: VerificationHistoryRow['new_status'];
  readonly verifiedBaseRate: number | null;
  readonly verifiedBonusRate: number | null;
  readonly verifiedAt: string;
  readonly sourceLabel: string | null;
  readonly note: string | null;
}

export async function listVerificationHistory(
  rewardRuleId: string,
): Promise<VerificationHistoryEntry[]> {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('verification_history')
      .select('*, sources ( label )')
      .eq('reward_rule_id', rewardRuleId)
      .order('verified_at', { ascending: false })
      .limit(50);

    if (error !== null) throw fromPostgrestError(error);

    return (
      (data ?? []) as unknown as (VerificationHistoryRow & {
        sources: { label: string } | null;
      })[]
    ).map((row) => ({
      id: row.id,
      rewardRuleId: row.reward_rule_id,
      previousStatus: row.previous_status,
      newStatus: row.new_status,
      verifiedBaseRate: row.verified_base_rate,
      verifiedBonusRate: row.verified_bonus_rate,
      verifiedAt: row.verified_at,
      sourceLabel: row.sources?.label ?? null,
      note: row.note,
    }));
  } catch (cause) {
    throw toDataError(cause);
  }
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export interface AuditEntry {
  readonly id: number;
  readonly action: AuditLogRow['action'];
  readonly tableName: string;
  readonly recordId: string | null;
  /** Column NAMES only. The trail never records a value — see SECURITY.md. */
  readonly changedColumns: readonly string[];
  readonly actorRole: AuditLogRow['actor_role'];
  readonly occurredAt: string;
}

/**
 * The audit trail, newest first.
 *
 * RLS decides what comes back: an admin sees everything, and anyone else sees only
 * rows where they are the actor or the subject. This function does not filter — the
 * database does, which is the only place a filter cannot be bypassed.
 */
export async function listAuditLog(
  options: { readonly limit?: number; readonly tableName?: string } = {},
): Promise<AuditEntry[]> {
  const supabase = getSupabaseClient();

  try {
    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(options.limit ?? 50);

    if (options.tableName !== undefined) {
      query = query.eq('table_name', options.tableName);
    }

    const { data, error } = await query;
    if (error !== null) throw fromPostgrestError(error);

    return (data ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      tableName: row.table_name,
      recordId: row.record_id,
      changedColumns: row.changed_columns,
      actorRole: row.actor_role,
      occurredAt: row.occurred_at,
    }));
  } catch (cause) {
    throw toDataError(cause);
  }
}

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------

export interface BulkImportOutcome {
  readonly insertedCount: number;
  readonly rows: readonly RewardRuleRow[];
}

/**
 * Inserts pre-validated rules in one statement.
 *
 * Takes only rows that `validateRuleImport` already accepted — validation is pure and
 * happens before anything reaches the network. One statement rather than a loop, so
 * the batch either lands or does not: a half-applied import would leave the catalog
 * in a state nobody chose, and there is no client-side transaction over PostgREST to
 * undo it.
 */
export async function bulkInsertRewardRules(
  rules: readonly RewardRuleInput[],
): Promise<BulkImportOutcome> {
  if (rules.length === 0) {
    return { insertedCount: 0, rows: [] };
  }

  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('reward_rules')
      .insert(rules.map(ruleColumns))
      .select('*');

    if (error !== null) throw fromPostgrestError(error);

    track('catalog_rules_imported', { count: rules.length });
    return { insertedCount: (data ?? []).length, rows: data ?? [] };
  } catch (cause) {
    throw toDataError(cause);
  }
}
