/**
 * Wallet data-access tests.
 *
 * The security-relevant assertions here are that `addUserCard` sends *ciphertext*
 * and never plaintext digits, and that the custom-card flow cleans up after
 * itself rather than leaving a card with no earn rate.
 */
import {
  createSupabaseFake,
  postgrestError,
  type SupabaseFake,
} from '@/test-support/supabaseFake';

const fakeRef: { current: SupabaseFake | null } = { current: null };

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => fakeRef.current?.client,
  resetSupabaseClient: jest.fn(),
}));

import { decryptLastFour } from '@/lib/lastFour';

import {
  addUserCard,
  archiveUserCard,
  createCustomCardProduct,
  listUserCards,
  reorderUserCards,
  updateUserCard,
} from './wallet';

const USER = { id: 'user-1', email: 'person@example.com' };

const productRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'product-1',
  slug: 'demo-card',
  name: 'DEMO — Test Card',
  issuer_id: 'issuer-1',
  custom_issuer_name: null,
  annual_fee_usd: 95,
  foreign_transaction_fee_percent: 3,
  is_fictional: true,
  is_user_defined: false,
  issuers: { name: 'DEMO — Test Bank' },
  reward_programs: { name: 'DEMO — Test Points' },
  reward_rules: [
    {
      label: '3% back on everything',
      kind: 'base',
      base_rate: 3,
      bonus_rate: 0,
      is_active: true,
      verification_status: 'verified',
    },
  ],
  ...overrides,
});

const userCardRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'card-1',
  user_id: USER.id,
  card_product_id: 'product-1',
  nickname: 'Everyday',
  last_four_cipher: null,
  last_four_key_id: null,
  display_order: 0,
  is_archived: false,
  is_excluded_from_recommendations: false,
  account_opened_on: null,
  is_preferred: false,
  notes: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  card_products: productRow(),
  ...overrides,
});

function useFake(config: Parameters<typeof createSupabaseFake>[0]) {
  const fake = createSupabaseFake(config);
  fakeRef.current = fake;
  return fake;
}

describe('listUserCards', () => {
  it('maps rows into the wallet shape', async () => {
    useFake({ user: USER, results: [{ data: [userCardRow()], error: null }] });

    const cards = await listUserCards();

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: 'card-1',
      productName: 'DEMO — Test Card',
      issuerName: 'DEMO — Test Bank',
      nickname: 'Everyday',
      annualFeeUsd: 95,
      foreignTransactionFeePercent: 3,
      headline: '3% back on everything',
      verificationStatus: 'verified',
    });
  });

  it('sends no user_id filter, because RLS already scopes the read', async () => {
    const fake = useFake({ user: USER, results: [{ data: [], error: null }] });

    await listUserCards();

    const filteredColumns = fake.calls
      .filter((call) => call.method === 'eq')
      .map((call) => call.args[0]);
    expect(filteredColumns).not.toContain('user_id');
  });

  it('excludes archived cards by default and includes them on request', async () => {
    const withoutArchived = useFake({ user: USER, results: [{ data: [], error: null }] });
    await listUserCards();
    expect(
      withoutArchived.calls.some(
        (call) => call.method === 'eq' && call.args[0] === 'is_archived',
      ),
    ).toBe(true);

    const withArchived = useFake({ user: USER, results: [{ data: [], error: null }] });
    await listUserCards({ includeArchived: true });
    expect(
      withArchived.calls.some((call) => call.method === 'eq' && call.args[0] === 'is_archived'),
    ).toBe(false);
  });

  it('falls back gracefully when the joined product is missing', async () => {
    useFake({
      user: USER,
      results: [{ data: [userCardRow({ card_products: null })], error: null }],
    });

    const cards = await listUserCards();
    expect(cards[0]).toMatchObject({
      productName: 'Unknown card',
      issuerName: 'Unknown issuer',
      headline: null,
    });
  });

  it('uses the custom issuer name for a user-defined product', async () => {
    useFake({
      user: USER,
      results: [
        {
          data: [
            userCardRow({
              card_products: productRow({
                is_user_defined: true,
                issuer_id: null,
                issuers: null,
                custom_issuer_name: 'My Credit Union',
              }),
            }),
          ],
          error: null,
        },
      ],
    });

    const cards = await listUserCards();
    expect(cards[0]?.issuerName).toBe('My Credit Union');
  });

  it('maps an RLS refusal to a forbidden DataError', async () => {
    useFake({ user: USER, results: [{ data: null, error: postgrestError('42501') }] });

    await expect(listUserCards()).rejects.toMatchObject({ kind: 'forbidden' });
  });
});

describe('addUserCard', () => {
  it('sends ciphertext, never the plaintext digits', async () => {
    const fake = useFake({
      user: USER,
      results: [{ data: userCardRow(), error: null }],
    });

    await addUserCard({ cardProductId: 'product-1', lastFour: '4321', isPreferred: false });

    const payload = fake.writes[0] as Record<string, unknown>;
    const cipher = payload['last_four_cipher'] as string;

    expect(typeof cipher).toBe('string');
    expect(cipher).not.toContain('4321');
    // The database CHECK that rejects bare digits would also reject this.
    expect(cipher).not.toMatch(/^[0-9]{1,19}$/);
    expect(payload['last_four_key_id']).toMatch(/^dk_[0-9a-f]{16}$/);

    // And the whole payload, serialised, contains the digits nowhere.
    expect(JSON.stringify(payload)).not.toContain('4321');
  });

  it('produces ciphertext this device can read back', async () => {
    const fake = useFake({ user: USER, results: [{ data: userCardRow(), error: null }] });

    await addUserCard({ cardProductId: 'product-1', lastFour: '1357', isPreferred: false });

    const payload = fake.writes[0] as Record<string, string | null>;
    await expect(
      decryptLastFour(payload['last_four_cipher'] ?? null, payload['last_four_key_id'] ?? null),
    ).resolves.toBe('1357');
  });

  it('stores nulls for both digit columns when no digits are given', async () => {
    const fake = useFake({ user: USER, results: [{ data: userCardRow(), error: null }] });

    await addUserCard({ cardProductId: 'product-1', isPreferred: false });

    const payload = fake.writes[0] as Record<string, unknown>;
    expect(payload['last_four_cipher']).toBeNull();
    // The DB constraint requires both columns null or both set.
    expect(payload['last_four_key_id']).toBeNull();
  });

  it('sets user_id from the session rather than trusting a caller-supplied value', async () => {
    const fake = useFake({ user: USER, results: [{ data: userCardRow(), error: null }] });

    await addUserCard({ cardProductId: 'product-1', isPreferred: false });

    expect((fake.writes[0] as Record<string, unknown>)['user_id']).toBe(USER.id);
  });

  it('formats the account open date as a plain date, not a timestamp', async () => {
    const fake = useFake({ user: USER, results: [{ data: userCardRow(), error: null }] });

    await addUserCard({
      cardProductId: 'product-1',
      accountOpenedOn: new Date('2022-03-15T12:34:56.000Z'),
      isPreferred: false,
    });

    expect((fake.writes[0] as Record<string, unknown>)['account_opened_on']).toBe('2022-03-15');
  });

  it('refuses when there is no session', async () => {
    useFake({ user: null, results: [{ data: null, error: null }] });

    await expect(
      addUserCard({ cardProductId: 'product-1', isPreferred: false }),
    ).rejects.toMatchObject({ kind: 'unauthenticated' });
  });
});

describe('updateUserCard', () => {
  it('sends only the fields that were provided', async () => {
    const fake = useFake({ user: USER, results: [{ data: userCardRow(), error: null }] });

    await updateUserCard('card-1', { isPreferred: true });

    expect(fake.writes[0]).toEqual({ is_preferred: true });
  });

  it('can clear a nickname with an explicit null', async () => {
    const fake = useFake({ user: USER, results: [{ data: userCardRow(), error: null }] });

    await updateUserCard('card-1', { nickname: null });

    expect(fake.writes[0]).toEqual({ nickname: null });
  });

  it('scopes the update to a single row id', async () => {
    const fake = useFake({ user: USER, results: [{ data: userCardRow(), error: null }] });

    await updateUserCard('card-1', { isPreferred: true });

    expect(fake.calls).toEqual(
      expect.arrayContaining([{ method: 'eq', args: ['id', 'card-1'] }]),
    );
  });
});

describe('archiveUserCard', () => {
  it('archives and stops the card being recommended, rather than deleting it', async () => {
    const fake = useFake({ user: USER, results: [{ data: null, error: null }] });

    await archiveUserCard('card-1');

    expect(fake.writes[0]).toEqual({
      is_archived: true,
      is_excluded_from_recommendations: true,
    });
    // Deleting would break the history screen's ability to explain past answers.
    expect(fake.calls.some((call) => call.method === 'delete')).toBe(false);
  });
});

describe('reorderUserCards', () => {
  it('writes a sequential display_order per card', async () => {
    const fake = useFake({
      user: USER,
      results: [
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
      ],
    });

    await reorderUserCards(['a', 'b', 'c']);

    expect(fake.writes).toEqual([
      { display_order: 0 },
      { display_order: 1 },
      { display_order: 2 },
    ]);
  });
});

describe('createCustomCardProduct', () => {
  const input = {
    name: 'My Credit Union Card',
    issuerName: 'My Credit Union',
    cardKind: 'personal_credit' as const,
    network: 'other' as const,
    annualFeeUsd: 0,
    foreignTransactionFeePercent: 1.5,
    rewardUnit: 'usd' as const,
    baseRate: 2,
  };

  it('creates a private product owned by the caller', async () => {
    const fake = useFake({
      user: USER,
      results: [
        { data: { id: 'new-product', name: input.name }, error: null },
        { data: null, error: null },
      ],
    });

    await createCustomCardProduct(input);

    const product = fake.writes[0] as Record<string, unknown>;
    expect(product['is_user_defined']).toBe(true);
    expect(product['created_by']).toBe(USER.id);
    // A user-defined row must carry a name, not an issuer_id it cannot create.
    expect(product['custom_issuer_name']).toBe('My Credit Union');
    expect(product['issuer_id']).toBeNull();
    // Never masquerades as demonstration data.
    expect(product['is_fictional']).toBe(false);
  });

  it('records the rate as user_reported so confidence stays honest', async () => {
    const fake = useFake({
      user: USER,
      results: [
        { data: { id: 'new-product' }, error: null },
        { data: null, error: null },
      ],
    });

    await createCustomCardProduct(input);

    const rule = fake.writes[1] as Record<string, unknown>;
    expect(rule['verification_status']).toBe('user_reported');
    expect(rule['base_rate']).toBe(2);
    expect(rule['reward_type']).toBe('cash_back_percent');
    expect(rule['kind']).toBe('base');
    expect(rule['label']).toBe('2% cash back on every purchase');
  });

  it.each([
    ['usd', 'cash_back_percent', '2% cash back on every purchase'],
    ['points', 'points_per_dollar', '2x points on every purchase'],
    ['miles', 'miles_per_dollar', '2x miles on every purchase'],
  ])('maps the %s unit to %s', async (unit, rewardType, label) => {
    const fake = useFake({
      user: USER,
      results: [
        { data: { id: 'new-product' }, error: null },
        { data: null, error: null },
      ],
    });

    await createCustomCardProduct({
      ...input,
      rewardUnit: unit as 'usd' | 'points' | 'miles',
    });

    const rule = fake.writes[1] as Record<string, unknown>;
    expect(rule['reward_type']).toBe(rewardType);
    expect(rule['label']).toBe(label);
  });

  it('deletes the orphan product when the rule insert fails', async () => {
    // No transaction is available over PostgREST, so the rollback is explicit —
    // otherwise the wallet would hold a card that silently earns nothing.
    const fake = useFake({
      user: USER,
      results: [
        { data: { id: 'new-product' }, error: null },
        { data: null, error: postgrestError('23514') },
        { data: null, error: null },
      ],
    });

    await expect(createCustomCardProduct(input)).rejects.toMatchObject({
      kind: 'validation',
    });

    expect(fake.calls.some((call) => call.method === 'delete')).toBe(true);
    expect(fake.calls).toEqual(
      expect.arrayContaining([{ method: 'eq', args: ['id', 'new-product'] }]),
    );
  });

  it('builds a slug that cannot collide with the shared catalog', async () => {
    const fake = useFake({
      user: USER,
      results: [
        { data: { id: 'new-product' }, error: null },
        { data: null, error: null },
      ],
    });

    await createCustomCardProduct(input);

    const slug = (fake.writes[0] as Record<string, string>)['slug'];
    expect(slug).toMatch(/^custom-my-credit-union-card-user1-[a-z0-9]+$/);
    // Matches the DB CHECK on card_products.slug.
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('refuses when there is no session', async () => {
    useFake({ user: null });
    await expect(createCustomCardProduct(input)).rejects.toMatchObject({
      kind: 'unauthenticated',
    });
  });
});
