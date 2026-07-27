/**
 * Where a rate came from, and everything that has happened to it since.
 *
 * WHY THIS IS A SEPARATE READ
 * The wallet snapshot the engine consumes deliberately carries only what the
 * arithmetic needs: rates, caps, conditions, `lastVerifiedAt`, `verificationStatus`.
 * Provenance — the document, its publisher, the change history — is evidence *about*
 * those numbers rather than an input to them, and it is only wanted on two detail
 * screens. Loading it with every recommendation would make the hot path slower to
 * answer a question nobody asked yet.
 *
 * TWO QUERIES, NOT ONE EMBEDDED JOIN
 * PostgREST could nest `verification_history` under `reward_rules` in a single
 * request, but `reward_rules` reaches `sources` both directly (`source_id`) and
 * through `verification_history`, and an ambiguous embed fails at runtime rather
 * than at compile time. Two explicit queries cost one extra round trip on a screen
 * the user has already stopped scrolling on, and they cannot become ambiguous.
 *
 * NO CALCULATION HAPPENS HERE. The rates in a history row are the rates that were
 * *recorded* at verification time — a stored snapshot, not a recomputation. They
 * exist so a recommendation from three months ago is still explainable after the
 * issuer changed the rate.
 */
import { isDemoMode } from '@/config/env';
import { demoRuleProvenance } from '@/features/demo/demoProvenance';
import { fromPostgrestError, toDataError } from '@/lib/errors';
import { getSupabaseClient } from '@/lib/supabase';
import type {
  RewardRuleRow,
  SourceDocumentType,
  SourceRow,
  VerificationHistoryRow,
  VerificationStatus,
} from '@/types/database';

/** A provenance source, camel-cased at the boundary. */
export interface SourceSummary {
  readonly id: string;
  readonly label: string;
  /**
   * A public issuer page or terms document.
   *
   * WalletWise *reads* these by hand; it never fetches or scrapes them. The URL is
   * shown so a user can check the rate themselves. See SECURITY.md.
   */
  readonly url: string | null;
  readonly publisher: string | null;
  readonly documentType: SourceDocumentType;
  readonly publishedOn: string | null;
  readonly retrievedOn: string | null;
  readonly notes: string | null;
  readonly isFictional: boolean;
}

/** One append-only entry from `verification_history`. */
export interface VerificationEvent {
  readonly id: string;
  readonly rewardRuleId: string;
  readonly previousStatus: VerificationStatus | null;
  readonly newStatus: VerificationStatus;
  /** The rate as recorded at the time, not as it stands now. */
  readonly verifiedBaseRate: number | null;
  readonly verifiedBonusRate: number | null;
  readonly verifiedAt: string;
  readonly sourceLabel: string | null;
  readonly note: string | null;
}

/** One rule's evidence: the document behind it, and its history of changes. */
export interface RuleProvenance {
  readonly ruleId: string;
  readonly ruleLabel: string;
  readonly verificationStatus: VerificationStatus;
  readonly lastVerifiedAt: string | null;
  readonly source: SourceSummary | null;
  /** Newest first, so the current state reads before how it got there. */
  readonly history: readonly VerificationEvent[];
}

function toSourceSummary(row: SourceRow): SourceSummary {
  return {
    id: row.id,
    label: row.label,
    url: row.url,
    publisher: row.publisher,
    documentType: row.document_type,
    publishedOn: row.published_on,
    retrievedOn: row.retrieved_on,
    notes: row.notes,
    isFictional: row.is_fictional,
  };
}

type RuleWithSource = Pick<
  RewardRuleRow,
  'id' | 'label' | 'verification_status' | 'last_verified_at'
> & { sources: SourceRow | null };

type HistoryWithSource = VerificationHistoryRow & { sources: { label: string } | null };

/**
 * Provenance for a set of rules, in the order the ids were given.
 *
 * Caller order is preserved rather than re-sorted, because the caller already
 * decided what order the rules should read in — by priority on the card screen, or
 * one single rule on the recommendation screen — and re-sorting here would fight it.
 * A rule id that returns nothing is dropped rather than filled with placeholders.
 */
export async function listRuleProvenance(
  ruleIds: readonly string[],
): Promise<readonly RuleProvenance[]> {
  // Deduplicated because a card can carry two rules citing the same document, and
  // an empty list must not become `in.()`, which PostgREST rejects.
  const ids = [...new Set(ruleIds)];
  if (ids.length === 0) return [];

  if (isDemoMode()) return demoRuleProvenance(ids);

  const supabase = getSupabaseClient();

  try {
    const [rules, history] = await Promise.all([
      supabase
        .from('reward_rules')
        .select('id, label, verification_status, last_verified_at, sources ( * )')
        .in('id', ids),
      supabase
        .from('verification_history')
        .select('*, sources ( label )')
        .in('reward_rule_id', ids)
        .order('verified_at', { ascending: false })
        .limit(200),
    ]);

    if (rules.error !== null) throw fromPostgrestError(rules.error);
    if (history.error !== null) throw fromPostgrestError(history.error);

    const ruleRows = (rules.data ?? []) as unknown as RuleWithSource[];
    const historyRows = (history.data ?? []) as unknown as HistoryWithSource[];

    const byRuleId = new Map<string, VerificationEvent[]>();
    for (const row of historyRows) {
      const events = byRuleId.get(row.reward_rule_id) ?? [];
      events.push({
        id: row.id,
        rewardRuleId: row.reward_rule_id,
        previousStatus: row.previous_status,
        newStatus: row.new_status,
        verifiedBaseRate: row.verified_base_rate,
        verifiedBonusRate: row.verified_bonus_rate,
        verifiedAt: row.verified_at,
        sourceLabel: row.sources?.label ?? null,
        note: row.note,
      });
      byRuleId.set(row.reward_rule_id, events);
    }

    const byId = new Map(ruleRows.map((row) => [row.id, row]));

    return ids.flatMap((id) => {
      const row = byId.get(id);
      if (row === undefined) return [];
      return [
        {
          ruleId: row.id,
          ruleLabel: row.label,
          verificationStatus: row.verification_status,
          lastVerifiedAt: row.last_verified_at,
          source: row.sources === null ? null : toSourceSummary(row.sources),
          history: byRuleId.get(id) ?? [],
        },
      ];
    });
  } catch (cause) {
    throw toDataError(cause);
  }
}
