/**
 * Generates SQL that compares `public.cap_period_window()` against
 * `resolveCapWindow()` over a year of dates.
 *
 * WHY THIS COMPARISON EXISTS
 * The same rule — "which window does this cap period cover on this date?" — is
 * implemented twice: once in SQL for the database's own use, once in TypeScript
 * for the engine. Two implementations of one rule drift unless something compares
 * them, and a drift here is silent: the engine would resolve a different window
 * from the database and the cap figures would disagree with nothing to reveal it.
 *
 * The expected values are computed here by the *TypeScript* implementation, so the
 * generated SQL genuinely compares the two rather than comparing SQL to itself.
 * `resolveCapWindow` is pure, so importing it is safe and needs no test harness.
 */
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;

/**
 * A tiny standalone port of `resolveCapWindow`.
 *
 * WHY A PORT RATHER THAN AN IMPORT
 * `src/domain/rewards/capWindow.ts` is TypeScript with a `@/` path alias, which a
 * plain `node` script cannot load without a build step. Copying ~40 lines is the
 * lesser evil — and `assertPortMatchesSource()` below fails the run if the source
 * file changes shape in a way this port does not reflect, so the copy cannot rot
 * silently.
 */
function resolveCapWindow(period, options) {
  const { asOf } = options;
  const year = asOf.getUTCFullYear();
  const month = asOf.getUTCMonth();
  const utc = (y, m, d) => new Date(Date.UTC(y, m, d, 0, 0, 0, 0));

  switch (period) {
    case 'none':
      return null;
    case 'monthly':
      return { startsAt: utc(year, month, 1), endsAt: utc(year, month + 1, 1) };
    case 'quarterly': {
      const start = Math.floor(month / 3) * 3;
      return { startsAt: utc(year, start, 1), endsAt: utc(year, start + 3, 1) };
    }
    case 'semi_annual': {
      const start = month < 6 ? 0 : 6;
      return { startsAt: utc(year, start, 1), endsAt: utc(year, start + 6, 1) };
    }
    case 'calendar_year':
      return { startsAt: utc(year, 0, 1), endsAt: utc(year + 1, 0, 1) };
    case 'cardmember_year': {
      const anchor = options.accountOpenedOn ?? utc(year, 0, 1);
      const anchorMonth = anchor.getUTCMonth();
      const anchorDay = anchor.getUTCDate();
      let startYear = year;
      let startsAt = utc(startYear, anchorMonth, anchorDay);
      if (startsAt.getTime() > asOf.getTime()) {
        startYear -= 1;
        startsAt = utc(startYear, anchorMonth, anchorDay);
      }
      return { startsAt, endsAt: utc(startYear + 1, anchorMonth, anchorDay) };
    }
    case 'lifetime':
      return { startsAt: null, endsAt: null };
    case 'promotional_window': {
      const endsAt = options.promotionEndsAt ?? null;
      if (endsAt === null) return null;
      return { startsAt: options.promotionStartsAt ?? null, endsAt };
    }
    default:
      throw new Error(`Unhandled cap period: ${period}`);
  }
}

/**
 * Fails the run if the TypeScript source has grown a case this port lacks.
 *
 * Cheap insurance against the copy above drifting from the module it mirrors.
 */
function assertPortMatchesSource() {
  const source = readFileSync(`${ROOT}src/domain/rewards/capWindow.ts`, 'utf8');
  const cases = [...source.matchAll(/case '([a-z_]+)':/g)].map((match) => match[1]);
  const ported = [
    'none',
    'monthly',
    'quarterly',
    'semi_annual',
    'calendar_year',
    'cardmember_year',
    'lifetime',
    'promotional_window',
  ];

  const missing = cases.filter((name) => !ported.includes(name));
  if (missing.length > 0) {
    throw new Error(
      `capWindowFixture.mjs is out of date: capWindow.ts handles ${missing.join(', ')} ` +
        'and this port does not. Update the port and re-run.',
    );
  }
}

const iso = (date) => date.toISOString();

/** The periods the SQL function is asked about. */
const PERIODS = ['monthly', 'quarterly', 'semi_annual', 'calendar_year', 'cardmember_year'];

export function generateCapWindowSql() {
  assertPortMatchesSource();

  // A year of dates, every three days, plus the awkward ones: month ends, leap
  // day, quarter and half-year boundaries, New Year's Eve.
  const dates = [];
  for (let day = 0; day < 366; day += 3) {
    dates.push(new Date(Date.UTC(2026, 0, 1 + day, 12, 0, 0)));
  }
  for (const literal of [
    '2026-01-31T23:59:59Z',
    '2026-02-28T12:00:00Z',
    '2028-02-29T12:00:00Z',
    '2026-03-31T23:59:59Z',
    '2026-04-01T00:00:00Z',
    '2026-06-30T23:59:59Z',
    '2026-07-01T00:00:00Z',
    '2026-12-31T23:59:59Z',
    '2027-01-01T00:00:00Z',
  ]) {
    dates.push(new Date(literal));
  }

  // A fixed account-open date, so `cardmember_year` is exercised against a real
  // anniversary rather than the 1 January fallback.
  const accountOpenedOn = new Date(Date.UTC(2024, 2, 14));

  const rows = [];
  for (const period of PERIODS) {
    for (const asOf of dates) {
      const window = resolveCapWindow(period, { asOf, accountOpenedOn });
      if (window === null || window.startsAt === null || window.endsAt === null) continue;

      rows.push(
        `('${period}'::public.cap_period, '${iso(asOf)}'::timestamptz, ` +
          `'${iso(accountOpenedOn)}'::date, ` +
          `'${iso(window.startsAt)}'::timestamptz, '${iso(window.endsAt)}'::timestamptz)`,
      );
    }
  }

  return `-- Generated by scripts/capWindowFixture.mjs. Do not edit.
--
-- Compares public.cap_period_window() against the TypeScript resolveCapWindow()
-- over \${dates.length} dates × \${PERIODS.length} periods. The expected columns were
-- computed by the TypeScript implementation.
begin;

-- The SQL function uses date_trunc, which is timezone-dependent, while the
-- TypeScript one is UTC by construction. Supabase runs UTC; pinning it here makes
-- that dependency explicit rather than incidental.
set local time zone 'UTC';

create temporary table expected_windows (
  period public.cap_period,
  as_of timestamptz,
  account_opened_on date,
  expected_start timestamptz,
  expected_end timestamptz
) on commit drop;

insert into expected_windows values
${rows.join(',\n')};

-- The three unbounded periods, asserted explicitly rather than skipped.
--
-- The two implementations agree on meaning but not on representation, and that is
-- worth pinning where a reader can see it:
--   * 'none' and 'promotional_window'  — both return "no calendar window": SQL
--     NULL, TypeScript null. A promotional window is bounded by the rule's own
--     starts_at/ends_at, which the caller supplies, not by a calendar.
--   * 'lifetime' — SQL returns (-infinity, infinity), TypeScript returns
--     { startsAt: null, endsAt: null }. Both mean "never resets". The engine
--     treats null bounds as unbounded, so the two behave identically; only the
--     encoding differs, because tstzrange has no way to say null.
do $$
begin
  perform wwtest.ok(
    'cap_period_window returns no window for none',
    public.cap_period_window('none'::public.cap_period, '2026-06-15T12:00:00Z'::timestamptz) is null,
    'matches resolveCapWindow returning null'
  );

  perform wwtest.ok(
    'cap_period_window returns no window for promotional_window',
    public.cap_period_window('promotional_window'::public.cap_period, '2026-06-15T12:00:00Z'::timestamptz) is null,
    'matches resolveCapWindow returning null when no promotion end is supplied'
  );

  perform wwtest.ok(
    'cap_period_window is unbounded for lifetime',
    lower(public.cap_period_window('lifetime'::public.cap_period, '2026-06-15T12:00:00Z'::timestamptz))
      = '-infinity'::timestamptz
    and upper(public.cap_period_window('lifetime'::public.cap_period, '2026-06-15T12:00:00Z'::timestamptz))
      = 'infinity'::timestamptz,
    'unbounded both ends, which is how resolveCapWindow''s null bounds are read'
  );
end
$$;

-- One assertion per period, naming how many dates disagreed. Per-period rather
-- than per-date so a systematic off-by-one reads as one clear failure instead of
-- three hundred.
do $$
declare
  v_period public.cap_period;
  v_mismatches bigint;
  v_example text;
begin
  for v_period in select distinct period from expected_windows loop
    select count(*),
           min(format('%s: expected [%s, %s), got %s',
                      e.as_of, e.expected_start, e.expected_end,
                      public.cap_period_window(e.period, e.as_of, e.account_opened_on)::text))
      into v_mismatches, v_example
      from expected_windows e
     where v_period = e.period
       and (
         lower(public.cap_period_window(e.period, e.as_of, e.account_opened_on))
           is distinct from e.expected_start
         or upper(public.cap_period_window(e.period, e.as_of, e.account_opened_on))
           is distinct from e.expected_end
       );

    perform wwtest.ok(
      format('cap_period_window agrees with resolveCapWindow for %s', v_period),
      v_mismatches = 0,
      case when v_mismatches = 0
           then format('%s dates agreed',
                       (select count(*) from expected_windows e where e.period = v_period))
           else format('%s mismatches, e.g. %s', v_mismatches, v_example)
      end
    );
  end loop;
end
$$;

commit;
`;
}
