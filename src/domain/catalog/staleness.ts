/**
 * When does a verified rate stop being trustworthy?
 *
 * A rule verified against an issuer's terms in January is not evidence about
 * today's terms. Issuers change rates, categories and caps without notice, so a
 * verification date decays: past the freshness window a rule is treated as
 * **stale** regardless of what its `verification_status` column says.
 *
 * That is deliberately a *derived* judgement rather than a stored one. Storing it
 * would need a scheduled job, and a rule would sit falsely "verified" until the job
 * next ran. Deriving it means the flag is correct the instant the window passes,
 * and the same function answers for the admin queue and for the confidence the user
 * sees.
 *
 * Pure, like everything in `src/domain/`. Time arrives as `asOf`.
 */
import type { VerificationStatus } from '@/types/database';

/**
 * How long a verification is good for.
 *
 * Ninety days is a judgement, not a fact: long enough that curating the catalog is
 * not a full-time job, short enough that a mid-quarter rate change is caught within
 * one cycle. It is exported so the UI can state the number rather than describe it
 * vaguely.
 */
export const FRESHNESS_WINDOW_DAYS = 90;

/** Verifications inside this many days of expiry are worth queueing now. */
export const REVIEW_SOON_DAYS = 14;

export type FreshnessBand = 'fresh' | 'due_soon' | 'stale' | 'never_verified';

export interface RuleFreshness {
  /** Whole days since the verification, or `null` when never verified. */
  readonly daysSinceVerified: number | null;
  /** Days until the window closes. Negative once past it. `null` if never verified. */
  readonly daysUntilStale: number | null;
  readonly band: FreshnessBand;
  /**
   * The status the app should act on.
   *
   * Equals the stored status except where the window has closed on something
   * previously `verified` — then it becomes `stale`, without any write.
   */
  readonly effectiveStatus: VerificationStatus;
  /** True when `effectiveStatus` differs from what the column holds. */
  readonly isDowngradedByAge: boolean;
}

const MILLIS_PER_DAY = 86_400_000;

/** Whole days from `from` to `to`, floored. Negative when `to` precedes `from`. */
function wholeDaysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MILLIS_PER_DAY);
}

/**
 * How fresh one rule's verification is.
 *
 * `retired` and `disputed` are never downgraded: they are stronger statements than
 * "stale" and ageing does not make them weaker. A `user_reported` rate is not aged
 * either — it was never a verification against a source, so there is nothing to
 * expire.
 */
export function ruleFreshness(
  rule: {
    readonly lastVerifiedAt: Date | null;
    readonly verificationStatus: VerificationStatus;
  },
  asOf: Date,
  options: { readonly windowDays?: number } = {},
): RuleFreshness {
  const windowDays = options.windowDays ?? FRESHNESS_WINDOW_DAYS;
  const { lastVerifiedAt, verificationStatus } = rule;

  if (lastVerifiedAt === null) {
    // The band describes the *verification*; the status describes the rule. With no
    // date there is nothing to age, so the status passes through untouched — a
    // `disputed` rule with no verification date stays disputed, not "stale".
    return {
      daysSinceVerified: null,
      daysUntilStale: null,
      band: 'never_verified',
      effectiveStatus: verificationStatus,
      isDowngradedByAge: false,
    };
  }

  const daysSinceVerified = wholeDaysBetween(lastVerifiedAt, asOf);
  const daysUntilStale = windowDays - daysSinceVerified;

  // Only a live verification decays. See the doc comment above for why the other
  // statuses are left alone.
  const decays = verificationStatus === 'verified';
  const isPastWindow = daysSinceVerified > windowDays;

  const band: FreshnessBand =
    isPastWindow || verificationStatus === 'stale'
      ? 'stale'
      : daysUntilStale <= REVIEW_SOON_DAYS
        ? 'due_soon'
        : 'fresh';

  const isDowngradedByAge = decays && isPastWindow;

  return {
    daysSinceVerified,
    daysUntilStale,
    band,
    effectiveStatus: isDowngradedByAge ? 'stale' : verificationStatus,
    isDowngradedByAge,
  };
}

/** Human phrasing for a band. Kept beside the logic so the two cannot drift. */
export const FRESHNESS_BAND_LABELS: Record<FreshnessBand, string> = {
  fresh: 'Verified recently',
  due_soon: 'Due for review',
  stale: 'Out of date',
  never_verified: 'Never verified',
};

/**
 * Review priority, worst first.
 *
 * Order, and why: never-verified rules are the biggest liability — the app is
 * quoting a rate nobody checked — then stale, then due soon, then fresh. Within a
 * band, the oldest verification first, and finally the rule id so the queue is a
 * total order and does not reshuffle between renders.
 */
const BAND_RANK: Record<FreshnessBand, number> = {
  never_verified: 0,
  stale: 1,
  due_soon: 2,
  fresh: 3,
};

export function compareReviewPriority(
  left: { readonly id: string; readonly freshness: RuleFreshness },
  right: { readonly id: string; readonly freshness: RuleFreshness },
): number {
  const bandGap = BAND_RANK[left.freshness.band] - BAND_RANK[right.freshness.band];
  if (bandGap !== 0) return bandGap;

  const leftAge = left.freshness.daysSinceVerified ?? Number.POSITIVE_INFINITY;
  const rightAge = right.freshness.daysSinceVerified ?? Number.POSITIVE_INFINITY;
  if (leftAge !== rightAge) return rightAge - leftAge;

  return left.id.localeCompare(right.id);
}

/** Counts per band, for the queue's summary line. */
export function freshnessTally(
  freshnesses: readonly RuleFreshness[],
): Readonly<Record<FreshnessBand, number>> {
  const tally: Record<FreshnessBand, number> = {
    fresh: 0,
    due_soon: 0,
    stale: 0,
    never_verified: 0,
  };

  for (const freshness of freshnesses) {
    tally[freshness.band] += 1;
  }

  return tally;
}
