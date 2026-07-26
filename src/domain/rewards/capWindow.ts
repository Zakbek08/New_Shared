/**
 * Resolves a `cap_period` into the concrete window it covers.
 *
 * Mirrors `public.cap_period_window()` in
 * `supabase/migrations/20260701000200_shared_functions.sql`. The two must agree;
 * the unit tests pin the behaviour on this side.
 *
 * ALL WINDOWS ARE UTC AND CALENDAR-BASED.
 * Real issuers measure caps against a statement cycle or an account
 * anniversary, and their cycle boundaries are not published. Using UTC calendar
 * boundaries makes WalletWise reproducible; it also makes cap figures an
 * estimate, which the UI must say out loud.
 */
import type { CapPeriod } from '@/types/database';

export interface CapWindow {
  /** `null` means unbounded in the past (a lifetime cap). */
  readonly startsAt: Date | null;
  /** `null` means unbounded in the future. Exclusive bound. */
  readonly endsAt: Date | null;
}

export interface ResolveCapWindowOptions {
  /** The instant to resolve the window around. */
  readonly asOf: Date;
  /**
   * Account open date, used only by `cardmember_year`. When absent we fall back
   * to 1 January of the `asOf` year, matching the SQL implementation.
   */
  readonly accountOpenedOn?: Date | null;
  /** Rule validity window, used only by `promotional_window`. */
  readonly promotionStartsAt?: Date | null;
  readonly promotionEndsAt?: Date | null;
}

/**
 * Returns the window a cap applies over, or `null` when the period is `none`
 * (an uncapped rule) or when a `promotional_window` cap has no rule dates to
 * anchor to.
 */
export function resolveCapWindow(
  period: CapPeriod,
  options: ResolveCapWindowOptions,
): CapWindow | null {
  const { asOf } = options;
  if (!isValidDate(asOf)) {
    throw new RangeError('resolveCapWindow requires a valid `asOf` date');
  }

  const year = asOf.getUTCFullYear();
  const month = asOf.getUTCMonth();

  switch (period) {
    case 'none':
      return null;

    case 'monthly':
      return {
        startsAt: utc(year, month, 1),
        endsAt: utc(year, month + 1, 1),
      };

    case 'quarterly': {
      const quarterStartMonth = Math.floor(month / 3) * 3;
      return {
        startsAt: utc(year, quarterStartMonth, 1),
        endsAt: utc(year, quarterStartMonth + 3, 1),
      };
    }

    case 'semi_annual': {
      const halfStartMonth = month < 6 ? 0 : 6;
      return {
        startsAt: utc(year, halfStartMonth, 1),
        endsAt: utc(year, halfStartMonth + 6, 1),
      };
    }

    case 'calendar_year':
      return { startsAt: utc(year, 0, 1), endsAt: utc(year + 1, 0, 1) };

    case 'cardmember_year':
      return resolveCardmemberYear(asOf, options.accountOpenedOn ?? null);

    case 'lifetime':
      return { startsAt: null, endsAt: null };

    case 'promotional_window': {
      const startsAt = options.promotionStartsAt ?? null;
      const endsAt = options.promotionEndsAt ?? null;
      // A promotional cap is meaningless without the rule's own dates. The
      // database enforces that such a rule has an `ends_at`; if a caller
      // reaches here without one, refusing to guess is the safe answer.
      if (endsAt === null) return null;
      return { startsAt, endsAt };
    }
  }
}

/**
 * The cardmember year containing `asOf`, measured from the account anniversary.
 *
 * A 29 February anchor rolls forward to 1 March in non-leap years, because
 * that is what `Date.UTC` does and what Postgres `interval '1 year'` does. The
 * one-day drift is immaterial next to the statement-cycle approximation we
 * already document above.
 */
function resolveCardmemberYear(asOf: Date, accountOpenedOn: Date | null): CapWindow {
  const anchor =
    accountOpenedOn !== null && isValidDate(accountOpenedOn)
      ? accountOpenedOn
      : utc(asOf.getUTCFullYear(), 0, 1);

  const anchorMonth = anchor.getUTCMonth();
  const anchorDay = anchor.getUTCDate();

  let startYear = asOf.getUTCFullYear();
  let startsAt = utc(startYear, anchorMonth, anchorDay);
  if (startsAt.getTime() > asOf.getTime()) {
    startYear -= 1;
    startsAt = utc(startYear, anchorMonth, anchorDay);
  }

  return { startsAt, endsAt: utc(startYear + 1, anchorMonth, anchorDay) };
}

/**
 * Whether `instant` falls inside `window`. The start bound is inclusive and the
 * end bound exclusive, matching the `[)` range in the SQL implementation.
 */
export function isWithinCapWindow(window: CapWindow, instant: Date): boolean {
  const time = instant.getTime();
  if (window.startsAt !== null && time < window.startsAt.getTime()) return false;
  if (window.endsAt !== null && time >= window.endsAt.getTime()) return false;
  return true;
}

/**
 * Days remaining in the window, rounded up, or `null` when it never ends.
 * Used by the spending-cap tracker to phrase "resets in 12 days".
 */
export function daysRemainingInWindow(window: CapWindow, asOf: Date): number | null {
  if (window.endsAt === null) return null;
  const millis = window.endsAt.getTime() - asOf.getTime();
  if (millis <= 0) return 0;
  return Math.ceil(millis / 86_400_000);
}

/** `Date.UTC` accepts out-of-range months and normalises them, which we rely on. */
function utc(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));
}

function isValidDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}
