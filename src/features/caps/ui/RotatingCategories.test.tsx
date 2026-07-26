/**
 * Rotating categories and the activation reminder.
 *
 * The load-bearing assertion is about the copy: the button says "I have activated
 * this", not "Activate". WalletWise has no bank connection and cannot activate
 * anything, so a button implying otherwise would be a promise the app cannot keep —
 * and a user who believed it would lose the bonus.
 */
import { fireEvent, screen } from '@testing-library/react-native';

import { activeRotatingCategories, type RotatingCategoryPeriod } from '@/domain/rewards';
import { AS_OF, CATEGORY, card, categoryRule } from '@/domain/rewards/__fixtures__/wallet';
import type { WalletAlerts } from '@/features/caps/hooks';
import { renderScreen } from '@/test-support/renderScreen';

import {
  ActivationRemindersSection,
  RotatingCategoriesSection,
  RotatingCategoryRow,
} from './RotatingCategories';

const EMPTY: WalletAlerts = {
  capProgress: [],
  capAlerts: [],
  rotatingCategories: [],
  pendingActivations: [],
  expiringOffers: [],
};

// `mock`-prefixed so Jest permits the hoisted factory to close over it.
let mockAlerts = { alerts: EMPTY, isPending: false, isError: false, hasCards: true };
const mockEnroll = jest.fn();

jest.mock('@/features/caps/hooks', () => ({
  useWalletAlerts: () => ({ ...mockAlerts, refetch: jest.fn() }),
  useSetRuleEnrollment: () => ({ mutate: mockEnroll, isPending: false }),
}));

/** Q3 2026 — the quarter containing AS_OF — as the real derivation produces it. */
function periodsFor(options: { readonly isActivated?: boolean } = {}) {
  const base = categoryRule({
    id: 'q3',
    categoryId: CATEGORY.grocery,
    rate: 5,
    capAmount: 1500,
    capPeriod: 'quarterly',
  });

  return activeRotatingCategories(
    [
      card({
        userCardId: 'rotator',
        displayName: 'Harborline Rotator Card',
        rules: [
          {
            ...base,
            kind: 'rotating_category' as const,
            label: 'Q3 2026: 5% cash back on grocery and gas',
            requiresEnrollment: true,
            startsAt: new Date('2026-07-01T00:00:00.000Z'),
            endsAt: new Date('2026-10-01T00:00:00.000Z'),
            conditions: base.conditions.map((condition) => ({
              ...condition,
              categoryIds: [CATEGORY.grocery, CATEGORY.gas],
            })),
          },
        ],
        enrollments: options.isActivated === true ? { q3: true } : {},
      }),
    ],
    AS_OF,
  );
}

function loaded(periods: readonly RotatingCategoryPeriod[]) {
  return {
    alerts: {
      ...EMPTY,
      rotatingCategories: periods,
      pendingActivations: periods.filter(
        (period) => period.requiresActivation && !period.isActivated,
      ),
    },
    isPending: false,
    isError: false,
    hasCards: true,
  };
}

beforeEach(() => {
  mockEnroll.mockClear();
});

describe('RotatingCategoryRow', () => {
  it('names the categories in words, not as ids', () => {
    const [period] = periodsFor();

    renderScreen(
      <RotatingCategoryRow period={period!} onActivated={jest.fn()} isSaving={false} />,
    );

    expect(screen.getByText('Grocery and Gas')).toBeTruthy();
    expect(screen.getByText(/Harborline Rotator Card/)).toBeTruthy();
  });

  it('says how long the period has left', () => {
    // AS_OF is 2026-07-26T14:30Z; the quarter ends 2026-10-01T00:00Z → 67 days.
    const [period] = periodsFor();

    renderScreen(
      <RotatingCategoryRow period={period!} onActivated={jest.fn()} isSaving={false} />,
    );

    expect(screen.getByText('Ends in 67 days.')).toBeTruthy();
  });

  it('states the cap alongside the categories', () => {
    const [period] = periodsFor();

    renderScreen(
      <RotatingCategoryRow period={period!} onActivated={jest.fn()} isSaving={false} />,
    );

    expect(screen.getByText('$1,500 cap')).toBeTruthy();
  });

  it('asks the user to confirm activation rather than claiming to do it', () => {
    const [period] = periodsFor();

    renderScreen(
      <RotatingCategoryRow period={period!} onActivated={jest.fn()} isSaving={false} />,
    );

    // Wording matters: the app cannot activate anything with the issuer.
    expect(screen.getByText('I have activated this')).toBeTruthy();
    expect(screen.queryByText('Activate')).toBeNull();
    expect(
      screen.getByTestId('rotating-activate-q3').props.accessibilityHint as string,
    ).toMatch(/cannot activate it for you/i);
  });

  it('reports the confirmation to the caller', () => {
    const onActivated = jest.fn();
    const [period] = periodsFor();

    renderScreen(
      <RotatingCategoryRow period={period!} onActivated={onActivated} isSaving={false} />,
    );
    fireEvent.press(screen.getByTestId('rotating-activate-q3'));

    expect(onActivated).toHaveBeenCalledWith(period);
  });

  it('shows an activated period as activated, with no button', () => {
    const [period] = periodsFor({ isActivated: true });

    renderScreen(
      <RotatingCategoryRow period={period!} onActivated={jest.fn()} isSaving={false} />,
    );

    expect(screen.getByText('Activated')).toBeTruthy();
    expect(screen.queryByTestId('rotating-activate-q3')).toBeNull();
  });
});

describe('ActivationRemindersSection', () => {
  it('renders nothing when there is nothing to activate', () => {
    mockAlerts = loaded(periodsFor({ isActivated: true }));

    renderScreen(<ActivationRemindersSection asOf={AS_OF} testID="reminders" />);

    expect(screen.queryByTestId('reminders')).toBeNull();
  });

  it('explains what the user is losing, in the singular', () => {
    mockAlerts = loaded(periodsFor());

    renderScreen(<ActivationRemindersSection asOf={AS_OF} testID="reminders" />);

    expect(screen.getByText('Activate to earn')).toBeTruthy();
    expect(screen.getByText(/One bonus is running now but is not activated/)).toBeTruthy();
  });

  it('records the activation when the user confirms it', () => {
    mockAlerts = loaded(periodsFor());

    renderScreen(<ActivationRemindersSection asOf={AS_OF} testID="reminders" />);
    fireEvent.press(screen.getByTestId('rotating-activate-q3'));

    expect(mockEnroll).toHaveBeenCalledWith({
      userCardId: 'rotator',
      rewardRuleId: 'q3',
      status: 'enrolled',
    });
  });

  it('repeats that WalletWise never signs in to a bank', () => {
    mockAlerts = loaded(periodsFor());

    renderScreen(<ActivationRemindersSection asOf={AS_OF} testID="reminders" />);

    expect(screen.getByText(/never signs in to your bank/)).toBeTruthy();
  });
});

describe('RotatingCategoriesSection', () => {
  it('lists the running period whether or not it is activated', () => {
    mockAlerts = loaded(periodsFor({ isActivated: true }));

    renderScreen(<RotatingCategoriesSection asOf={AS_OF} testID="rotating" />);

    expect(screen.getByText('Rotating categories now')).toBeTruthy();
    expect(screen.getByText('Grocery and Gas')).toBeTruthy();
  });

  it('says so when no rotating bonus is running', () => {
    mockAlerts = { alerts: EMPTY, isPending: false, isError: false, hasCards: true };

    renderScreen(<RotatingCategoriesSection asOf={AS_OF} testID="rotating" />);

    expect(screen.getByTestId('rotating-empty')).toBeTruthy();
  });

  it('stays silent when the wallet is empty', () => {
    // "No rotating categories" is not a useful thing to say to someone with no cards.
    mockAlerts = { alerts: EMPTY, isPending: false, isError: false, hasCards: false };

    renderScreen(<RotatingCategoriesSection asOf={AS_OF} testID="rotating" />);

    expect(screen.queryByTestId('rotating-empty')).toBeNull();
    expect(screen.queryByTestId('rotating')).toBeNull();
  });

  it('scopes to one card when given a card id', () => {
    const mine = periodsFor();
    const other = mine.map((period) => ({
      ...period,
      userCardId: 'other-card',
      ruleId: 'other-rule',
    }));
    mockAlerts = loaded([...mine, ...other]);

    renderScreen(<RotatingCategoriesSection asOf={AS_OF} userCardId="rotator" />);

    expect(screen.getByTestId('rotating-q3')).toBeTruthy();
    expect(screen.queryByTestId('rotating-other-rule')).toBeNull();
  });
});
