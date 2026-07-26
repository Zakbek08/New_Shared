/**
 * Cap progress and cap alerts.
 *
 * The thresholds matter more than they look: an alert that fires too early is
 * noise, and one that fires too late is a bonus the user has already lost. Every
 * boundary below is asserted exactly — 79%, 80%, 99.9%, 100% — because "about 80%"
 * is not a specification.
 */
import {
  capAlerts,
  capProgressForWallet,
  CAP_ESTIMATE_DISCLAIMER,
  CAP_WARNING_UTILISATION,
} from './capProgress';
import { AS_OF, CATEGORY, capUsage, card, categoryRule, rule } from './__fixtures__/wallet';

/** A $6,000-per-year grocery bonus with `spent` already consumed. */
function cappedCard(spent: number, overrides: Parameters<typeof card>[0] = {}) {
  return card({
    userCardId: 'capped',
    displayName: 'Capped Card',
    rules: [
      categoryRule({
        id: 'grocery-bonus',
        categoryId: CATEGORY.grocery,
        rate: 6,
        capAmount: 6000,
        capPeriod: 'calendar_year',
      }),
    ],
    capUsage: { 'grocery-bonus': capUsage({ qualifyingSpendUsd: spent }) },
    ...overrides,
  });
}

describe('capProgressForWallet', () => {
  it('reports the arithmetic of a partly used cap', () => {
    // $6,000 cap less $1,500 spent leaves $4,500, which is 25% consumed.
    const [entry] = capProgressForWallet([cappedCard(1500)], AS_OF);

    expect(entry).toMatchObject({
      userCardId: 'capped',
      cardName: 'Capped Card',
      ruleId: 'grocery-bonus',
      capAmountUsd: 6000,
      consumedUsd: 1500,
      remainingUsd: 4500,
      utilisation: 0.25,
      appliesTo: 'spend',
      capPeriod: 'calendar_year',
      status: 'ample',
    });
  });

  it('says how many days until the cap resets', () => {
    // AS_OF is 2026-07-26T14:30Z; the calendar-year window ends 2027-01-01T00:00Z.
    // That is 158 days and 9.5 hours, rounded up to 159.
    const [entry] = capProgressForWallet([cappedCard(0)], AS_OF);

    expect(entry?.daysUntilReset).toBe(159);
  });

  it('reports no reset date for a lifetime cap', () => {
    const lifetime = card({
      rules: [
        categoryRule({
          id: 'intro',
          categoryId: CATEGORY.grocery,
          rate: 5,
          capAmount: 1000,
          capPeriod: 'lifetime',
        }),
      ],
    });

    expect(capProgressForWallet([lifetime], AS_OF)[0]?.daysUntilReset).toBeNull();
  });

  it('omits uncapped rules, which have no progress to show', () => {
    const flat = card({ rules: [rule({ id: 'base', capAmount: null })] });

    expect(capProgressForWallet([flat], AS_OF)).toEqual([]);
  });

  it('omits an expired rule’s cap, which is history rather than a live figure', () => {
    const lastQuarter = card({
      rules: [
        categoryRule({
          id: 'q2',
          categoryId: CATEGORY.grocery,
          rate: 5,
          capAmount: 1500,
          capPeriod: 'quarterly',
        }),
      ],
    });
    const expired = {
      ...lastQuarter,
      rules: lastQuarter.rules.map((existing) => ({
        ...existing,
        startsAt: new Date('2026-04-01T00:00:00.000Z'),
        endsAt: new Date('2026-07-01T00:00:00.000Z'),
      })),
    };

    expect(capProgressForWallet([expired], AS_OF)).toEqual([]);
  });

  it('omits an inactive rule', () => {
    const retired = card({
      rules: [
        {
          ...categoryRule({
            id: 'retired',
            categoryId: CATEGORY.grocery,
            rate: 6,
            capAmount: 6000,
          }),
          isActive: false,
        },
      ],
    });

    expect(capProgressForWallet([retired], AS_OF)).toEqual([]);
  });

  it('ignores a usage row from a previous window, so the cap reads as reset', () => {
    // The row belongs to 2025. A cap that did not reset would be a defect the user
    // pays for, so this is the single most important case in the file.
    const staleUsage = cappedCard(0, {
      capUsage: {
        'grocery-bonus': capUsage({
          periodStart: new Date('2025-01-01T00:00:00.000Z'),
          periodEnd: new Date('2026-01-01T00:00:00.000Z'),
          qualifyingSpendUsd: 6000,
        }),
      },
    });

    const [entry] = capProgressForWallet([staleUsage], AS_OF);

    expect(entry?.consumedUsd).toBe(0);
    expect(entry?.remainingUsd).toBe(6000);
    expect(entry?.status).toBe('ample');
  });

  it('flags a bonus that needs activating and has not been activated', () => {
    const rotator = card({
      rules: [
        {
          ...categoryRule({
            id: 'q3',
            categoryId: CATEGORY.grocery,
            rate: 5,
            capAmount: 1500,
            capPeriod: 'quarterly',
          }),
          requiresEnrollment: true,
        },
      ],
    });

    expect(capProgressForWallet([rotator], AS_OF)[0]?.requiresActivation).toBe(true);
    expect(
      capProgressForWallet([{ ...rotator, enrollments: { q3: true } }], AS_OF)[0]
        ?.requiresActivation,
    ).toBe(false);
  });

  it('still tracks a card the user excluded from recommendations', () => {
    // The cap is a fact about their account either way; hiding it would make the
    // dashboard disagree with their statement.
    const excluded = cappedCard(1000, { isExcludedFromRecommendations: true });

    expect(capProgressForWallet([excluded], AS_OF)).toHaveLength(1);
  });

  it('orders the most-consumed cap first', () => {
    const light = cappedCard(600, { userCardId: 'light' });
    const heavy = {
      ...cappedCard(5400, { userCardId: 'heavy' }),
      userCardId: 'heavy',
    };

    const entries = capProgressForWallet([light, heavy], AS_OF);

    expect(entries.map((entry) => entry.userCardId)).toEqual(['heavy', 'light']);
  });

  it('breaks a tie on rule id, so the list cannot reshuffle between renders', () => {
    const twoRules = card({
      rules: [
        categoryRule({
          id: 'bbb',
          categoryId: CATEGORY.grocery,
          rate: 5,
          capAmount: 1000,
          capPeriod: 'calendar_year',
        }),
        categoryRule({
          id: 'aaa',
          categoryId: CATEGORY.dining,
          rate: 4,
          capAmount: 1000,
          capPeriod: 'calendar_year',
        }),
      ],
    });

    expect(capProgressForWallet([twoRules], AS_OF).map((entry) => entry.ruleId)).toEqual([
      'aaa',
      'bbb',
    ]);
  });

  it('tracks a reward cap in reward dollars, not spend', () => {
    const rewardCapped = card({
      rules: [
        {
          ...categoryRule({
            id: 'reward-capped',
            categoryId: CATEGORY.grocery,
            rate: 6,
            capAmount: 300,
            capPeriod: 'calendar_year',
          }),
          capAppliesTo: 'reward' as const,
        },
      ],
      capUsage: {
        'reward-capped': capUsage({ qualifyingSpendUsd: 4000, accruedRewardUsd: 240 }),
      },
    });

    const [entry] = capProgressForWallet([rewardCapped], AS_OF);

    expect(entry?.appliesTo).toBe('reward');
    // $240 of a $300 reward cap: 80% used, not the $4,000 of spend.
    expect(entry?.consumedUsd).toBe(240);
    expect(entry?.remainingUsd).toBe(60);
  });

  it('rounds utilisation to four places so a progress bar cannot jitter', () => {
    // 1000/6000 = 0.16666…
    expect(capProgressForWallet([cappedCard(1000)], AS_OF)[0]?.utilisation).toBe(0.1667);
  });
});

describe('cap status thresholds', () => {
  const statusAt = (spent: number) =>
    capProgressForWallet([cappedCard(spent)], AS_OF)[0]?.status;

  it('is ample just below the warning threshold', () => {
    // 79.98% of $6,000 is $4,799. The warning fires at 80%.
    expect(CAP_WARNING_UTILISATION).toBe(0.8);
    expect(statusAt(4799)).toBe('ample');
  });

  it('warns at exactly the threshold', () => {
    // $4,800 of $6,000 is exactly 80%.
    expect(statusAt(4800)).toBe('nearly_reached');
  });

  it('still warns rather than declaring exhaustion at 99.9%', () => {
    expect(statusAt(5994)).toBe('nearly_reached');
  });

  it('is exhausted when the cap is exactly reached', () => {
    expect(statusAt(6000)).toBe('exhausted');
  });

  it('is exhausted, not merely warned, when usage overshoots the cap', () => {
    // A user-adjusted figure can exceed the cap. Reporting "nearly reached" for a
    // cap that is 110% used would be actively misleading.
    expect(statusAt(6600)).toBe('exhausted');
  });

  it('is ample on an untouched cap', () => {
    expect(statusAt(0)).toBe('ample');
  });
});

describe('capAlerts', () => {
  it('keeps only the caps worth interrupting the user about', () => {
    const entries = capProgressForWallet(
      [
        cappedCard(0, { userCardId: 'ample' }),
        { ...cappedCard(4900), userCardId: 'nearly' },
        { ...cappedCard(6000), userCardId: 'done' },
      ],
      AS_OF,
    );

    const alerted = capAlerts(entries);

    expect(alerted.map((entry) => entry.status).sort()).toEqual([
      'exhausted',
      'nearly_reached',
    ]);
    expect(alerted.map((entry) => entry.userCardId)).not.toContain('ample');
  });

  it('returns nothing when every cap has room', () => {
    expect(capAlerts(capProgressForWallet([cappedCard(10)], AS_OF))).toEqual([]);
  });
});

describe('CAP_ESTIMATE_DISCLAIMER', () => {
  it('names both reasons the figure is an estimate', () => {
    // The statement cycle we cannot see, and the purchases we were never told
    // about. Stating only one of them would overstate how much we know.
    expect(CAP_ESTIMATE_DISCLAIMER).toMatch(/statement cycle/i);
    expect(CAP_ESTIMATE_DISCLAIMER).toMatch(/told us about/i);
    expect(CAP_ESTIMATE_DISCLAIMER).toMatch(/estimate/i);
  });
});
