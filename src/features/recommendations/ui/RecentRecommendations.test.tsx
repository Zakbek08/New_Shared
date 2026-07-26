/**
 * The dashboard's "recently evaluated" list.
 *
 * These rows are historic summaries, so the important properties are that they are
 * labelled as such, that a row with no recommended card does not silently look like
 * a success, and that each row is a real 44pt touch target with a spoken label.
 */
import { fireEvent, screen } from '@testing-library/react-native';

import { CATEGORY } from '@/domain/rewards/__fixtures__/wallet';
import type { RecommendationSummary } from '@/features/recommendations/api/recommendations';
import { renderScreen } from '@/test-support/renderScreen';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

import { RecentRecommendations } from './RecentRecommendations';

interface FakeQuery {
  readonly data?: RecommendationSummary[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error?: unknown;
}

// `mock`-prefixed so Jest allows the hoisted factory to close over it.
let mockRecent: FakeQuery = { isPending: true, isError: false };

jest.mock('@/features/recommendations/hooks', () => ({
  useRecentRecommendations: () => ({ ...mockRecent, refetch: jest.fn() }),
}));

function summary(overrides: Partial<RecommendationSummary> = {}): RecommendationSummary {
  return {
    id: 'rec-1',
    merchantInput: 'Greenleaf Market',
    amountUsd: 120,
    categoryId: CATEGORY.grocery,
    hasCodingWarning: false,
    estimatedValueUsd: 7.2,
    recommendedCardName: 'Northwind Grocery Card',
    confidence: 'high',
    createdAt: '2026-07-26T14:30:00.000Z',
    ...overrides,
  };
}

describe('RecentRecommendations', () => {
  it('shows a spinner while the history loads', () => {
    mockRecent = { isPending: true, isError: false };

    renderScreen(<RecentRecommendations onSelectMerchant={jest.fn()} />);

    expect(screen.getByLabelText(/Loading your recent comparisons/)).toBeTruthy();
  });

  it('explains the empty state rather than showing a blank card', () => {
    mockRecent = { data: [], isPending: false, isError: false };

    renderScreen(<RecentRecommendations onSelectMerchant={jest.fn()} />);

    expect(screen.getByTestId('recent-empty')).toBeTruthy();
  });

  it('shows the merchant, the card and the recorded figure', () => {
    mockRecent = { data: [summary()], isPending: false, isError: false };

    renderScreen(<RecentRecommendations onSelectMerchant={jest.fn()} testID="recent" />);

    expect(screen.getByText('Greenleaf Market')).toBeTruthy();
    expect(screen.getByText('Northwind Grocery Card')).toBeTruthy();
    expect(screen.getByText('$120.00')).toBeTruthy();
    expect(screen.getByText('$7.20 back')).toBeTruthy();
  });

  it('says plainly when no card qualified, and shows no reward figure', () => {
    mockRecent = {
      data: [summary({ recommendedCardName: null, estimatedValueUsd: null })],
      isPending: false,
      isError: false,
    };

    renderScreen(<RecentRecommendations onSelectMerchant={jest.fn()} />);

    expect(screen.getByText('No card qualified')).toBeTruthy();
    expect(screen.queryByText(/back$/)).toBeNull();
  });

  it('flags a row whose merchant coding was uncertain', () => {
    mockRecent = {
      data: [summary({ hasCodingWarning: true })],
      isPending: false,
      isError: false,
    };

    renderScreen(<RecentRecommendations onSelectMerchant={jest.fn()} />);

    expect(screen.getByText('Coding uncertain')).toBeTruthy();
  });

  it('gives each row a spoken label and a 44pt target', () => {
    mockRecent = { data: [summary()], isPending: false, isError: false };

    renderScreen(<RecentRecommendations onSelectMerchant={jest.fn()} />);

    const row = screen.getByTestId('recent-rec-1');
    const label = row.props.accessibilityLabel as string;

    expect(label).toContain('Greenleaf Market, $120.00.');
    expect(label).toContain('You used Northwind Grocery Card.');
    expect(label).toContain('Estimated $7.20.');
    expect(label).toContain('Tap to compare again.');
    expect(row.props.accessibilityHint).toBe('Starts a new comparison at this merchant');
    expect(row.props.style.minHeight).toBe(MIN_TOUCH_TARGET);
  });

  it('starts a fresh comparison at the merchant when a row is tapped', () => {
    // Deliberately not a link to an old breakdown: the workings behind a stored
    // answer were never persisted, so re-running is the only honest option.
    const onSelectMerchant = jest.fn();
    mockRecent = { data: [summary()], isPending: false, isError: false };

    renderScreen(<RecentRecommendations onSelectMerchant={onSelectMerchant} />);
    fireEvent.press(screen.getByTestId('recent-rec-1'));

    expect(onSelectMerchant).toHaveBeenCalledWith('Greenleaf Market');
  });

  it('warns that stored figures may be out of date', () => {
    mockRecent = { data: [summary()], isPending: false, isError: false };

    renderScreen(<RecentRecommendations onSelectMerchant={jest.fn()} />);

    expect(screen.getByText(/compare again rather than relying on an old answer/)).toBeTruthy();
  });

  it('surfaces a load failure', () => {
    mockRecent = { isPending: false, isError: true, error: new Error('network down') };

    renderScreen(<RecentRecommendations onSelectMerchant={jest.fn()} />);

    expect(screen.getByTestId('recent-error')).toBeTruthy();
  });
});
