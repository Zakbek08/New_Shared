/**
 * One-line summaries of a card product, derived from its rule rows.
 *
 * Extracted from the catalog data layer so the bundled demo wallet can produce the
 * same summary the database path produces. Two implementations of "which rate is the
 * headline?" would eventually disagree, and the disagreement would show up as a card
 * whose list entry contradicts its detail screen.
 *
 * Pure, like everything in `src/domain/`: these are *display* choices over stored
 * numbers, not reward calculations. Nothing here computes what a purchase earns —
 * that is `src/domain/rewards/` and only ever that.
 */
import type { RewardRuleRow, VerificationStatus } from '@/types/database';

/** The rule columns a summary needs. Both the list and detail queries supply these. */
export type RuleSummaryFields = Pick<
  RewardRuleRow,
  | 'id'
  | 'label'
  | 'kind'
  | 'reward_type'
  | 'base_rate'
  | 'bonus_rate'
  | 'is_active'
  | 'verification_status'
  | 'last_verified_at'
>;

/**
 * Ordered weakest-first, so the lowest rank is the least trustworthy status.
 *
 * `retired` sits above `stale` deliberately: "no longer offered" is a definite
 * statement about the rule, not a doubt about the evidence behind it.
 *
 * Exported because the provenance UI needs the same ordering when it summarises a set
 * of rules sharing one document. Two independent notions of "weakest" would eventually
 * disagree, and the disagreement would be a card claiming more confidence on one screen
 * than on another.
 */
export const VERIFICATION_STATUS_STRENGTH: Record<VerificationStatus, number> = {
  disputed: 0,
  unverified: 1,
  stale: 2,
  user_reported: 3,
  retired: 4,
  verified: 5,
};

/**
 * The single most useful rate on a card, for a one-line summary.
 *
 * Picks the highest-earning non-base rule, falling back to the base rule. This is a
 * display heuristic over stored numbers — the engine never consults it, and a card
 * whose headline is a 6% bonus can still lose a recommendation to a flat 2% card once
 * the bonus cap is spent.
 */
export function headlineRuleLabel(rules: readonly RuleSummaryFields[]): string | null {
  const active = rules.filter((rule) => rule.is_active);
  if (active.length === 0) return null;

  const ranked = [...active].sort((a, b) => {
    const aRate = a.base_rate + a.bonus_rate;
    const bRate = b.base_rate + b.bonus_rate;
    if (aRate !== bRate) return bRate - aRate;
    // Prefer a bonus over the base rule when the numbers tie.
    return (a.kind === 'base' ? 1 : 0) - (b.kind === 'base' ? 1 : 0);
  });

  return ranked[0]?.label ?? null;
}

export interface WeakestVerification {
  readonly status: VerificationStatus | null;
  readonly lastVerifiedAt: string | null;
}

/**
 * The weakest verification across a card's active rules.
 *
 * The weakest rather than the newest, because a card is only as trustworthy as its
 * least-checked rate: showing "verified today" on a card carrying one disputed rule
 * would be true of that card's best rule and misleading about the card.
 */
export function weakestVerification(rules: readonly RuleSummaryFields[]): WeakestVerification {
  const active = rules.filter((rule) => rule.is_active);
  const first = active[0];
  if (first === undefined) return { status: null, lastVerifiedAt: null };

  let weakest = first;
  for (const rule of active) {
    if (
      VERIFICATION_STATUS_STRENGTH[rule.verification_status] <
      VERIFICATION_STATUS_STRENGTH[weakest.verification_status]
    ) {
      weakest = rule;
    }
  }

  return { status: weakest.verification_status, lastVerifiedAt: weakest.last_verified_at };
}
