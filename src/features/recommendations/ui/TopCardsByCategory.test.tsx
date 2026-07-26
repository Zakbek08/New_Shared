/**
 * The dashboard's per-category list.
 *
 * The engine runs for real here — only the fetch is mocked — because the figures on
 * this card are the thing under test. A category no card covers must say so in
 * words rather than disappear, and the reference basis must be stated so a user
 * does not read a $100 comparison as a promise about their actual purchase.
 */
import { screen } from '@testing-library/react-native';

import {
  CATEGORY,
  card,
  categoryRule,
  flatCard,
  valuation,
} from '@/domain/rewards/__fixtures__/wallet';
import type { WalletSnapshot } from '@/features/recommendations/api/snapshot';
import { renderScreen } from '@/test-support/renderScreen';

import { TopCardsByCategory } from './TopCardsByCategory';

interface FakeQuery {
  readonly data?: WalletSnapshot;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error?: unknown;
}

// `mock`-prefixed so Jest allows the hoisted factory to close over it.
let mockSnapshot: FakeQuery = { isPending: true, isError: false };

jest.mock('@/features/recommendations/hooks', () => ({
  useWalletSnapshot: () => ({ ...mockSnapshot, refetch: jest.fn() }),
}));

const AS_OF = new Date('2026-07-26T14:30:00.000Z');

function loaded(snapshot: WalletSnapshot): FakeQuery {
  return { data: snapshot, isPending: false, isError: false };
}

describe('TopCardsByCategory', () => {
  it('shows a spinner while the wallet loads', () => {
    mockSnapshot = { isPending: true, isError: false };

    renderScreen(<TopCardsByCategory asOf={AS_OF} />);

    expect(screen.getByLabelText(/Working out your best card/)).toBeTruthy();
  });

  it('asks the user to add a card when the wallet is empty', () => {
    mockSnapshot = loaded({ cards: [], valuation: valuation() });

    renderScreen(<TopCardsByCategory asOf={AS_OF} />);

    expect(screen.getByTestId('top-cards-empty')).toBeTruthy();
  });

  it('names the best card and its return for a covered category', () => {
    // $100 × 6% = $6.00, a 6% return on the reference amount.
    mockSnapshot = loaded({
      cards: [
        card({
          userCardId: 'grocery',
          displayName: 'Northwind Grocery Card',
          rules: [categoryRule({ categoryId: CATEGORY.grocery, rate: 6 })],
        }),
      ],
      valuation: valuation(),
    });

    renderScreen(<TopCardsByCategory asOf={AS_OF} testID="top-cards" />);

    expect(screen.getByText('Grocery')).toBeTruthy();
    expect(screen.getByText('Northwind Grocery Card')).toBeTruthy();
    expect(screen.getByText('6%', { includeHiddenElements: true })).toBeTruthy();
  });

  it('says "No bonus card" instead of dropping an uncovered category', () => {
    mockSnapshot = loaded({
      cards: [
        card({
          userCardId: 'grocery',
          rules: [categoryRule({ categoryId: CATEGORY.grocery, rate: 6 })],
        }),
      ],
      valuation: valuation(),
    });

    renderScreen(<TopCardsByCategory asOf={AS_OF} />);

    // Twelve of the thirteen categories are uncovered by a grocery-only card.
    expect(screen.getAllByText('No bonus card').length).toBeGreaterThan(0);
    expect(screen.getByText('Transit')).toBeTruthy();
  });

  it('states the reference amount, so the figures are not read as a promise', () => {
    mockSnapshot = loaded({ cards: [flatCard(1.5)], valuation: valuation() });

    renderScreen(<TopCardsByCategory asOf={AS_OF} />);

    expect(screen.getByText(/\$100\.00 reference purchase, in store/)).toBeTruthy();
    expect(screen.getByText(/A real purchase can rank differently/)).toBeTruthy();
  });

  it('counts how many categories are covered', () => {
    mockSnapshot = loaded({ cards: [flatCard(1.5)], valuation: valuation() });

    // A flat card earns everywhere, so all twelve bonus categories are covered.
    renderScreen(<TopCardsByCategory asOf={AS_OF} />);

    expect(screen.getByText('12 of 12 covered')).toBeTruthy();
  });

  it('reads each row as one sentence to a screen reader', () => {
    mockSnapshot = loaded({
      cards: [
        card({
          userCardId: 'grocery',
          displayName: 'Northwind Grocery Card',
          rules: [categoryRule({ categoryId: CATEGORY.grocery, rate: 6 })],
        }),
      ],
      valuation: valuation(),
    });

    renderScreen(<TopCardsByCategory asOf={AS_OF} />);

    expect(
      screen.getByLabelText(
        'Grocery. Best card Northwind Grocery Card. About 6% back. Worth $6.00 on a $100.00 purchase.',
      ),
    ).toBeTruthy();
  });

  it('surfaces a load failure rather than an empty list', () => {
    mockSnapshot = { isPending: false, isError: true, error: new Error('network down') };

    renderScreen(<TopCardsByCategory asOf={AS_OF} />);

    expect(screen.getByTestId('top-cards-error')).toBeTruthy();
  });
});
