/**
 * Spending-cap progress across the whole wallet.
 *
 * The engine already resolves one rule's cap while it evaluates a purchase
 * (`caps.ts`). This module answers the dashboard's question instead: across every
 * capped bonus the user holds, how much is left and when does it reset?
 *
 * Pure, like everything in `src/domain/`. Time arrives as `asOf`.
 *
 * EVERY FIGURE HERE IS AN ESTIMATE, for two compounding reasons: issuers measure
 * caps against an unpublished statement cycle, and WalletWise only knows about the
 * purchases the user told it about. The UI has to say both things out loud — see
 * `CAP_ESTIMATE_DISCLAIMER`.
 */
import type { CapPeriod } from '@/types/database';

import { capUtilisation, isCapExhausted, isCapNearlyReached, resolveRuleCap } from './caps';
import { daysRemainingInWindow } from './capWindow';
import { windowContains } from './conditions';
import type { EvaluableCard, EvaluableRule } from './types';

/**
 * How much of a cap is gone.
 *
 * `nearly_reached` is the actionable one: the bonus still pays, but not for much
 * longer, so the user may want to switch cards *before* being surprised.
 */
export type CapStatus = 'ample' | 'nearly_reached' | 'exhausted';

export interface CapProgressEntry {
  readonly userCardId: string;
  readonly cardName: string;
  readonly ruleId: string;
  readonly ruleLabel: string;
  readonly capAmountUsd: number;
  readonly consumedUsd: number;
  readonly remainingUsd: number;
  /** 0-1. Rounded to four places, so a progress bar cannot jitter. */
  readonly utilisation: number;
  readonly appliesTo: 'spend' | 'reward';
  readonly capPeriod: CapPeriod;
  /** `null` for a lifetime cap, which never resets. */
  readonly daysUntilReset: number | null;
  readonly status: CapStatus;
  /**
   * True when the bonus needs activating and the user has not activated it.
   *
   * Progress is still reported, because the cap is real and the user may activate
   * later — but the UI must not imply the bonus is currently earning.
   */
  readonly requiresActivation: boolean;
}

/** The threshold `isCapNearlyReached` uses, exposed so the UI can state it. */
export const CAP_WARNING_UTILISATION = 0.8;

export const CAP_ESTIMATE_DISCLAIMER =
  'Cap progress is an estimate. Your issuer measures caps against a statement cycle we cannot see, and we only know about the purchases you have told us about.';

/** Only a rule that is capped, active, and inside its own date window qualifies. */
function isTrackable(rule: EvaluableRule, asOf: Date): boolean {
  if (!rule.isActive) return false;
  if (rule.capAmount === null || rule.capAmount === 0) return false;
  // An expired quarter's cap is history, not a live figure to track.
  return windowContains(rule.startsAt, rule.endsAt, asOf).matched;
}

function statusFor(cap: Parameters<typeof isCapExhausted>[0]): CapStatus {
  // Exhausted first: a cap can be both 100% used and "nearly reached" by a naive
  // reading, and the stronger statement is the one the user needs.
  if (isCapExhausted(cap)) return 'exhausted';
  if (isCapNearlyReached(cap)) return 'nearly_reached';
  return 'ample';
}

/**
 * Cap progress for every capped bonus in the wallet, most-consumed first.
 *
 * Cards the user excluded from recommendations are still included: the cap is a
 * fact about their account either way, and hiding it would make the dashboard
 * disagree with their statement.
 */
export function capProgressForWallet(
  cards: readonly EvaluableCard[],
  asOf: Date,
): readonly CapProgressEntry[] {
  const entries: CapProgressEntry[] = [];

  for (const card of cards) {
    for (const rule of card.rules) {
      if (!isTrackable(rule, asOf)) continue;

      const cap = resolveRuleCap(rule, card, asOf);
      if (cap.capAmountUsd === null || cap.capRemainingUsd === null) continue;

      const utilisation = capUtilisation(cap) ?? 0;

      entries.push({
        userCardId: card.userCardId,
        cardName: card.displayName,
        ruleId: rule.id,
        ruleLabel: rule.label,
        capAmountUsd: cap.capAmountUsd,
        consumedUsd: cap.consumedUsd,
        remainingUsd: cap.capRemainingUsd,
        utilisation: Math.round(utilisation * 10_000) / 10_000,
        appliesTo: cap.appliesTo,
        capPeriod: rule.capPeriod,
        daysUntilReset: cap.window === null ? null : daysRemainingInWindow(cap.window, asOf),
        status: statusFor(cap),
        requiresActivation: rule.requiresEnrollment && card.enrollments[rule.id] !== true,
      });
    }
  }

  // Most consumed first, then the one resetting soonest, then rule id. The final
  // key makes the order total, so the list cannot reshuffle between renders.
  return entries.sort((left, right) => {
    if (left.utilisation !== right.utilisation) return right.utilisation - left.utilisation;

    const leftDays = left.daysUntilReset ?? Number.POSITIVE_INFINITY;
    const rightDays = right.daysUntilReset ?? Number.POSITIVE_INFINITY;
    if (leftDays !== rightDays) return leftDays - rightDays;

    return left.ruleId.localeCompare(right.ruleId);
  });
}

/**
 * The subset worth interrupting the user about.
 *
 * An `ample` cap is not news. An exhausted one changes which card they should
 * reach for today, and a nearly-reached one will change it shortly.
 */
export function capAlerts(entries: readonly CapProgressEntry[]): readonly CapProgressEntry[] {
  return entries.filter((entry) => entry.status !== 'ample');
}
