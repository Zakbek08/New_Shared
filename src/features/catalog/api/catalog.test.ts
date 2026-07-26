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

import { getCardProduct, issuerNameOf, searchCardProducts } from './catalog';

function useFake(config: Parameters<typeof createSupabaseFake>[0]) {
  const fake = createSupabaseFake(config);
  fakeRef.current = fake;
  return fake;
}

const rule = (overrides: Record<string, unknown> = {}) => ({
  id: 'rule-1',
  label: '2% cash back on every purchase',
  kind: 'base',
  reward_type: 'cash_back_percent',
  base_rate: 2,
  bonus_rate: 0,
  is_active: true,
  verification_status: 'verified',
  last_verified_at: '2026-07-01T00:00:00.000Z',
  priority: 10,
  ...overrides,
});

const product = (overrides: Record<string, unknown> = {}) => ({
  id: 'product-1',
  slug: 'demo-flat',
  name: 'DEMO — Flat Card',
  issuer_id: 'issuer-1',
  custom_issuer_name: null,
  annual_fee_usd: 0,
  foreign_transaction_fee_percent: 3,
  supported_country_codes: ['US'],
  summary: 'A fictional flat-rate card.',
  is_user_defined: false,
  is_fictional: true,
  is_active: true,
  issuers: { name: 'DEMO — Cobalt Trust Bank', short_name: 'Cobalt' },
  reward_programs: { name: 'DEMO — Cobalt Simple Cash', unit: 'usd' },
  reward_rules: [rule()],
  ...overrides,
});

describe('issuerNameOf', () => {
  it('prefers the joined catalog issuer', () => {
    expect(issuerNameOf({ issuers: { name: 'Northwind' }, custom_issuer_name: null })).toBe(
      'Northwind',
    );
  });

  it('falls back to the custom name for a user-defined card', () => {
    expect(issuerNameOf({ issuers: null, custom_issuer_name: 'My Credit Union' })).toBe(
      'My Credit Union',
    );
  });

  it('never renders "null" when both are missing', () => {
    expect(issuerNameOf({ issuers: null, custom_issuer_name: null })).toBe('Unknown issuer');
  });
});

describe('searchCardProducts', () => {
  it('maps rows to summaries', async () => {
    useFake({ results: [{ data: [product()], error: null }] });

    const results = await searchCardProducts('');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 'product-1',
      name: 'DEMO — Flat Card',
      issuerName: 'DEMO — Cobalt Trust Bank',
      headline: '2% cash back on every purchase',
      verificationStatus: 'verified',
      isFictional: true,
    });
  });

  it('returns the whole active catalog for an empty search', async () => {
    const fake = useFake({ results: [{ data: [product()], error: null }] });

    await searchCardProducts('   ');

    // No `or` filter, and only the is_active constraint.
    expect(fake.calls.some((call) => call.method === 'or')).toBe(false);
    expect(fake.calls).toEqual(
      expect.arrayContaining([{ method: 'eq', args: ['is_active', true] }]),
    );
  });

  it('strips PostgREST filter syntax out of the search term', async () => {
    const fake = useFake({ results: [{ data: [], error: null }] });

    await searchCardProducts('foo%,bar()');

    const filter = fake.calls.find((call) => call.method === 'or')?.args[0] as string;

    // Assert the property that matters — the term cannot restructure the filter —
    // rather than the exact whitespace, which is incidental.
    expect(filter).toMatch(/^name\.ilike\.%[^%,()]*%,custom_issuer_name\.ilike\.%[^%,()]*%$/);
    // Exactly one separating comma, and exactly two `%` wildcards per clause.
    expect(filter.split(',')).toHaveLength(2);
    expect(filter.match(/%/g)).toHaveLength(4);
  });

  it('leaves an ordinary search term intact', async () => {
    const fake = useFake({ results: [{ data: [], error: null }] });

    await searchCardProducts('Northwind Grocery');

    const filter = fake.calls.find((call) => call.method === 'or')?.args[0] as string;
    expect(filter).toBe(
      'name.ilike.%Northwind Grocery%,custom_issuer_name.ilike.%Northwind Grocery%',
    );
  });

  it('matches on the issuer name, which PostgREST cannot filter without an inner join', async () => {
    useFake({ results: [{ data: [product()], error: null }] });

    // 'cobalt' appears only in the issuer name, not the product name.
    const results = await searchCardProducts('cobalt');
    expect(results).toHaveLength(1);
  });

  it('drops rows that match neither name nor issuer', async () => {
    useFake({ results: [{ data: [product()], error: null }] });

    const results = await searchCardProducts('northwind');
    expect(results).toHaveLength(0);
  });

  it('picks the highest-earning rule as the headline', async () => {
    useFake({
      results: [
        {
          data: [
            product({
              reward_rules: [
                rule({ id: 'a', label: '1% on everything else', base_rate: 1 }),
                rule({
                  id: 'b',
                  label: '6% at supermarkets',
                  kind: 'category_bonus',
                  base_rate: 6,
                }),
              ],
            }),
          ],
          error: null,
        },
      ],
    });

    const results = await searchCardProducts('');
    expect(results[0]?.headline).toBe('6% at supermarkets');
  });

  it('prefers a bonus over the base rule when the rates tie', async () => {
    useFake({
      results: [
        {
          data: [
            product({
              reward_rules: [
                rule({ id: 'a', label: 'Base 2%', kind: 'base', base_rate: 2 }),
                rule({ id: 'b', label: 'Dining 2%', kind: 'category_bonus', base_rate: 2 }),
              ],
            }),
          ],
          error: null,
        },
      ],
    });

    const results = await searchCardProducts('');
    expect(results[0]?.headline).toBe('Dining 2%');
  });

  it('ignores inactive rules when picking the headline', async () => {
    useFake({
      results: [
        {
          data: [
            product({
              reward_rules: [
                rule({ id: 'a', label: 'Retired 10%', base_rate: 10, is_active: false }),
                rule({ id: 'b', label: 'Active 2%', base_rate: 2 }),
              ],
            }),
          ],
          error: null,
        },
      ],
    });

    const results = await searchCardProducts('');
    expect(results[0]?.headline).toBe('Active 2%');
  });

  it('reports the weakest verification status, not the best', async () => {
    // Showing 'verified' when one rule is stale would overstate our confidence.
    useFake({
      results: [
        {
          data: [
            product({
              reward_rules: [
                rule({ id: 'a', verification_status: 'verified' }),
                rule({
                  id: 'b',
                  verification_status: 'stale',
                  last_verified_at: '2024-01-15T00:00:00.000Z',
                }),
              ],
            }),
          ],
          error: null,
        },
      ],
    });

    const results = await searchCardProducts('');
    expect(results[0]?.verificationStatus).toBe('stale');
    expect(results[0]?.lastVerifiedAt).toBe('2024-01-15T00:00:00.000Z');
  });

  it.each([
    ['disputed', 'verified'],
    ['unverified', 'verified'],
    ['user_reported', 'verified'],
  ])('ranks %s below %s', async (weak, strong) => {
    useFake({
      results: [
        {
          data: [
            product({
              reward_rules: [
                rule({ id: 'a', verification_status: strong }),
                rule({ id: 'b', verification_status: weak }),
              ],
            }),
          ],
          error: null,
        },
      ],
    });

    const results = await searchCardProducts('');
    expect(results[0]?.verificationStatus).toBe(weak);
  });

  it('reports no headline and no status for a card with no active rules', async () => {
    useFake({ results: [{ data: [product({ reward_rules: [] })], error: null }] });

    const results = await searchCardProducts('');
    expect(results[0]?.headline).toBeNull();
    expect(results[0]?.verificationStatus).toBeNull();
  });

  it('maps an error to a DataError', async () => {
    useFake({ results: [{ data: null, error: postgrestError('42501') }] });
    await expect(searchCardProducts('')).rejects.toMatchObject({ kind: 'forbidden' });
  });
});

describe('getCardProduct', () => {
  it('returns the detail shape with active rules ordered by priority', async () => {
    useFake({
      results: [
        {
          data: product({
            reward_rules: [
              rule({ id: 'low', priority: 10, label: 'Base' }),
              rule({ id: 'high', priority: 100, label: 'Bonus' }),
              rule({ id: 'gone', priority: 500, label: 'Retired', is_active: false }),
            ],
          }),
          error: null,
        },
      ],
    });

    const detail = await getCardProduct('product-1');

    expect(detail.summary).toBe('A fictional flat-rate card.');
    expect(detail.supportedCountryCodes).toEqual(['US']);
    expect(detail.rewardProgramName).toBe('DEMO — Cobalt Simple Cash');
    // Highest priority first; the inactive rule is excluded entirely.
    expect(detail.rules.map((r) => r.id)).toEqual(['high', 'low']);
  });

  it('maps a missing row to not_found', async () => {
    useFake({ results: [{ data: null, error: postgrestError('PGRST116') }] });
    await expect(getCardProduct('nope')).rejects.toMatchObject({ kind: 'not_found' });
  });
});
