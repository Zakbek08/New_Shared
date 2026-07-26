import { daysRemainingInWindow, isWithinCapWindow, resolveCapWindow } from './capWindow';

/** Deterministic reference instants. No `Date.now()` anywhere in these tests. */
const JUL_26_2026 = new Date('2026-07-26T14:30:00.000Z');
const JAN_01_2026 = new Date('2026-01-01T00:00:00.000Z');
const DEC_31_2026 = new Date('2026-12-31T23:59:59.999Z');

const iso = (date: Date | null): string | null => date?.toISOString() ?? null;

describe('resolveCapWindow', () => {
  it('returns null for an uncapped rule', () => {
    expect(resolveCapWindow('none', { asOf: JUL_26_2026 })).toBeNull();
  });

  it('resolves a monthly window', () => {
    const window = resolveCapWindow('monthly', { asOf: JUL_26_2026 });
    expect(iso(window?.startsAt ?? null)).toBe('2026-07-01T00:00:00.000Z');
    expect(iso(window?.endsAt ?? null)).toBe('2026-08-01T00:00:00.000Z');
  });

  it('rolls a December monthly window into the next year', () => {
    const window = resolveCapWindow('monthly', { asOf: DEC_31_2026 });
    expect(iso(window?.startsAt ?? null)).toBe('2026-12-01T00:00:00.000Z');
    expect(iso(window?.endsAt ?? null)).toBe('2027-01-01T00:00:00.000Z');
  });

  it('resolves the quarter containing the instant', () => {
    const q3 = resolveCapWindow('quarterly', { asOf: JUL_26_2026 });
    expect(iso(q3?.startsAt ?? null)).toBe('2026-07-01T00:00:00.000Z');
    expect(iso(q3?.endsAt ?? null)).toBe('2026-10-01T00:00:00.000Z');

    const q1 = resolveCapWindow('quarterly', { asOf: JAN_01_2026 });
    expect(iso(q1?.startsAt ?? null)).toBe('2026-01-01T00:00:00.000Z');
    expect(iso(q1?.endsAt ?? null)).toBe('2026-04-01T00:00:00.000Z');
  });

  it('places each month in the right quarter, including the boundaries', () => {
    const starts = Array.from({ length: 12 }, (_, month) =>
      iso(
        resolveCapWindow('quarterly', {
          asOf: new Date(Date.UTC(2026, month, 15)),
        })?.startsAt ?? null,
      ),
    );

    expect(starts).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
      '2026-04-01T00:00:00.000Z',
      '2026-04-01T00:00:00.000Z',
      '2026-04-01T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
    ]);
  });

  it('resolves a semi-annual window', () => {
    const secondHalf = resolveCapWindow('semi_annual', { asOf: JUL_26_2026 });
    expect(iso(secondHalf?.startsAt ?? null)).toBe('2026-07-01T00:00:00.000Z');
    expect(iso(secondHalf?.endsAt ?? null)).toBe('2027-01-01T00:00:00.000Z');

    const firstHalf = resolveCapWindow('semi_annual', {
      asOf: new Date('2026-06-30T23:59:59.999Z'),
    });
    expect(iso(firstHalf?.startsAt ?? null)).toBe('2026-01-01T00:00:00.000Z');
    expect(iso(firstHalf?.endsAt ?? null)).toBe('2026-07-01T00:00:00.000Z');
  });

  it('resolves a calendar year', () => {
    const window = resolveCapWindow('calendar_year', { asOf: JUL_26_2026 });
    expect(iso(window?.startsAt ?? null)).toBe('2026-01-01T00:00:00.000Z');
    expect(iso(window?.endsAt ?? null)).toBe('2027-01-01T00:00:00.000Z');
  });

  it('returns an unbounded window for a lifetime cap', () => {
    expect(resolveCapWindow('lifetime', { asOf: JUL_26_2026 })).toEqual({
      startsAt: null,
      endsAt: null,
    });
  });

  describe('cardmember_year', () => {
    it('measures from the account anniversary, not from January', () => {
      const window = resolveCapWindow('cardmember_year', {
        asOf: JUL_26_2026,
        accountOpenedOn: new Date('2022-03-15T00:00:00.000Z'),
      });
      expect(iso(window?.startsAt ?? null)).toBe('2026-03-15T00:00:00.000Z');
      expect(iso(window?.endsAt ?? null)).toBe('2027-03-15T00:00:00.000Z');
    });

    it('steps back a year when the anniversary has not happened yet', () => {
      const window = resolveCapWindow('cardmember_year', {
        asOf: JUL_26_2026,
        accountOpenedOn: new Date('2022-11-02T00:00:00.000Z'),
      });
      expect(iso(window?.startsAt ?? null)).toBe('2025-11-02T00:00:00.000Z');
      expect(iso(window?.endsAt ?? null)).toBe('2026-11-02T00:00:00.000Z');
    });

    it('treats the anniversary itself as the first day of the new year', () => {
      const window = resolveCapWindow('cardmember_year', {
        asOf: new Date('2026-03-15T00:00:00.000Z'),
        accountOpenedOn: new Date('2022-03-15T00:00:00.000Z'),
      });
      expect(iso(window?.startsAt ?? null)).toBe('2026-03-15T00:00:00.000Z');
    });

    it('falls back to the calendar year when the open date is unknown', () => {
      const window = resolveCapWindow('cardmember_year', {
        asOf: JUL_26_2026,
        accountOpenedOn: null,
      });
      expect(iso(window?.startsAt ?? null)).toBe('2026-01-01T00:00:00.000Z');
      expect(iso(window?.endsAt ?? null)).toBe('2027-01-01T00:00:00.000Z');
    });

    it('produces a window containing asOf for every day of a year', () => {
      const accountOpenedOn = new Date('2020-09-08T00:00:00.000Z');
      for (let day = 0; day < 365; day += 1) {
        const asOf = new Date(Date.UTC(2026, 0, 1 + day, 12));
        const window = resolveCapWindow('cardmember_year', { asOf, accountOpenedOn });
        expect(window).not.toBeNull();
        expect(isWithinCapWindow(window!, asOf)).toBe(true);
      }
    });
  });

  describe('promotional_window', () => {
    it('uses the rule dates it is given', () => {
      const window = resolveCapWindow('promotional_window', {
        asOf: JUL_26_2026,
        promotionStartsAt: JAN_01_2026,
        promotionEndsAt: new Date('2027-01-01T00:00:00.000Z'),
      });
      expect(iso(window?.startsAt ?? null)).toBe('2026-01-01T00:00:00.000Z');
      expect(iso(window?.endsAt ?? null)).toBe('2027-01-01T00:00:00.000Z');
    });

    it('refuses to guess when the rule has no end date', () => {
      expect(
        resolveCapWindow('promotional_window', {
          asOf: JUL_26_2026,
          promotionStartsAt: JAN_01_2026,
        }),
      ).toBeNull();
    });
  });

  it('rejects an invalid asOf rather than silently returning a bad window', () => {
    expect(() => resolveCapWindow('monthly', { asOf: new Date('nonsense') })).toThrow(
      RangeError,
    );
  });
});

describe('isWithinCapWindow', () => {
  const window = resolveCapWindow('quarterly', { asOf: JUL_26_2026 })!;

  it('includes the start bound', () => {
    expect(isWithinCapWindow(window, new Date('2026-07-01T00:00:00.000Z'))).toBe(true);
  });

  it('excludes the end bound', () => {
    expect(isWithinCapWindow(window, new Date('2026-10-01T00:00:00.000Z'))).toBe(false);
    expect(isWithinCapWindow(window, new Date('2026-09-30T23:59:59.999Z'))).toBe(true);
  });

  it('excludes instants before the window', () => {
    expect(isWithinCapWindow(window, new Date('2026-06-30T23:59:59.999Z'))).toBe(false);
  });

  it('accepts anything inside an unbounded lifetime window', () => {
    const lifetime = resolveCapWindow('lifetime', { asOf: JUL_26_2026 })!;
    expect(isWithinCapWindow(lifetime, new Date('1970-01-01T00:00:00.000Z'))).toBe(true);
    expect(isWithinCapWindow(lifetime, new Date('2999-01-01T00:00:00.000Z'))).toBe(true);
  });
});

describe('daysRemainingInWindow', () => {
  it('counts whole days remaining, rounding up', () => {
    const window = resolveCapWindow('monthly', { asOf: JUL_26_2026 })!;
    // 26 July 14:30 to 1 August 00:00 is 5 days and 9.5 hours.
    expect(daysRemainingInWindow(window, JUL_26_2026)).toBe(6);
  });

  it('returns zero once the window has closed', () => {
    const window = resolveCapWindow('monthly', { asOf: JUL_26_2026 })!;
    expect(daysRemainingInWindow(window, new Date('2026-08-15T00:00:00.000Z'))).toBe(0);
  });

  it('returns null for a window that never ends', () => {
    const lifetime = resolveCapWindow('lifetime', { asOf: JUL_26_2026 })!;
    expect(daysRemainingInWindow(lifetime, JUL_26_2026)).toBeNull();
  });
});
