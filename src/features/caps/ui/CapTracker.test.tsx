/**
 * The cap tracker and its dashboard alert.
 *
 * Two things are asserted beyond "it renders": the bar's colour is always
 * accompanied by a text label, and every figure is spoken as part of one accessible
 * row. An amber bar tells a colour-blind user nothing, and a progress bar with no
 * accessible value tells a screen-reader user nothing at all.
 */
import { screen } from '@testing-library/react-native';

import { capProgressForWallet, type CapProgressEntry } from '@/domain/rewards';
import {
  AS_OF,
  CATEGORY,
  capUsage,
  card,
  categoryRule,
} from '@/domain/rewards/__fixtures__/wallet';
import type { WalletAlerts } from '@/features/caps/hooks';
import { renderScreen } from '@/test-support/renderScreen';

import { CapAlertsSection, CapProgressRow, CapTracker } from './CapTracker';

interface FakeAlerts {
  readonly alerts: WalletAlerts;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error?: unknown;
  readonly hasCards: boolean;
}

const EMPTY: WalletAlerts = {
  capProgress: [],
  capAlerts: [],
  rotatingCategories: [],
  pendingActivations: [],
  expiringOffers: [],
};

// `mock`-prefixed so Jest permits the hoisted factory to close over it.
let mockAlerts: FakeAlerts = {
  alerts: EMPTY,
  isPending: true,
  isError: false,
  hasCards: false,
};

jest.mock('@/features/caps/hooks', () => ({
  useWalletAlerts: () => ({ ...mockAlerts, refetch: jest.fn() }),
  useSetRuleEnrollment: () => ({ mutate: jest.fn(), isPending: false }),
}));

/** Real entries from the real derivation: a $6,000 cap with `spent` consumed. */
function entriesFor(spent: number, overrides: Parameters<typeof card>[0] = {}) {
  return capProgressForWallet(
    [
      card({
        userCardId: 'capped',
        displayName: 'Northwind Grocery Card',
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
      }),
    ],
    AS_OF,
  );
}

function loaded(entries: readonly CapProgressEntry[]): FakeAlerts {
  return {
    alerts: {
      ...EMPTY,
      capProgress: entries,
      capAlerts: entries.filter((entry) => entry.status !== 'ample'),
    },
    isPending: false,
    isError: false,
    hasCards: true,
  };
}

describe('CapProgressRow', () => {
  it('states the remaining figure, the card and the reset in words', () => {
    // $6,000 cap less $1,500 spent leaves $4,500, 25% used, resetting in 159 days.
    const [entry] = entriesFor(1500);

    renderScreen(<CapProgressRow entry={entry!} />);

    expect(screen.getByText('$4,500.00 of $6,000 left')).toBeTruthy();
    expect(screen.getByText(/Northwind Grocery Card/)).toBeTruthy();
    expect(screen.getByText(/Resets in 159 days/)).toBeTruthy();
  });

  it('gives the bar an accessible percentage as well as a bar', () => {
    const [entry] = entriesFor(1500);

    renderScreen(<CapProgressRow entry={entry!} />);

    const bar = screen.getByRole('progressbar');
    expect(bar.props.accessibilityValue).toMatchObject({ now: 25, text: '25%' });
  });

  it('reads the whole row as one sentence', () => {
    const [entry] = entriesFor(1500);

    renderScreen(<CapProgressRow entry={entry!} />);

    expect(
      screen.getByLabelText(
        /6% on that category\. \$4,500\.00 of \$6,000 left\. Northwind Grocery Card/,
      ),
    ).toBeTruthy();
  });

  it('labels an ample cap in text, not only in green', () => {
    renderScreen(<CapProgressRow entry={entriesFor(100)[0]!} />);

    expect(screen.getByText('Room left')).toBeTruthy();
  });

  it('labels a nearly-used cap in text, not only in amber', () => {
    // $4,800 of $6,000 is exactly the 80% warning threshold.
    renderScreen(<CapProgressRow entry={entriesFor(4800)[0]!} />);

    expect(screen.getByText('Nearly used up')).toBeTruthy();
  });

  it('labels an exhausted cap in text, not only in red', () => {
    renderScreen(<CapProgressRow entry={entriesFor(6000)[0]!} />);

    expect(screen.getByText('Fully used')).toBeTruthy();
    expect(screen.getByText('$0.00 of $6,000 left')).toBeTruthy();
  });

  it('says when a tracked bonus is not activated', () => {
    // Progress on a bonus the user has not activated is real, but the row must not
    // imply the bonus is currently earning.
    const [entry] = capProgressForWallet(
      [
        card({
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
        }),
      ],
      AS_OF,
    );

    renderScreen(<CapProgressRow entry={entry!} />);

    expect(screen.getByText('Not activated')).toBeTruthy();
  });

  it('names the cap period', () => {
    renderScreen(<CapProgressRow entry={entriesFor(0)[0]!} />);

    expect(screen.getByText('per calendar year')).toBeTruthy();
  });
});

describe('CapTracker', () => {
  it('shows a spinner while the wallet loads', () => {
    mockAlerts = { alerts: EMPTY, isPending: true, isError: false, hasCards: false };

    renderScreen(<CapTracker asOf={AS_OF} />);

    expect(screen.getByLabelText(/Working out your cap progress/)).toBeTruthy();
  });

  it('asks for a card when the wallet is empty', () => {
    mockAlerts = { alerts: EMPTY, isPending: false, isError: false, hasCards: false };

    renderScreen(<CapTracker asOf={AS_OF} />);

    expect(screen.getByTestId('cap-tracker-empty')).toBeTruthy();
  });

  it('says so when the wallet has cards but no capped bonus', () => {
    mockAlerts = { alerts: EMPTY, isPending: false, isError: false, hasCards: true };

    renderScreen(<CapTracker asOf={AS_OF} />);

    expect(screen.getByTestId('cap-tracker-none')).toBeTruthy();
  });

  it('lists a capped bonus with the estimate disclaimer', () => {
    mockAlerts = loaded(entriesFor(1500));

    renderScreen(<CapTracker asOf={AS_OF} testID="tracker" />);

    expect(screen.getByText('$4,500.00 of $6,000 left')).toBeTruthy();
    // The figure rests on a statement cycle we cannot see and on purchases the user
    // may not have told us about. Saying so is not optional.
    expect(screen.getByText(/statement cycle we cannot see/)).toBeTruthy();
  });

  it('scopes to one card when given a card id', () => {
    const mine = entriesFor(1500);
    const other = entriesFor(600, { userCardId: 'other-card' }).map((entry) => ({
      ...entry,
      userCardId: 'other-card',
    }));
    mockAlerts = loaded([...mine, ...other]);

    renderScreen(<CapTracker asOf={AS_OF} userCardId="capped" />);

    expect(screen.getByText('$4,500.00 of $6,000 left')).toBeTruthy();
    expect(screen.queryByText('$5,400.00 of $6,000 left')).toBeNull();
  });

  it('surfaces a load failure rather than an empty list', () => {
    mockAlerts = {
      alerts: EMPTY,
      isPending: false,
      isError: true,
      error: new Error('network down'),
      hasCards: true,
    };

    renderScreen(<CapTracker asOf={AS_OF} />);

    expect(screen.getByTestId('cap-tracker-error')).toBeTruthy();
  });
});

describe('CapAlertsSection', () => {
  it('renders nothing when every cap has room', () => {
    // A dashboard that announces "no alerts" buries the one section that matters on
    // the day it appears.
    mockAlerts = loaded(entriesFor(100));

    renderScreen(<CapAlertsSection asOf={AS_OF} testID="alerts" />);

    expect(screen.queryByTestId('alerts')).toBeNull();
    expect(screen.queryByText('Spending-cap alerts')).toBeNull();
  });

  it('renders nothing while loading', () => {
    mockAlerts = { alerts: EMPTY, isPending: true, isError: false, hasCards: true };

    renderScreen(<CapAlertsSection asOf={AS_OF} testID="alerts" />);

    expect(screen.queryByTestId('alerts')).toBeNull();
  });

  it('warns about a nearly-used cap, in the singular', () => {
    mockAlerts = loaded(entriesFor(5000));

    renderScreen(<CapAlertsSection asOf={AS_OF} testID="alerts" />);

    expect(screen.getByText('Spending-cap alerts')).toBeTruthy();
    expect(screen.getByText('One bonus is close to its limit.')).toBeTruthy();
  });

  it('counts several alerts in the plural', () => {
    const first = entriesFor(5000);
    const second = entriesFor(6000, { userCardId: 'second' }).map((entry) => ({
      ...entry,
      userCardId: 'second',
      ruleId: 'second-rule',
    }));
    mockAlerts = loaded([...first, ...second]);

    renderScreen(<CapAlertsSection asOf={AS_OF} testID="alerts" />);

    expect(screen.getByText('2 bonuses are close to their limits.')).toBeTruthy();
  });
});
