/**
 * Device-side encryption for the optional last four digits of a card.
 *
 * SECURITY MODEL
 * The plaintext digits never leave the device. They are encrypted here with a
 * 256-bit key held in the platform keystore (`expo-secure-store`), and only the
 * ciphertext is sent to Supabase. The server, the database, the backups and
 * every log sink see ciphertext only — this is not "encrypted at rest by the
 * provider", where the plaintext would still have arrived.
 *
 * WHY AES-256-GCM FROM @noble/ciphers
 * `expo-crypto` provides randomness and digests but no symmetric cipher, and
 * React Native has no dependable `crypto.subtle`. `@noble/ciphers` is an
 * audited, dependency-free, pure-TypeScript implementation that runs unchanged
 * on Hermes and in Node, so the same code path is what the tests exercise.
 * GCM is authenticated, so a wrong key or a tampered payload fails loudly
 * rather than yielding four plausible-looking digits.
 *
 * CONSEQUENCE WE ACCEPT
 * The key lives on one device. Reinstall the app, or sign in on a second phone,
 * and the stored ciphertext can no longer be read — `decryptLastFour` returns
 * `null` and the UI shows a masked placeholder with an option to re-enter. That
 * is the honest cost of never letting the server hold the plaintext, and it is
 * cheap because the last four digits are a convenience, not data we need.
 */
import { gcm } from '@noble/ciphers/aes.js';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

import { base64ToBytes, bytesToBase64 } from './base64';

/** AES-256. */
const KEY_BYTES = 32;
/** GCM standard nonce length. Never reused with the same key. */
const NONCE_BYTES = 12;

const KEY_ITEM_PREFIX = 'walletwise.lastFour.key.';
const CURRENT_KEY_POINTER = 'walletwise.lastFour.currentKeyId';

export interface EncryptedLastFour {
  /** Base64 of `nonce || ciphertext || tag`. Stored in `user_cards.last_four_cipher`. */
  readonly cipher: string;
  /** Which device key encrypted it. Stored in `user_cards.last_four_key_id`. */
  readonly keyId: string;
}

/** Exactly four digits. Anything else is a programming error or an attack. */
const LAST_FOUR_PATTERN = /^\d{4}$/;

function assertLastFour(value: string): void {
  if (!LAST_FOUR_PATTERN.test(value)) {
    // Deliberately does not echo the value: an over-long input is plausibly the
    // start of a full card number, and it must not reach a log or a stack trace.
    throw new Error('encryptLastFour expects exactly four digits');
  }
}

function keyItemName(keyId: string): string {
  return `${KEY_ITEM_PREFIX}${keyId}`;
}

/** `dk_` plus 16 hex characters. Not a secret — it names a key, it is not one. */
function newKeyId(): string {
  const bytes = Crypto.getRandomBytes(8);
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return `dk_${hex}`;
}

/**
 * The device's current encryption key, creating one on first use.
 *
 * Returns `null` when SecureStore is unavailable — on web, or if the keystore
 * refuses. Callers must treat that as "cannot store digits", not as an error to
 * surface: the field is optional and the card saves fine without it.
 */
async function getOrCreateCurrentKey(): Promise<{ keyId: string; key: Uint8Array } | null> {
  try {
    const existingId = await SecureStore.getItemAsync(CURRENT_KEY_POINTER);

    if (existingId !== null) {
      const stored = await SecureStore.getItemAsync(keyItemName(existingId));
      if (stored !== null) {
        return { keyId: existingId, key: base64ToBytes(stored) };
      }
      // Pointer without a key means a partially-completed write. Fall through
      // and mint a fresh key rather than trusting the inconsistent state.
    }

    const keyId = newKeyId();
    const key = Crypto.getRandomBytes(KEY_BYTES);

    // Key first, pointer second. If this is interrupted the pointer is absent,
    // which the branch above treats as "no key yet" — never as a usable key.
    await SecureStore.setItemAsync(keyItemName(keyId), bytesToBase64(key));
    await SecureStore.setItemAsync(CURRENT_KEY_POINTER, keyId);

    return { keyId, key };
  } catch {
    return null;
  }
}

async function loadKey(keyId: string): Promise<Uint8Array | null> {
  try {
    const stored = await SecureStore.getItemAsync(keyItemName(keyId));
    return stored === null ? null : base64ToBytes(stored);
  } catch {
    return null;
  }
}

/**
 * Encrypts four digits for storage.
 *
 * Returns `null` when no key could be obtained, which the caller should treat as
 * "save the card without the digits".
 */
export async function encryptLastFour(lastFour: string): Promise<EncryptedLastFour | null> {
  assertLastFour(lastFour);

  const material = await getOrCreateCurrentKey();
  if (material === null) return null;

  const nonce = Crypto.getRandomBytes(NONCE_BYTES);
  const plaintext = new Uint8Array([...lastFour].map((char) => char.charCodeAt(0)));
  const sealed = gcm(material.key, nonce).encrypt(plaintext);

  const payload = new Uint8Array(nonce.length + sealed.length);
  payload.set(nonce, 0);
  payload.set(sealed, nonce.length);

  return { cipher: bytesToBase64(payload), keyId: material.keyId };
}

/**
 * Decrypts stored digits, or returns `null` when they cannot be read.
 *
 * `null` covers every recoverable case — key absent because the app was
 * reinstalled or this is a different device, authentication tag mismatch,
 * malformed payload. None of those is worth an exception in the UI; the card
 * simply shows a masked placeholder.
 */
export async function decryptLastFour(
  cipher: string | null,
  keyId: string | null,
): Promise<string | null> {
  if (cipher === null || keyId === null) return null;

  const key = await loadKey(keyId);
  if (key === null) return null;

  try {
    const payload = base64ToBytes(cipher);
    if (payload.length <= NONCE_BYTES) return null;

    const nonce = payload.subarray(0, NONCE_BYTES);
    const sealed = payload.subarray(NONCE_BYTES);
    const plaintext = gcm(key, nonce).decrypt(sealed);

    const digits = String.fromCharCode(...plaintext);
    // Never hand back something that is not four digits, whatever decrypted.
    return LAST_FOUR_PATTERN.test(digits) ? digits : null;
  } catch {
    return null;
  }
}

/**
 * Whether this device can encrypt at all. Used to decide whether to offer the
 * last-four field, rather than accepting input we would then have to discard.
 */
export async function isLastFourStorageAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Deletes the device's key material.
 *
 * Called on account deletion, and *not* on sign-out: dropping the key at
 * sign-out would silently orphan every stored value the next time the user
 * signed back in on the same phone.
 */
export async function forgetDeviceKeys(): Promise<void> {
  try {
    const currentId = await SecureStore.getItemAsync(CURRENT_KEY_POINTER);
    if (currentId !== null) {
      await SecureStore.deleteItemAsync(keyItemName(currentId));
    }
    await SecureStore.deleteItemAsync(CURRENT_KEY_POINTER);
  } catch {
    // Nothing useful to do, and nothing sensitive to report.
  }
}

/** Display form for digits that cannot be decrypted on this device. */
export const MASKED_LAST_FOUR = '••••';
