/**
 * Staleness.
 *
 * The window boundary is the whole behaviour, so it is asserted to the day: 89 days
 * is fresh-ish, 90 is the last good day, 91 is out of date. A rule that quietly stays
 * "verified" past its window is the app presenting a rate nobody has checked this
 * quarter as though someone had.
 */
import {
  compareReviewPriority,
  FRESHNESS_BAND_LABELS,
  FRESHNESS_WINDOW_DAYS,
  freshnessTally,
  REVIEW_SOON_DAYS,
  ruleFreshness,
} from './staleness';

const AS_OF = new Date('2026-07-26T14:30:00.000Z');

/** A verification `days` before AS_OF, at the same time of day. */
function daysAgo(days: number): Date {
  return new Date(AS_OF.getTime() - days * 86_400_000);
}

describe('ruleFreshness', () => {
  it('reports a recent verification as fresh', () => {
    const freshness = ruleFreshness(
      { lastVerifiedAt: daysAgo(10), verificationStatus: 'verified' },
      AS_OF,
    );

    expect(freshness).toMatchObject({
      daysSinceVerified: 10,
      daysUntilStale: 80,
      band: 'fresh',
      effectiveStatus: 'verified',
      isDowngradedByAge: false,
    });
  });

  it('is still fresh the day before the review window opens', () => {
    // The review window opens 14 days out, so 75 days in leaves 15 — still fresh.
    expect(
      ruleFreshness({ lastVerifiedAt: daysAgo(75), verificationStatus: 'verified' }, AS_OF)
        .band,
    ).toBe('fresh');
  });

  it('is due for review exactly at the threshold', () => {
    // 76 days in leaves 14, which is `REVIEW_SOON_DAYS`.
    expect(REVIEW_SOON_DAYS).toBe(14);
    expect(
      ruleFreshness({ lastVerifiedAt: daysAgo(76), verificationStatus: 'verified' }, AS_OF)
        .band,
    ).toBe('due_soon');
  });

  it('is still merely due for review on the last good day', () => {
    // Exactly 90 days: inside the window, so not yet out of date.
    expect(FRESHNESS_WINDOW_DAYS).toBe(90);

    const freshness = ruleFreshness(
      { lastVerifiedAt: daysAgo(90), verificationStatus: 'verified' },
      AS_OF,
    );

    expect(freshness.band).toBe('due_soon');
    expect(freshness.daysUntilStale).toBe(0);
    expect(freshness.effectiveStatus).toBe('verified');
    expect(freshness.isDowngradedByAge).toBe(false);
  });

  it('becomes out of date the day after the window closes', () => {
    const freshness = ruleFreshness(
      { lastVerifiedAt: daysAgo(91), verificationStatus: 'verified' },
      AS_OF,
    );

    expect(freshness.band).toBe('stale');
    expect(freshness.daysUntilStale).toBe(-1);
    // The column still says `verified`; the app acts on `stale`, with no write.
    expect(freshness.effectiveStatus).toBe('stale');
    expect(freshness.isDowngradedByAge).toBe(true);
  });

  it('honours a caller-supplied window', () => {
    const freshness = ruleFreshness(
      { lastVerifiedAt: daysAgo(40), verificationStatus: 'verified' },
      AS_OF,
      { windowDays: 30 },
    );

    expect(freshness.band).toBe('stale');
    expect(freshness.effectiveStatus).toBe('stale');
  });

  it('reports a rule that was never verified as never verified', () => {
    const freshness = ruleFreshness(
      { lastVerifiedAt: null, verificationStatus: 'unverified' },
      AS_OF,
    );

    expect(freshness).toMatchObject({
      daysSinceVerified: null,
      daysUntilStale: null,
      band: 'never_verified',
      effectiveStatus: 'unverified',
      isDowngradedByAge: false,
    });
  });

  it('does not downgrade a disputed rule, which is a stronger statement than stale', () => {
    const freshness = ruleFreshness(
      { lastVerifiedAt: daysAgo(400), verificationStatus: 'disputed' },
      AS_OF,
    );

    expect(freshness.effectiveStatus).toBe('disputed');
    expect(freshness.isDowngradedByAge).toBe(false);
    // The band still reports the age honestly.
    expect(freshness.band).toBe('stale');
  });

  it('does not downgrade a retired rule', () => {
    expect(
      ruleFreshness({ lastVerifiedAt: daysAgo(400), verificationStatus: 'retired' }, AS_OF)
        .effectiveStatus,
    ).toBe('retired');
  });

  it('does not age a user-reported rate, which was never a verification', () => {
    // A cardholder's own figure has nothing to expire: there is no source it was
    // checked against, so calling it "stale" would imply one.
    const freshness = ruleFreshness(
      { lastVerifiedAt: daysAgo(400), verificationStatus: 'user_reported' },
      AS_OF,
    );

    expect(freshness.effectiveStatus).toBe('user_reported');
    expect(freshness.isDowngradedByAge).toBe(false);
  });

  it('keeps a stored stale status stale even inside the window', () => {
    // Someone marked it out of date deliberately; the clock does not overrule them.
    const freshness = ruleFreshness(
      { lastVerifiedAt: daysAgo(2), verificationStatus: 'stale' },
      AS_OF,
    );

    expect(freshness.band).toBe('stale');
    expect(freshness.effectiveStatus).toBe('stale');
  });

  it('handles a verification dated in the future without going negative', () => {
    // Clock skew or a typo. Reporting -3 days "since" is nonsense; the band should
    // simply be fresh.
    const freshness = ruleFreshness(
      {
        lastVerifiedAt: new Date(AS_OF.getTime() + 3 * 86_400_000),
        verificationStatus: 'verified',
      },
      AS_OF,
    );

    expect(freshness.daysSinceVerified).toBe(-3);
    expect(freshness.band).toBe('fresh');
    expect(freshness.isDowngradedByAge).toBe(false);
  });

  it('is pure: the same rule and instant give the same answer', () => {
    const rule = { lastVerifiedAt: daysAgo(45), verificationStatus: 'verified' as const };

    expect(ruleFreshness(rule, AS_OF)).toEqual(ruleFreshness(rule, AS_OF));
  });
});

describe('compareReviewPriority', () => {
  const entry = (id: string, days: number | null, status: 'verified' | 'unverified') => ({
    id,
    freshness: ruleFreshness(
      { lastVerifiedAt: days === null ? null : daysAgo(days), verificationStatus: status },
      AS_OF,
    ),
  });

  it('puts a never-verified rule above a stale one', () => {
    // The app quoting a rate nobody ever checked is worse than quoting one that was
    // checked and has aged.
    const never = entry('never', null, 'unverified');
    const stale = entry('stale', 200, 'verified');

    expect(compareReviewPriority(never, stale)).toBeLessThan(0);
  });

  it('puts a stale rule above one merely due for review', () => {
    expect(
      compareReviewPriority(entry('a', 200, 'verified'), entry('b', 85, 'verified')),
    ).toBeLessThan(0);
  });

  it('puts a due-for-review rule above a fresh one', () => {
    expect(
      compareReviewPriority(entry('a', 85, 'verified'), entry('b', 5, 'verified')),
    ).toBeLessThan(0);
  });

  it('within a band, puts the oldest verification first', () => {
    expect(
      compareReviewPriority(entry('a', 300, 'verified'), entry('b', 200, 'verified')),
    ).toBeLessThan(0);
  });

  it('breaks a tie on id, so the queue does not reshuffle between renders', () => {
    const left = entry('aaa', 10, 'verified');
    const right = entry('bbb', 10, 'verified');

    expect(compareReviewPriority(left, right)).toBeLessThan(0);
    expect(compareReviewPriority(right, left)).toBeGreaterThan(0);
  });

  it('is antisymmetric across bands', () => {
    const never = entry('never', null, 'unverified');
    const fresh = entry('fresh', 1, 'verified');

    expect(Math.sign(compareReviewPriority(never, fresh))).toBe(
      -Math.sign(compareReviewPriority(fresh, never)),
    );
  });
});

describe('freshnessTally', () => {
  it('counts each band', () => {
    const tally = freshnessTally([
      ruleFreshness({ lastVerifiedAt: daysAgo(1), verificationStatus: 'verified' }, AS_OF),
      ruleFreshness({ lastVerifiedAt: daysAgo(85), verificationStatus: 'verified' }, AS_OF),
      ruleFreshness({ lastVerifiedAt: daysAgo(200), verificationStatus: 'verified' }, AS_OF),
      ruleFreshness({ lastVerifiedAt: null, verificationStatus: 'unverified' }, AS_OF),
    ]);

    expect(tally).toEqual({ fresh: 1, due_soon: 1, stale: 1, never_verified: 1 });
  });

  it('returns zeroes for an empty catalog', () => {
    expect(freshnessTally([])).toEqual({
      fresh: 0,
      due_soon: 0,
      stale: 0,
      never_verified: 0,
    });
  });
});

describe('FRESHNESS_BAND_LABELS', () => {
  it('names every band in words a person would use', () => {
    // "Out of date" rather than "stale": the label is read by a human deciding what
    // to review next.
    expect(FRESHNESS_BAND_LABELS.stale).toBe('Out of date');
    expect(FRESHNESS_BAND_LABELS.never_verified).toBe('Never verified');
    expect(FRESHNESS_BAND_LABELS.due_soon).toBe('Due for review');
    expect(FRESHNESS_BAND_LABELS.fresh).toBe('Verified recently');
  });
});
