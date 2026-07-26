/**
 * Client-side rate limiting for the expensive actions.
 *
 * WHAT THIS IS FOR, STATED HONESTLY
 * This is not a security control. It runs on the device, and anyone holding the
 * anon key can ignore it by talking to the API directly. What stops them reading
 * another user's data is row-level security; see SECURITY.md.
 *
 * It exists for two narrower reasons, both real:
 *
 *   1. A retry loop — a stuck mutation, a jammed button, a screen that remounts on
 *      every keystroke — can fire hundreds of requests in seconds. The user sees a
 *      spinner; the project sees a bill and, for the classifier, a model quota.
 *   2. An accidental double-tap on an expensive action should be absorbed rather
 *      than paid for twice.
 *
 * A server-side limit belongs in an Edge Function and is not built. Saying so here
 * matters more than the code does: a limiter described as protection would be worse
 * than no limiter, because someone would rely on it.
 *
 * DESIGN
 * A sliding window per action, keyed by name, holding the timestamps of recent
 * attempts. Sliding rather than fixed: a fixed window lets a caller spend the whole
 * allowance at 11:59:59 and the whole next allowance one second later, which is the
 * burst this is meant to stop.
 *
 * Time is a parameter, never `Date.now()` inside the decision. The limiter can
 * therefore be tested exactly, and the same reasoning applies as in the rewards
 * engine: a function that reads the clock cannot be checked against a known answer.
 */

/** The actions worth limiting, and why each is on the list. */
export type RateLimitedAction =
  /** Runs the classifier and the engine. The most expensive path in the app. */
  | 'purchase_query'
  /** Reads every table the user owns and writes a file. Rare by nature. */
  | 'data_export'
  /** Validates and inserts many catalog rows at once. */
  | 'bulk_import'
  /** Irreversible; a second attempt is never useful. */
  | 'account_deletion';

export interface RateLimitRule {
  /** How many attempts are allowed inside the window. */
  readonly limit: number;
  /** Window length in milliseconds. */
  readonly windowMs: number;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/**
 * The limits.
 *
 * Chosen to be invisible to a person and obvious to a loop. A user submitting
 * purchases as fast as they can type reaches maybe five a minute; twenty is well
 * clear of that and still catches a runaway.
 */
export const RATE_LIMITS: Readonly<Record<RateLimitedAction, RateLimitRule>> = {
  purchase_query: { limit: 20, windowMs: MINUTE },
  // An export takes a dozen queries and produces a file the user then has to do
  // something with. Three a minute is generous.
  data_export: { limit: 3, windowMs: MINUTE },
  bulk_import: { limit: 5, windowMs: 5 * MINUTE },
  // One per window. A second attempt after a success is meaningless, and after a
  // failure the user should read the error before retrying.
  account_deletion: { limit: 1, windowMs: MINUTE },
};

export interface RateLimitDecision {
  readonly isAllowed: boolean;
  /**
   * Milliseconds until the next attempt would be allowed. `0` when allowed.
   *
   * Exposed so the UI can say "try again in 12 seconds" rather than "too many
   * requests", which tells the user nothing they can act on.
   */
  readonly retryAfterMs: number;
  /** Attempts left in the current window, after this decision. */
  readonly remaining: number;
}

/**
 * A limiter instance.
 *
 * A class rather than module-level state so tests get a fresh one and cannot leak
 * attempts into each other — and so a caller that wants an isolated limiter can
 * have one.
 */
export class RateLimiter {
  private readonly attempts = new Map<RateLimitedAction, number[]>();

  constructor(
    private readonly rules: Readonly<Record<RateLimitedAction, RateLimitRule>> = RATE_LIMITS,
  ) {}

  /**
   * Records an attempt if it is allowed, and reports the decision.
   *
   * Deliberately one operation and not a `check()` / `record()` pair: two calls
   * invite a caller to check, take a slow path, and record late, at which point
   * two concurrent attempts both pass.
   */
  attempt(action: RateLimitedAction, now: number): RateLimitDecision {
    const rule = this.rules[action];
    const windowStart = now - rule.windowMs;

    // Anything older than the window is not just ignored but dropped, so the map
    // cannot grow without bound in a long-lived session.
    const recent = (this.attempts.get(action) ?? []).filter((at) => at > windowStart);

    if (recent.length >= rule.limit) {
      // The oldest attempt in the window is the one whose expiry frees a slot.
      const oldest = recent[0] ?? now;
      this.attempts.set(action, recent);
      return {
        isAllowed: false,
        retryAfterMs: Math.max(0, oldest + rule.windowMs - now),
        remaining: 0,
      };
    }

    recent.push(now);
    this.attempts.set(action, recent);

    return {
      isAllowed: true,
      retryAfterMs: 0,
      remaining: rule.limit - recent.length,
    };
  }

  /** Forgets an action's history. For tests, and for sign-out. */
  reset(action?: RateLimitedAction): void {
    if (action === undefined) {
      this.attempts.clear();
      return;
    }
    this.attempts.delete(action);
  }
}

/**
 * The limiter the app uses.
 *
 * Module-level, because the limit is per device and per session. It is not
 * persisted: a restart clears it. That is a real gap and it is the right trade —
 * persisting would mean a write on every action to slow down an attacker who can
 * bypass the limiter anyway, while punishing a user whose app crashed.
 */
export const appRateLimiter = new RateLimiter();

/** Phrases a refusal in something the user can act on. */
export function describeRetryDelay(retryAfterMs: number): string {
  const seconds = Math.ceil(retryAfterMs / SECOND);
  if (seconds <= 1) return 'Try again in a moment.';
  if (seconds < 60) return `Try again in ${seconds} seconds.`;
  const minutes = Math.ceil(seconds / 60);
  return `Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}
