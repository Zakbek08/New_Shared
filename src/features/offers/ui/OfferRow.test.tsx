/**
 * The offer row and the expiring-offer alert.
 *
 * The row shows only what the user entered. It must never show an "estimated value",
 * because what an offer is worth depends on the purchase and only the engine works
 * that out — printing a figure here would be a number nobody computed.
 */
import { fireEvent, screen } from '@testing-library/react-native';

import { AS_OF, card, offer } from '@/domain/rewards/__fixtures__/wallet';
import { expiringOffers } from '@/domain/rewards';
import type { WalletOffer } from '@/features/offers/api/offers';
import type { WalletAlerts } from '@/features/caps/hooks';
import { renderScreen } from '@/test-support/renderScreen';

import { ExpiringOffersSection } from './ExpiringOffers';
import { OfferRow, offerRewardLabel } from './OfferRow';

const EMPTY: WalletAlerts = {
  capProgress: [],
  capAlerts: [],
  rotatingCategories: [],
  pendingActivations: [],
  expiringOffers: [],
};

// `mock`-prefixed so Jest permits the hoisted factory to close over it.
let mockAlerts = { alerts: EMPTY, isPending: false, isError: false, hasCards: true };

jest.mock('@/features/caps/hooks', () => ({
  useWalletAlerts: () => ({ ...mockAlerts, refetch: jest.fn() }),
  useSetRuleEnrollment: () => ({ mutate: jest.fn(), isPending: false }),
}));

function walletOffer(overrides: Partial<WalletOffer> = {}): WalletOffer {
  return {
    id: 'offer-1',
    userCardId: 'card-1',
    cardName: 'Everyday card',
    merchantId: null,
    merchantLabel: 'Greenleaf Market',
    title: '$10 back on a $50 spend',
    description: null,
    rewardType: 'statement_credit',
    rewardUnit: 'usd',
    rate: 0,
    fixedAmountUsd: 10,
    minimumSpendUsd: 50,
    maxBenefitUsd: 10,
    status: 'available',
    channel: 'either',
    startsAt: null,
    endsAt: '2026-08-31T00:00:00.000Z',
    isEnrolled: false,
    isUserEntered: true,
    ...overrides,
  };
}

const noop = () => undefined;

describe('offerRewardLabel', () => {
  it('states a fixed amount as money', () => {
    expect(offerRewardLabel(walletOffer())).toBe('$10.00 back');
  });

  it('states a percentage offer as a percentage', () => {
    expect(
      offerRewardLabel(
        walletOffer({ rewardType: 'cash_back_percent', rate: 5, fixedAmountUsd: null }),
      ),
    ).toBe('5% back');
  });

  it('admits when neither figure was recorded rather than printing 0%', () => {
    // `userOfferSchema` rejects this, so such a row predates the validation or was
    // edited outside the app. "0% back" would look like a real offer worth nothing.
    expect(offerRewardLabel(walletOffer({ rate: 0, fixedAmountUsd: null }))).toBe(
      'Reward not recorded',
    );
  });
});

describe('OfferRow', () => {
  it('shows the offer, the merchant, the card and the terms', () => {
    renderScreen(
      <OfferRow
        offer={walletOffer()}
        onActivate={noop}
        onMarkUsed={noop}
        onDelete={noop}
        testID="row"
      />,
    );

    expect(screen.getByText('$10 back on a $50 spend')).toBeTruthy();
    expect(screen.getByText('$10.00 back')).toBeTruthy();
    expect(screen.getByText(/Greenleaf Market · Everyday card/)).toBeTruthy();
    expect(screen.getByText('$50.00 minimum')).toBeTruthy();
    expect(screen.getByText('Up to $10.00')).toBeTruthy();
    expect(screen.getByText(/Ends August 31, 2026/)).toBeTruthy();
  });

  it('never shows an estimated value for the offer', () => {
    // What an offer is worth depends on the purchase; the engine says so in a
    // recommendation. A figure here would be one nobody computed.
    renderScreen(
      <OfferRow offer={walletOffer()} onActivate={noop} onMarkUsed={noop} onDelete={noop} />,
    );

    expect(screen.queryByText(/estimated/i)).toBeNull();
  });

  it('says in words that an offer is not activated', () => {
    renderScreen(
      <OfferRow offer={walletOffer()} onActivate={noop} onMarkUsed={noop} onDelete={noop} />,
    );

    expect(screen.getByText('Not activated')).toBeTruthy();
  });

  it('offers the activate action only while it is unactivated', () => {
    const { unmount } = renderScreen(
      <OfferRow offer={walletOffer()} onActivate={noop} onMarkUsed={noop} onDelete={noop} />,
    );

    expect(screen.getByTestId('offer-activate-offer-1')).toBeTruthy();
    unmount();

    renderScreen(
      <OfferRow
        offer={walletOffer({ status: 'enrolled', isEnrolled: true })}
        onActivate={noop}
        onMarkUsed={noop}
        onDelete={noop}
      />,
    );

    expect(screen.queryByTestId('offer-activate-offer-1')).toBeNull();
    expect(screen.getByText('Activated')).toBeTruthy();
  });

  it('reports activation, redemption and removal to the caller', () => {
    const onActivate = jest.fn();
    const onMarkUsed = jest.fn();
    const onDelete = jest.fn();

    renderScreen(
      <OfferRow
        offer={walletOffer()}
        onActivate={onActivate}
        onMarkUsed={onMarkUsed}
        onDelete={onDelete}
      />,
    );

    fireEvent.press(screen.getByTestId('offer-activate-offer-1'));
    fireEvent.press(screen.getByTestId('offer-redeem-offer-1'));
    fireEvent.press(screen.getByTestId('offer-delete-offer-1'));

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onMarkUsed).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('hides the actions on an offer that is used or expired', () => {
    renderScreen(
      <OfferRow
        offer={walletOffer({ status: 'redeemed' })}
        onActivate={noop}
        onMarkUsed={noop}
        onDelete={noop}
      />,
    );

    expect(screen.getByText('Used')).toBeTruthy();
    expect(screen.queryByTestId('offer-redeem-offer-1')).toBeNull();
  });

  it('reads as one accessible sentence', () => {
    renderScreen(
      <OfferRow
        offer={walletOffer()}
        onActivate={noop}
        onMarkUsed={noop}
        onDelete={noop}
        testID="row"
      />,
    );

    const label = screen.getByTestId('row').props.accessibilityLabel as string;

    expect(label).toContain('$10 back on a $50 spend.');
    expect(label).toContain('$10.00 back.');
    expect(label).toContain('At Greenleaf Market.');
    expect(label).toContain('On your Everyday card.');
    expect(label).toContain('Not activated.');
    expect(label).toContain('Minimum spend $50.00.');
  });

  it('says the figures are the user’s own and cannot be checked', () => {
    renderScreen(
      <OfferRow offer={walletOffer()} onActivate={noop} onMarkUsed={noop} onDelete={noop} />,
    );

    expect(screen.getByText(/You entered this offer/)).toBeTruthy();
  });

  it('copes with an offer whose merchant was never named', () => {
    renderScreen(
      <OfferRow
        offer={walletOffer({ merchantLabel: null })}
        onActivate={noop}
        onMarkUsed={noop}
        onDelete={noop}
      />,
    );

    expect(screen.getByText(/Merchant not named/)).toBeTruthy();
  });
});

describe('ExpiringOffersSection', () => {
  /** Real derivation from a real offer, so the day count is not hand-written. */
  function alertsFor(endsAt: string) {
    const offers = expiringOffers(
      [
        card({
          userCardId: 'card-1',
          displayName: 'Everyday card',
          offers: [
            offer({
              id: 'expiring',
              title: '$10 back at Greenleaf',
              merchantLabel: 'Greenleaf Market',
              minimumSpendUsd: 50,
              endsAt: new Date(endsAt),
              isEnrolled: false,
            }),
          ],
        }),
      ],
      AS_OF,
    );

    return {
      alerts: { ...EMPTY, expiringOffers: offers },
      isPending: false,
      isError: false,
      hasCards: true,
    };
  }

  it('renders nothing when nothing is expiring', () => {
    mockAlerts = { alerts: EMPTY, isPending: false, isError: false, hasCards: true };

    renderScreen(<ExpiringOffersSection asOf={AS_OF} testID="expiring" />);

    expect(screen.queryByTestId('expiring')).toBeNull();
  });

  it('lists an offer ending soon, with the days remaining', () => {
    // AS_OF is 2026-07-26T14:30Z; 2026-08-01T00:00Z is 5 days 9.5 hours → 6.
    mockAlerts = alertsFor('2026-08-01T00:00:00.000Z');

    renderScreen(<ExpiringOffersSection asOf={AS_OF} testID="expiring" />);

    expect(screen.getByText('Offers about to expire')).toBeTruthy();
    expect(screen.getByText('$10 back at Greenleaf')).toBeTruthy();
    expect(screen.getByText('6 days left')).toBeTruthy();
  });

  it('says an offer is unactivated, which is the actionable part', () => {
    mockAlerts = alertsFor('2026-08-01T00:00:00.000Z');

    renderScreen(<ExpiringOffersSection asOf={AS_OF} testID="expiring" />);

    expect(screen.getByText('Not activated')).toBeTruthy();
  });

  it('reads each row as one accessible sentence', () => {
    mockAlerts = alertsFor('2026-08-01T00:00:00.000Z');

    renderScreen(<ExpiringOffersSection asOf={AS_OF} testID="expiring" />);

    const label = screen.getByTestId('expiring-offer-expiring').props
      .accessibilityLabel as string;

    expect(label).toContain('$10 back at Greenleaf.');
    expect(label).toContain('At Greenleaf Market.');
    expect(label).toContain('6 days left.');
    expect(label).toContain('Needs $50.00 of spend.');
    expect(label).toContain('Not activated yet.');
  });

  it('marks the last few days in red as well as in words', () => {
    // 2026-07-28 is 2 days out, inside the three-day threshold.
    mockAlerts = alertsFor('2026-07-28T00:00:00.000Z');

    renderScreen(<ExpiringOffersSection asOf={AS_OF} testID="expiring" />);

    expect(screen.getByText('2 days left')).toBeTruthy();
  });
});
