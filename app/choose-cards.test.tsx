/**
 * The card chooser.
 *
 * The assertion that matters here is placement. With 28 cards the list runs several
 * screens, and a Continue button only at the foot means scrolling past everything to
 * leave — which is the one thing someone wants to do the moment they have added a card.
 * So there is a Continue directly under the search box, and the test pins that it comes
 * before the results rather than after them.
 */
import { screen } from '@testing-library/react-native';

import { renderScreen } from '@/test-support/renderScreen';
import type { Wallet } from '@/features/local/storage';

// `mock`-prefixed so Jest permits the hoisted factory to close over it.
let mockWallet: Wallet = { cardIds: [], activated: {} };

jest.mock('@/features/local/LocalStore', () => ({
  useLocalStore: () => ({
    isReady: true,
    profile: { name: 'Ada Lovelace', email: 'ada@example.com' },
    wallet: mockWallet,
    saveProfile: jest.fn(),
    addCard: jest.fn(),
    removeCard: jest.fn(),
    setActivated: jest.fn(),
    startOver: jest.fn(),
  }),
}));

import ChooseCardsScreen from './choose-cards';

afterEach(() => {
  mockWallet = { cardIds: [], activated: {} };
});

describe('with an empty wallet', () => {
  it('offers one disabled Continue, saying what is needed', () => {
    renderScreen(<ChooseCardsScreen />);

    const top = screen.getByTestId('choose-cards-continue');

    expect(top.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(/Add at least one to continue/)).toBeTruthy();
    // No second button at the foot: an empty wallet gets one call to action, not two.
    expect(screen.queryByTestId('choose-cards-continue-bottom')).toBeNull();
  });
});

describe('with cards chosen', () => {
  beforeEach(() => {
    mockWallet = { cardIds: ['citi-double-cash', 'apple-card'], activated: {} };
  });

  it('enables Continue and counts the wallet', () => {
    renderScreen(<ChooseCardsScreen />);

    expect(screen.getByTestId('choose-cards-continue').props.accessibilityState.disabled).toBe(
      false,
    );
    expect(screen.getByText('2 cards in your wallet.')).toBeTruthy();
  });

  it('puts Continue above the card list, not only below it', () => {
    const { toJSON } = renderScreen(<ChooseCardsScreen />);
    const rendered = JSON.stringify(toJSON());

    const topButton = rendered.indexOf('choose-cards-continue"');
    const resultsList = rendered.indexOf('choose-cards-results');

    // Both present, and the button comes first in the tree — which is what spares the
    // user the scroll. Comparing positions in the rendered tree is crude but it is the
    // property being claimed, and it fails if the button moves back to the bottom.
    expect(topButton).toBeGreaterThan(-1);
    expect(resultsList).toBeGreaterThan(-1);
    expect(topButton).toBeLessThan(resultsList);
  });

  it('also offers a Continue at the foot, for anyone who scrolled', () => {
    renderScreen(<ChooseCardsScreen />);

    expect(screen.getByTestId('choose-cards-continue-bottom')).toBeTruthy();
  });

  it('lists what is already in the wallet, so a long catalog does not bury it', () => {
    renderScreen(<ChooseCardsScreen />);

    expect(screen.getByTestId('choose-cards-chosen')).toBeTruthy();
  });
});

describe('the catalog on screen', () => {
  it('shows every card with the date its rates were read', () => {
    renderScreen(<ChooseCardsScreen />);

    // The date is the reason the rate is trustworthy, so it is on the card rather than
    // in a footnote. One instance per card in the list.
    expect(screen.getAllByText(/read on .*Confirm with your bank/s).length).toBeGreaterThan(20);
  });

  it('names the issuer of each card', () => {
    renderScreen(<ChooseCardsScreen />);

    expect(screen.getAllByText('American Express').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TD Bank').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Apple (Goldman Sachs)').length).toBeGreaterThan(0);
  });
});
