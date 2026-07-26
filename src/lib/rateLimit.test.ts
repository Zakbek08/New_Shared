/**
 * The rate limiter.
 *
 * Time is passed in, so every case below is an exact arithmetic statement rather
 * than a race against a real clock. The boundaries are what matter: the attempt
 * that exactly reaches the limit, the one that exceeds it, and the moment the
 * window has moved far enough to free a slot.
 */
import {
  describeRetryDelay,
  RateLimiter,
  RATE_LIMITS,
  type RateLimitedAction,
} from './rateLimit';

const T0 = 1_000_000;

describe('within the limit', () => {
  it('allows the first attempt', () => {
    const limiter = new RateLimiter();
    expect(limiter.attempt('data_export', T0).isAllowed).toBe(true);
  });

  // data_export allows 3 per 60s, so attempts 1, 2 and 3 all pass.
  it('allows attempts up to and including the limit', () => {
    const limiter = new RateLimiter();

    expect(limiter.attempt('data_export', T0).isAllowed).toBe(true);
    expect(limiter.attempt('data_export', T0 + 1).isAllowed).toBe(true);
    expect(limiter.attempt('data_export', T0 + 2).isAllowed).toBe(true);
  });

  it('counts down the remaining allowance', () => {
    const limiter = new RateLimiter();

    expect(limiter.attempt('data_export', T0).remaining).toBe(2);
    expect(limiter.attempt('data_export', T0 + 1).remaining).toBe(1);
    expect(limiter.attempt('data_export', T0 + 2).remaining).toBe(0);
  });

  it('reports no delay while attempts are allowed', () => {
    const limiter = new RateLimiter();
    expect(limiter.attempt('data_export', T0).retryAfterMs).toBe(0);
  });
});

describe('at the limit', () => {
  it('refuses the attempt after the limit is reached', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 3; i += 1) limiter.attempt('data_export', T0 + i);

    expect(limiter.attempt('data_export', T0 + 3).isAllowed).toBe(false);
  });

  // First attempt at T0, window 60_000ms, refused at T0 + 3 → the oldest expires
  // at T0 + 60_000, so 59_997ms remain.
  it('says exactly how long until a slot frees', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 3; i += 1) limiter.attempt('data_export', T0 + i);

    expect(limiter.attempt('data_export', T0 + 3).retryAfterMs).toBe(59_997);
  });

  it('does not count a refused attempt against the window', () => {
    // Otherwise a caller hammering the button extends its own lockout for as long
    // as it keeps trying — a limiter that punishes a retry loop by never letting it
    // out is a hang, not a limit.
    const limiter = new RateLimiter();
    for (let i = 0; i < 3; i += 1) limiter.attempt('data_export', T0 + i);

    limiter.attempt('data_export', T0 + 10);
    limiter.attempt('data_export', T0 + 20);

    // Still measured from the original first attempt at T0.
    expect(limiter.attempt('data_export', T0 + 30).retryAfterMs).toBe(59_970);
  });
});

describe('the window sliding', () => {
  it('allows an attempt once the oldest has aged out', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 3; i += 1) limiter.attempt('data_export', T0 + i);

    // One millisecond past the first attempt's expiry.
    expect(limiter.attempt('data_export', T0 + 60_001).isAllowed).toBe(true);
  });

  it('refuses while the oldest attempt is still inside the window', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 3; i += 1) limiter.attempt('data_export', T0 + i);

    // The window is half-open: an attempt counts while `at > now - windowMs`. At
    // T0 + 59_999 the cutoff is T0 - 1, so the T0 attempt still counts and all
    // three slots are taken.
    expect(limiter.attempt('data_export', T0 + 59_999).isAllowed).toBe(false);
  });

  it('frees the oldest slot at exactly one window after it was taken', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 3; i += 1) limiter.attempt('data_export', T0 + i);

    // At T0 + 60_000 the cutoff is exactly T0, and `T0 > T0` is false — so the
    // first attempt drops out and a slot opens. The boundary is inclusive of
    // expiry, which is the behaviour `retryAfterMs` promises: it reports
    // `oldest + windowMs - now`, and waiting exactly that long must be enough.
    expect(limiter.attempt('data_export', T0 + 60_000).isAllowed).toBe(true);
  });

  it('frees slots one at a time rather than all at once', () => {
    // A fixed window would reopen the whole allowance at the boundary. The point of
    // a sliding window is that it does not.
    const limiter = new RateLimiter();
    limiter.attempt('data_export', T0);
    limiter.attempt('data_export', T0 + 10_000);
    limiter.attempt('data_export', T0 + 20_000);

    // First expired, second and third still in the window: exactly one slot.
    expect(limiter.attempt('data_export', T0 + 60_001).isAllowed).toBe(true);
    expect(limiter.attempt('data_export', T0 + 60_002).isAllowed).toBe(false);
  });

  it('allows the full allowance again once the whole window has passed', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 3; i += 1) limiter.attempt('data_export', T0 + i);

    const later = T0 + 120_000;
    expect(limiter.attempt('data_export', later).isAllowed).toBe(true);
    expect(limiter.attempt('data_export', later + 1).isAllowed).toBe(true);
    expect(limiter.attempt('data_export', later + 2).isAllowed).toBe(true);
    expect(limiter.attempt('data_export', later + 3).isAllowed).toBe(false);
  });
});

describe('actions are independent', () => {
  it('exhausting one action does not limit another', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 3; i += 1) limiter.attempt('data_export', T0 + i);

    expect(limiter.attempt('data_export', T0 + 3).isAllowed).toBe(false);
    expect(limiter.attempt('purchase_query', T0 + 3).isAllowed).toBe(true);
  });

  it('resets one action without disturbing the others', () => {
    const limiter = new RateLimiter();
    limiter.attempt('data_export', T0);
    limiter.attempt('purchase_query', T0);

    limiter.reset('data_export');

    expect(limiter.attempt('data_export', T0 + 1).remaining).toBe(2);
    // purchase_query allows 20; one has been used, so 18 remain after this one.
    expect(limiter.attempt('purchase_query', T0 + 1).remaining).toBe(18);
  });

  it('resets everything when no action is named', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 3; i += 1) limiter.attempt('data_export', T0 + i);

    limiter.reset();

    expect(limiter.attempt('data_export', T0 + 3).isAllowed).toBe(true);
  });
});

describe('account deletion', () => {
  it('allows exactly one attempt per window', () => {
    // An irreversible action with no useful second attempt.
    const limiter = new RateLimiter();

    expect(limiter.attempt('account_deletion', T0).isAllowed).toBe(true);
    expect(limiter.attempt('account_deletion', T0 + 1).isAllowed).toBe(false);
  });
});

describe('the configured limits', () => {
  const actions: RateLimitedAction[] = [
    'purchase_query',
    'data_export',
    'bulk_import',
    'account_deletion',
  ];

  it.each(actions)('%s has a positive limit and window', (action) => {
    // A limit of zero would refuse everything, including the first attempt — a
    // typo that would look like a broken feature rather than a broken limit.
    expect(RATE_LIMITS[action].limit).toBeGreaterThan(0);
    expect(RATE_LIMITS[action].windowMs).toBeGreaterThan(0);
  });

  it.each(actions)('%s allows at least one attempt immediately', (action) => {
    const limiter = new RateLimiter();
    expect(limiter.attempt(action, T0).isAllowed).toBe(true);
  });

  it('honours a caller-supplied rule set', () => {
    const limiter = new RateLimiter({
      ...RATE_LIMITS,
      data_export: { limit: 1, windowMs: 10_000 },
    });

    expect(limiter.attempt('data_export', T0).isAllowed).toBe(true);
    expect(limiter.attempt('data_export', T0 + 1).isAllowed).toBe(false);
  });
});

describe('describeRetryDelay', () => {
  it('rounds up, so it never promises a slot that is not free yet', () => {
    expect(describeRetryDelay(1_500)).toBe('Try again in 2 seconds.');
  });

  it('avoids "1 seconds" for a sub-second wait', () => {
    expect(describeRetryDelay(400)).toBe('Try again in a moment.');
    expect(describeRetryDelay(1_000)).toBe('Try again in a moment.');
  });

  it('switches to minutes past a minute', () => {
    expect(describeRetryDelay(59_000)).toBe('Try again in 59 seconds.');
    expect(describeRetryDelay(60_000)).toBe('Try again in 1 minute.');
    expect(describeRetryDelay(61_000)).toBe('Try again in 2 minutes.');
  });

  it('says something usable for zero', () => {
    expect(describeRetryDelay(0)).toBe('Try again in a moment.');
  });
});
