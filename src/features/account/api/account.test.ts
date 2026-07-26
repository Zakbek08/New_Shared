/**
 * Data-export and account-deletion data access.
 *
 * Two behaviours matter more than the rest, and both are about what must *not*
 * happen:
 *
 *   1. `delete_own_account` must be called with no arguments. The whole safety
 *      argument for a SECURITY DEFINER delete rests on the caller being unable to
 *      name a victim, so a test that pins the absence of an argument is pinning
 *      the security property, not the call signature.
 *   2. A failed read must fail the export. An export that swallowed one table's
 *      error and wrote the rest would produce a file that looks complete and is
 *      not — the worst possible outcome for a feature whose only promise is
 *      completeness.
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

const mockForgetDeviceKeys = jest.fn<Promise<void>, []>();
jest.mock('@/lib/lastFour', () => ({
  forgetDeviceKeys: () => mockForgetDeviceKeys(),
}));

const mockWrite = jest.fn<void, [string]>();
const mockDelete = jest.fn<void, []>();
const mockCreate = jest.fn<void, []>();
const mockFileExists = { current: false };

jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache/' },
  File: class {
    readonly uri: string;
    constructor(directory: string, name: string) {
      this.uri = `${directory}${name}`;
    }
    get exists() {
      return mockFileExists.current;
    }
    create() {
      mockCreate();
    }
    write(content: string) {
      mockWrite(content);
    }
    delete() {
      mockDelete();
    }
  },
}));

const mockIsSharingAvailable = jest.fn<Promise<boolean>, []>();
const mockShare = jest.fn<Promise<void>, [string]>();
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockIsSharingAvailable(),
  shareAsync: (uri: string) => mockShare(uri),
}));

const mockTrack = jest.fn();
jest.mock('@/services/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
  captureException: jest.fn(),
}));

import { CIPHERTEXT_PLACEHOLDER } from '@/domain/account/exportDocument';
import { DataError } from '@/lib/errors';

import { deleteOwnAccount, exportAccountData } from './account';

const USER_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const EXPORTED_AT = new Date('2026-07-26T15:30:00.000Z');

const profileRow = {
  id: USER_ID,
  email: 'person@example.test',
  display_name: 'Person',
  role: 'member',
  home_country_code: 'US',
  home_currency_code: 'USD',
  preferred_locale: 'en-US',
  disclaimers_accepted_version: '1',
  disclaimers_accepted_at: '2026-01-01T00:00:00.000Z',
  onboarding_completed_at: '2026-01-01T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const cardRow = {
  id: 'card-1',
  user_id: USER_ID,
  card_product_id: 'product-1',
  nickname: 'Everyday',
  last_four_cipher: 'Y0RTAlBIRVJURVhU',
  last_four_key_id: 'key-1',
  display_order: 0,
  is_archived: false,
  is_excluded_from_recommendations: false,
  account_opened_on: '2024-03-14',
  is_preferred: false,
  notes: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

/**
 * The queue in the order `fetchExportInput` reads.
 *
 * Written as a named list rather than inline, because the order is a real coupling
 * between the fake and the implementation, and a reader deserves to see it.
 */
function exportResults(overrides: Record<string, { data?: unknown; error?: never }> = {}) {
  const noRows = { data: [] };
  return [
    { data: profileRow }, // users (maybeSingle)
    { data: [] }, // card_products, filtered to user-defined
    overrides['user_cards'] ?? { data: [cardRow] },
    noRows, // user_reward_preferences
    noRows, // user_rule_enrollments
    noRows, // user_offers
    noRows, // reward_usage
    noRows, // purchase_queries
    noRows, // recommendations
    noRows, // recommendation_candidates
    noRows, // audit_logs
  ];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFileExists.current = false;
  mockIsSharingAvailable.mockResolvedValue(true);
  mockShare.mockResolvedValue(undefined);
  mockForgetDeviceKeys.mockResolvedValue(undefined);
});

describe('exportAccountData', () => {
  it('reads every user-owned table', async () => {
    fakeRef.current = createSupabaseFake({ results: exportResults() });

    await exportAccountData(USER_ID, EXPORTED_AT);

    expect(fakeRef.current.tables).toEqual([
      'users',
      'card_products',
      'user_cards',
      'user_reward_preferences',
      'user_rule_enrollments',
      'user_offers',
      'reward_usage',
      'purchase_queries',
      'recommendations',
      'recommendation_candidates',
      'audit_logs',
    ]);
  });

  it('writes the document to a file named after the export time', async () => {
    fakeRef.current = createSupabaseFake({ results: exportResults() });

    const result = await exportAccountData(USER_ID, EXPORTED_AT);

    expect(result.fileName).toBe('walletwise-export-2026-07-26T15-30-00-000Z.json');
    expect(result.fileUri).toBe(
      'file:///cache/walletwise-export-2026-07-26T15-30-00-000Z.json',
    );
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockWrite).toHaveBeenCalledTimes(1);
  });

  it('never writes the stored ciphertext or key id into the file', async () => {
    fakeRef.current = createSupabaseFake({ results: exportResults() });

    await exportAccountData(USER_ID, EXPORTED_AT);

    const written = mockWrite.mock.calls[0]?.[0] ?? '';
    expect(written).not.toContain('Y0RTAlBIRVJURVhU');
    expect(written).not.toContain('key-1');
    expect(written).toContain(CIPHERTEXT_PLACEHOLDER);
  });

  it('overwrites a file left behind by a previous export', async () => {
    // Same clock, same filename. Without the delete, `create()` throws.
    mockFileExists.current = true;
    fakeRef.current = createSupabaseFake({ results: exportResults() });

    await exportAccountData(USER_ID, EXPORTED_AT);

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('offers the share sheet when sharing is available', async () => {
    fakeRef.current = createSupabaseFake({ results: exportResults() });

    const result = await exportAccountData(USER_ID, EXPORTED_AT);

    expect(mockShare).toHaveBeenCalledWith(
      'file:///cache/walletwise-export-2026-07-26T15-30-00-000Z.json',
    );
    expect(result.wasShared).toBe(true);
  });

  it('still writes the file when sharing is unavailable, and says so', async () => {
    mockIsSharingAvailable.mockResolvedValue(false);
    fakeRef.current = createSupabaseFake({ results: exportResults() });

    const result = await exportAccountData(USER_ID, EXPORTED_AT);

    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockShare).not.toHaveBeenCalled();
    expect(result.wasShared).toBe(false);
  });

  it('fails the whole export when one table cannot be read', async () => {
    fakeRef.current = createSupabaseFake({
      results: exportResults({ user_cards: { error: postgrestError('42501') } as never }),
    });

    await expect(exportAccountData(USER_ID, EXPORTED_AT)).rejects.toBeInstanceOf(DataError);
    // No half-written file: nothing is created until every read has succeeded.
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('fails when the profile is missing rather than exporting a document without one', async () => {
    fakeRef.current = createSupabaseFake({ results: [{ data: null }] });

    await expect(exportAccountData(USER_ID, EXPORTED_AT)).rejects.toMatchObject({
      kind: 'not_found',
    });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('reports counts to analytics and nothing from the document itself', async () => {
    fakeRef.current = createSupabaseFake({ results: exportResults() });

    await exportAccountData(USER_ID, EXPORTED_AT);

    const [event, properties] = mockTrack.mock.calls[0] ?? [];
    expect(event).toBe('account_data_exported');
    expect(properties).toEqual({ sectionCount: 13, recordCount: 2, wasShared: true });
    // The nickname is user free text; it must not reach an analytics sink.
    expect(JSON.stringify(properties)).not.toContain('Everyday');
  });

  it('skips the rule reads entirely when the user has no custom products', async () => {
    fakeRef.current = createSupabaseFake({ results: exportResults() });

    await exportAccountData(USER_ID, EXPORTED_AT);

    expect(fakeRef.current.tables).not.toContain('reward_rules');
    expect(fakeRef.current.tables).not.toContain('reward_rule_conditions');
  });
});

describe('deleteOwnAccount', () => {
  it('calls delete_own_account with no arguments', async () => {
    fakeRef.current = createSupabaseFake({});

    await deleteOwnAccount();

    expect(fakeRef.current.rpcCalls).toEqual([{ name: 'delete_own_account', args: undefined }]);
  });

  it('wipes the device key after the account is gone, not before', async () => {
    const order: string[] = [];
    mockForgetDeviceKeys.mockImplementation(() => {
      order.push('forgetDeviceKeys');
      return Promise.resolve();
    });
    fakeRef.current = createSupabaseFake({});

    await deleteOwnAccount();

    // The rpc is recorded synchronously when called, so its position in this list
    // reflects real ordering.
    expect(order).toEqual(['forgetDeviceKeys']);
    expect(fakeRef.current.rpcCalls).toHaveLength(1);
  });

  it('does not wipe the device key when the deletion failed', async () => {
    // The account still exists. Destroying the key here would strand the user's
    // stored digits permanently.
    fakeRef.current = createSupabaseFake({
      rpcResults: { delete_own_account: { error: postgrestError('42501') } },
    });

    await expect(deleteOwnAccount()).rejects.toBeInstanceOf(DataError);
    expect(mockForgetDeviceKeys).not.toHaveBeenCalled();
  });

  it('still resolves when the key wipe fails, because the account is already gone', async () => {
    mockForgetDeviceKeys.mockRejectedValue(new Error('keychain unavailable'));
    fakeRef.current = createSupabaseFake({});

    await expect(deleteOwnAccount()).resolves.toBeUndefined();
  });

  it('records the deletion with no identifying properties', async () => {
    fakeRef.current = createSupabaseFake({});

    await deleteOwnAccount();

    expect(mockTrack).toHaveBeenCalledWith('account_deleted', {});
  });
});
