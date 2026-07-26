/**
 * Offer data-access tests.
 *
 * The assertion that matters most is about `enrolled_at`, not about status: the
 * engine reads that column to decide whether an offer counts, so a status of
 * `enrolled` with a null `enrolled_at` would make the screen and the engine disagree
 * about money.
 */
import {
  callArgs,
  createSupabaseFake,
  postgrestError,
  type SupabaseFake,
} from '@/test-support/supabaseFake';

const fakeRef: { current: SupabaseFake | null } = { current: null };

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => fakeRef.current?.client,
  resetSupabaseClient: jest.fn(),
}));

import type { UserOfferInput } from '@/domain/schemas';

import { createUserOffer, deleteUserOffer, listUserOffers, setOfferStatus } from './offers';

const USER = { id: 'user-1', email: 'person@example.com' };

const offerRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'offer-1',
  user_id: USER.id,
  user_card_id: 'card-1',
  merchant_id: null,
  merchant_label: 'Greenleaf Market',
  title: '$10 back on a $50 spend',
  description: null,
  reward_type: 'statement_credit',
  reward_unit: 'usd',
  rate: 0,
  fixed_amount_usd: 10,
  minimum_spend_usd: 50,
  max_benefit_usd: 10,
  status: 'available',
  channel: 'either',
  starts_at: null,
  ends_at: '2026-08-31T00:00:00.000Z',
  enrolled_at: null,
  redeemed_at: null,
  is_user_entered: true,
  source_id: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  user_cards: { nickname: 'Everyday card', card_products: { name: 'DEMO — Test Card' } },
  ...overrides,
});

const input: UserOfferInput = {
  userCardId: 'card-1',
  merchantId: null,
  merchantLabel: 'Greenleaf Market',
  title: '$10 back on a $50 spend',
  description: undefined,
  rewardType: 'statement_credit',
  rewardUnit: 'usd',
  rate: 0,
  fixedAmountUsd: 10,
  minimumSpendUsd: 50,
  maxBenefitUsd: 10,
  channel: 'either',
  startsAt: null,
  endsAt: new Date('2026-08-31T00:00:00.000Z'),
};

describe('listUserOffers', () => {
  it('maps a row, resolving the card name through the nickname', () => {
    fakeRef.current = createSupabaseFake({ results: [{ data: [offerRow()] }], user: USER });

    return listUserOffers().then(([offer]) => {
      expect(offer).toMatchObject({
        id: 'offer-1',
        userCardId: 'card-1',
        cardName: 'Everyday card',
        merchantLabel: 'Greenleaf Market',
        fixedAmountUsd: 10,
        minimumSpendUsd: 50,
        status: 'available',
        isEnrolled: false,
        isUserEntered: true,
      });
    });
  });

  it('falls back to the product name when there is no nickname', async () => {
    fakeRef.current = createSupabaseFake({
      results: [
        {
          data: [
            offerRow({
              user_cards: { nickname: null, card_products: { name: 'DEMO — Test Card' } },
            }),
          ],
        },
      ],
      user: USER,
    });

    const [offer] = await listUserOffers();
    expect(offer?.cardName).toBe('DEMO — Test Card');
  });

  it('degrades rather than crashing when the card join is empty', async () => {
    // RLS could filter the card, or it could have been deleted. A blank offers screen
    // would be a worse answer than "Unknown card".
    fakeRef.current = createSupabaseFake({
      results: [{ data: [offerRow({ user_cards: null })] }],
      user: USER,
    });

    const [offer] = await listUserOffers();
    expect(offer?.cardName).toBe('Unknown card');
  });

  it('reports an offer as enrolled exactly when enrolled_at is set', async () => {
    fakeRef.current = createSupabaseFake({
      results: [
        {
          data: [
            offerRow({ id: 'a', enrolled_at: '2026-07-02T00:00:00.000Z', status: 'enrolled' }),
            offerRow({ id: 'b', enrolled_at: null, status: 'available' }),
          ],
        },
      ],
      user: USER,
    });

    const offers = await listUserOffers();
    expect(offers.map((offer) => offer.isEnrolled)).toEqual([true, false]);
  });

  it('surfaces a query failure as a DataError', async () => {
    fakeRef.current = createSupabaseFake({
      results: [{ error: postgrestError('42501', 'permission denied') }],
      user: USER,
    });

    await expect(listUserOffers()).rejects.toMatchObject({ kind: 'forbidden' });
  });
});

describe('createUserOffer', () => {
  it('sends what the user entered, marked as user-entered and not activated', async () => {
    fakeRef.current = createSupabaseFake({ results: [{ data: offerRow() }], user: USER });

    await createUserOffer(input);

    expect(fakeRef.current.writes[0]).toMatchObject({
      user_id: USER.id,
      user_card_id: 'card-1',
      title: '$10 back on a $50 spend',
      merchant_label: 'Greenleaf Market',
      fixed_amount_usd: 10,
      minimum_spend_usd: 50,
      max_benefit_usd: 10,
      // A new offer is never assumed activated: the user has to say so, because an
      // unactivated offer pays nothing.
      status: 'available',
      is_user_entered: true,
      ends_at: '2026-08-31T00:00:00.000Z',
    });
  });

  it('refuses to write when the session has gone', async () => {
    fakeRef.current = createSupabaseFake({ user: null });

    await expect(createUserOffer(input)).rejects.toMatchObject({ kind: 'unauthenticated' });
    expect(fakeRef.current.writes).toHaveLength(0);
  });

  it('maps a constraint violation to a DataError', async () => {
    fakeRef.current = createSupabaseFake({
      results: [{ error: postgrestError('23514', 'violates check constraint') }],
      user: USER,
    });

    await expect(createUserOffer(input)).rejects.toMatchObject({ kind: 'validation' });
  });
});

describe('setOfferStatus', () => {
  const asOf = new Date('2026-07-26T14:30:00.000Z');

  it('sets enrolled_at when the user says they activated it', async () => {
    fakeRef.current = createSupabaseFake({ results: [{ data: null }], user: USER });

    await setOfferStatus('offer-1', 'enrolled', { asOf });

    expect(fakeRef.current.writes[0]).toMatchObject({
      status: 'enrolled',
      enrolled_at: '2026-07-26T14:30:00.000Z',
      redeemed_at: null,
    });
  });

  it('clears enrolled_at when the offer is declined', async () => {
    // The engine reads `enrolled_at`, so leaving it set on a declined offer would keep
    // counting an offer the user has dismissed.
    fakeRef.current = createSupabaseFake({ results: [{ data: null }], user: USER });

    await setOfferStatus('offer-1', 'declined', { asOf });

    expect(fakeRef.current.writes[0]).toMatchObject({
      status: 'declined',
      enrolled_at: null,
    });
  });

  it('stamps both timestamps when the offer is redeemed', async () => {
    fakeRef.current = createSupabaseFake({ results: [{ data: null }], user: USER });

    await setOfferStatus('offer-1', 'redeemed', { asOf });

    expect(fakeRef.current.writes[0]).toMatchObject({
      status: 'redeemed',
      enrolled_at: '2026-07-26T14:30:00.000Z',
      redeemed_at: '2026-07-26T14:30:00.000Z',
    });
  });

  it('scopes the update to the one offer by id', async () => {
    fakeRef.current = createSupabaseFake({ results: [{ data: null }], user: USER });

    await setOfferStatus('offer-1', 'enrolled', { asOf });

    expect(callArgs(fakeRef.current, 'eq')).toEqual(['id', 'offer-1']);
  });

  it('surfaces a failure rather than reporting success', async () => {
    fakeRef.current = createSupabaseFake({
      results: [{ error: postgrestError('42501') }],
      user: USER,
    });

    await expect(setOfferStatus('offer-1', 'enrolled')).rejects.toMatchObject({
      kind: 'forbidden',
    });
  });
});

describe('deleteUserOffer', () => {
  it('deletes the one offer, scoped by id', async () => {
    fakeRef.current = createSupabaseFake({ results: [{ data: null }], user: USER });

    await deleteUserOffer('offer-1');

    expect(fakeRef.current.tables).toEqual(['user_offers']);
    expect(callArgs(fakeRef.current, 'delete')).toEqual([]);
    expect(callArgs(fakeRef.current, 'eq')).toEqual(['id', 'offer-1']);
  });

  it('surfaces a failure', async () => {
    fakeRef.current = createSupabaseFake({
      results: [{ error: postgrestError('42501') }],
      user: USER,
    });

    await expect(deleteUserOffer('offer-1')).rejects.toMatchObject({ kind: 'forbidden' });
  });
});
