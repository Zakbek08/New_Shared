/**
 * Tests for the one place WalletWise touches card digits.
 *
 * The security-relevant assertions are: input longer than four digits is
 * refused, the stored payload satisfies both database CHECK constraints, and a
 * missing or wrong key yields `null` rather than plausible-looking digits.
 */
import * as SecureStore from 'expo-secure-store';

import {
  decryptLastFour,
  encryptLastFour,
  forgetDeviceKeys,
  isLastFourStorageAvailable,
  MASKED_LAST_FOUR,
} from './lastFour';

/** The CHECK constraints from 20260701000500_users_and_wallet.sql. */
const CIPHER_SHAPE = /^[A-Za-z0-9+/=_-]{16,256}$/;
const PLAINTEXT_DIGITS = /^[0-9]{1,19}$/;

describe('encryptLastFour', () => {
  it('encrypts four digits and reports the key that was used', async () => {
    const result = await encryptLastFour('1234');

    expect(result).not.toBeNull();
    expect(result?.keyId).toMatch(/^dk_[0-9a-f]{16}$/);
    expect(typeof result?.cipher).toBe('string');
  });

  it('produces a payload that satisfies the database cipher-shape constraint', async () => {
    const result = await encryptLastFour('4321');
    expect(result?.cipher).toMatch(CIPHER_SHAPE);
  });

  it('produces a payload the plaintext-digits guard would not reject', async () => {
    // `user_cards_last_four_not_plaintext` rejects bare digit strings. The
    // ciphertext must never look like one.
    const result = await encryptLastFour('0000');
    expect(result?.cipher).not.toMatch(PLAINTEXT_DIGITS);
  });

  it('never emits the plaintext digits inside the payload', async () => {
    const result = await encryptLastFour('9876');
    expect(result?.cipher).not.toContain('9876');
  });

  it('uses a fresh nonce, so the same digits encrypt differently each time', async () => {
    const first = await encryptLastFour('1111');
    const second = await encryptLastFour('1111');

    expect(first?.cipher).not.toBe(second?.cipher);
    // Same device key, though — only the nonce changes.
    expect(first?.keyId).toBe(second?.keyId);
  });

  it.each([
    ['five digits', '12345'],
    ['a full card number', '4111111111111111'],
    ['three digits', '123'],
    ['empty', ''],
    ['non-numeric', 'abcd'],
    ['digits with a space', '12 34'],
  ])('refuses %s', async (_label, value) => {
    await expect(encryptLastFour(value)).rejects.toThrow(/exactly four digits/);
  });

  it('does not echo the rejected value in the error, in case it is a card number', async () => {
    await expect(encryptLastFour('4111111111111111')).rejects.toThrow(
      /^encryptLastFour expects exactly four digits$/,
    );
  });
});

describe('decryptLastFour', () => {
  it('round-trips the digits', async () => {
    const encrypted = await encryptLastFour('2468');
    expect(encrypted).not.toBeNull();

    const decrypted = await decryptLastFour(encrypted!.cipher, encrypted!.keyId);
    expect(decrypted).toBe('2468');
  });

  it('round-trips every four-digit edge case', async () => {
    for (const digits of ['0000', '9999', '0001', '1000']) {
      const encrypted = await encryptLastFour(digits);
      await expect(decryptLastFour(encrypted!.cipher, encrypted!.keyId)).resolves.toBe(digits);
    }
  });

  it('returns null when nothing is stored', async () => {
    await expect(decryptLastFour(null, null)).resolves.toBeNull();
    await expect(decryptLastFour('abc', null)).resolves.toBeNull();
    await expect(decryptLastFour(null, 'dk_0000000000000000')).resolves.toBeNull();
  });

  it('returns null when this device has no key with that id', async () => {
    // The reinstall / second-device case. It is a normal state, not an error.
    const encrypted = await encryptLastFour('1357');
    const decrypted = await decryptLastFour(encrypted!.cipher, 'dk_ffffffffffffffff');
    expect(decrypted).toBeNull();
  });

  it('returns null after the device key is forgotten', async () => {
    const encrypted = await encryptLastFour('8642');
    await expect(decryptLastFour(encrypted!.cipher, encrypted!.keyId)).resolves.toBe('8642');

    await forgetDeviceKeys();

    await expect(decryptLastFour(encrypted!.cipher, encrypted!.keyId)).resolves.toBeNull();
  });

  it('returns null for a tampered payload rather than garbage digits', async () => {
    const encrypted = await encryptLastFour('1122');

    // Flip a character in the ciphertext. GCM authenticates, so this must fail.
    const chars = [...encrypted!.cipher];
    const target = chars.length - 6;
    chars[target] = chars[target] === 'A' ? 'B' : 'A';
    const tampered = chars.join('');

    await expect(decryptLastFour(tampered, encrypted!.keyId)).resolves.toBeNull();
  });

  it('returns null for a payload too short to contain a nonce', async () => {
    const encrypted = await encryptLastFour('3344');
    await expect(decryptLastFour('AAAA', encrypted!.keyId)).resolves.toBeNull();
  });

  it('returns null for a payload that is not valid base64', async () => {
    const encrypted = await encryptLastFour('5566');
    await expect(decryptLastFour('not*valid*base64', encrypted!.keyId)).resolves.toBeNull();
  });

  it('keeps two separately encrypted values independent', async () => {
    const a = await encryptLastFour('1010');
    const b = await encryptLastFour('2020');

    await expect(decryptLastFour(a!.cipher, a!.keyId)).resolves.toBe('1010');
    await expect(decryptLastFour(b!.cipher, b!.keyId)).resolves.toBe('2020');
  });
});

describe('key management', () => {
  it('reuses one device key across encryptions rather than minting one each time', async () => {
    const first = await encryptLastFour('1234');
    const second = await encryptLastFour('5678');
    expect(first?.keyId).toBe(second?.keyId);
  });

  it('mints a new key when the pointer exists but the key is gone', async () => {
    const first = await encryptLastFour('1234');
    expect(first).not.toBeNull();

    // Simulate a partially-completed write: pointer present, key material lost.
    await SecureStore.deleteItemAsync(`walletwise.lastFour.key.${first!.keyId}`);

    const second = await encryptLastFour('5678');
    expect(second).not.toBeNull();
    expect(second?.keyId).not.toBe(first?.keyId);
    // And the new key genuinely works.
    await expect(decryptLastFour(second!.cipher, second!.keyId)).resolves.toBe('5678');
  });

  it('reports availability from SecureStore', async () => {
    await expect(isLastFourStorageAvailable()).resolves.toBe(true);
  });

  it('returns null instead of throwing when the keystore is unusable', async () => {
    const setItem = jest.spyOn(SecureStore, 'setItemAsync');
    const getItem = jest.spyOn(SecureStore, 'getItemAsync');
    getItem.mockResolvedValue(null);
    setItem.mockRejectedValue(new Error('keystore unavailable'));

    // The card must still be savable; the digits are a convenience.
    await expect(encryptLastFour('1234')).resolves.toBeNull();

    setItem.mockRestore();
    getItem.mockRestore();
  });
});

describe('MASKED_LAST_FOUR', () => {
  it('is four mask characters, matching the digit count it stands in for', () => {
    expect([...MASKED_LAST_FOUR]).toHaveLength(4);
    expect(MASKED_LAST_FOUR).not.toMatch(/\d/);
  });
});
