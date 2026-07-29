/**
 * On-device storage.
 *
 * Storage is untrusted input, and treating it otherwise is how this kind of app breaks.
 * It survives upgrades, gets hand-edited in browser devtools, and is left half-written
 * when a tab is closed mid-save. So the tests that matter here are the hostile ones:
 * malformed JSON, the wrong shape, and — the one with real consequences — a stored card
 * id that the catalog no longer has.
 *
 * That last case is not hypothetical. A card can be retired between app versions, and a
 * wallet holding an id with no product behind it would be a card the engine silently
 * cannot price: an invisible hole in every recommendation from then on.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  EMPTY_WALLET,
  clearEverything,
  profileSchema,
  readProfile,
  readWallet,
  writeProfile,
  writeWallet,
} from './storage';

const PROFILE_KEY = 'walletwise.profile.v1';
const WALLET_KEY = 'walletwise.wallet.v1';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('profileSchema', () => {
  it('accepts a name and an email', () => {
    const parsed = profileSchema.safeParse({ name: 'Ada Lovelace', email: 'ada@example.com' });

    expect(parsed.success).toBe(true);
  });

  it('trims and lowercases the email, so the same person is one person', () => {
    const parsed = profileSchema.parse({ name: '  Ada  ', email: '  Ada@Example.COM ' });

    expect(parsed.name).toBe('Ada');
    expect(parsed.email).toBe('ada@example.com');
  });

  it('rejects an empty name with a message a person can act on', () => {
    const parsed = profileSchema.safeParse({ name: '   ', email: 'ada@example.com' });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe('Please enter your name.');
  });

  it('rejects something that is not an email address', () => {
    const parsed = profileSchema.safeParse({ name: 'Ada', email: 'not-an-email' });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe('Please enter a valid email address.');
  });
});

describe('readProfile', () => {
  it('returns null when nothing has been saved', async () => {
    await expect(readProfile()).resolves.toBeNull();
  });

  it('round-trips a saved profile', async () => {
    await writeProfile({ name: 'Ada', email: 'ada@example.com' });

    await expect(readProfile()).resolves.toEqual({ name: 'Ada', email: 'ada@example.com' });
  });

  // Treated as absent rather than allowed to throw. The user is asked again, which is
  // mildly annoying; a crash on the first screen is not recoverable at all.
  it('treats malformed JSON as no profile', async () => {
    await AsyncStorage.setItem(PROFILE_KEY, '{ not json');

    await expect(readProfile()).resolves.toBeNull();
  });

  it('treats a record of the wrong shape as no profile', async () => {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify({ name: 'Ada' }));

    await expect(readProfile()).resolves.toBeNull();
  });

  it('rejects a stored profile whose email has since become invalid', async () => {
    // Hand-edited, or written by an older build with looser validation.
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify({ name: 'Ada', email: 'nope' }));

    await expect(readProfile()).resolves.toBeNull();
  });
});

describe('readWallet', () => {
  it('returns an empty wallet when nothing has been saved', async () => {
    await expect(readWallet()).resolves.toEqual(EMPTY_WALLET);
  });

  it('round-trips a saved wallet', async () => {
    await writeWallet({
      cardIds: ['citi-double-cash', 'amex-gold'],
      activated: { 'discover-it-cash-back': true },
    });

    const wallet = await readWallet();

    expect(wallet.cardIds).toEqual(['citi-double-cash', 'amex-gold']);
    expect(wallet.activated).toEqual({ 'discover-it-cash-back': true });
  });

  // The consequential one. An id with no product behind it cannot be priced, so it
  // would be a card in the wallet that never appears in any answer — neither
  // recommended nor rejected, just absent.
  it('drops a card id the catalog no longer has', async () => {
    await AsyncStorage.setItem(
      WALLET_KEY,
      JSON.stringify({
        cardIds: ['citi-double-cash', 'retired-card-from-an-old-version'],
        activated: {},
      }),
    );

    await expect(readWallet()).resolves.toEqual({
      cardIds: ['citi-double-cash'],
      activated: {},
    });
  });

  it('deduplicates ids, so one card cannot be compared against itself', async () => {
    await AsyncStorage.setItem(
      WALLET_KEY,
      JSON.stringify({ cardIds: ['amex-gold', 'amex-gold'], activated: {} }),
    );

    await expect(readWallet()).resolves.toMatchObject({ cardIds: ['amex-gold'] });
  });

  it('treats malformed JSON as an empty wallet', async () => {
    await AsyncStorage.setItem(WALLET_KEY, 'not json at all');

    await expect(readWallet()).resolves.toEqual(EMPTY_WALLET);
  });

  it('treats a record of the wrong shape as an empty wallet', async () => {
    await AsyncStorage.setItem(WALLET_KEY, JSON.stringify({ cardIds: 'not-an-array' }));

    await expect(readWallet()).resolves.toEqual(EMPTY_WALLET);
  });
});

describe('clearEverything', () => {
  it('forgets the profile and the wallet together', async () => {
    await writeProfile({ name: 'Ada', email: 'ada@example.com' });
    await writeWallet({ cardIds: ['amex-gold'], activated: {} });

    await clearEverything();

    await expect(readProfile()).resolves.toBeNull();
    await expect(readWallet()).resolves.toEqual(EMPTY_WALLET);
  });
});

describe('what is stored', () => {
  it('writes no card digits, security codes or credentials', async () => {
    await writeProfile({ name: 'Ada', email: 'ada@example.com' });
    await writeWallet({ cardIds: ['citi-double-cash'], activated: {} });

    const everything = JSON.stringify(await AsyncStorage.multiGet([PROFILE_KEY, WALLET_KEY]));

    // The stored card reference is a public catalog id, not an account. Knowing which
    // card products someone holds is not a credential; a card number would be.
    expect(everything).toContain('citi-double-cash');
    expect(everything).not.toMatch(/\b\d{13,19}\b/);
    for (const forbidden of ['cvv', 'cvc', 'securityCode', 'pin', 'password', 'lastFour']) {
      expect(everything.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
