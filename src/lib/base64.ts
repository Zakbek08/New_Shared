/**
 * Base64 for binary payloads.
 *
 * Hand-written rather than relying on `btoa`/`atob` or `Buffer`: neither is
 * dependably present across Hermes, JSC and the Node environment the tests run
 * in, and `btoa` operates on Latin-1 strings, which mangles arbitrary bytes.
 * Twenty-odd lines of well-tested code is cheaper than the platform matrix.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Reverse lookup, accepting both standard (`+/`) and URL-safe (`-_`) alphabets. */
const LOOKUP: ReadonlyMap<string, number> = new Map([
  ...[...ALPHABET].map((char, index) => [char, index] as const),
  ['-', 62],
  ['_', 63],
]);

/** Encodes bytes as standard base64, with `=` padding. */
export function bytesToBase64(bytes: Uint8Array): string {
  let output = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];

    const triple = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);

    output += ALPHABET[(triple >> 18) & 0x3f];
    output += ALPHABET[(triple >> 12) & 0x3f];
    output += b1 === undefined ? '=' : ALPHABET[(triple >> 6) & 0x3f];
    output += b2 === undefined ? '=' : ALPHABET[triple & 0x3f];
  }

  return output;
}

/**
 * Decodes standard or URL-safe base64.
 *
 * Throws on malformed input rather than returning partial bytes — a silently
 * truncated decryption payload is far worse than a caught error.
 */
export function base64ToBytes(value: string): Uint8Array {
  const cleaned = value.replace(/=+$/, '');

  for (const char of cleaned) {
    if (!LOOKUP.has(char)) {
      throw new Error('base64ToBytes received a character outside the base64 alphabet');
    }
  }

  // Every 4 base64 characters carry 3 bytes; a remainder of 1 is impossible.
  if (cleaned.length % 4 === 1) {
    throw new Error('base64ToBytes received a string of invalid length');
  }

  const byteLength = Math.floor((cleaned.length * 3) / 4);
  const bytes = new Uint8Array(byteLength);

  let byteIndex = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const c0 = LOOKUP.get(cleaned[i] as string) ?? 0;
    const c1 = LOOKUP.get(cleaned[i + 1] as string) ?? 0;
    const c2 = LOOKUP.get(cleaned[i + 2] as string);
    const c3 = LOOKUP.get(cleaned[i + 3] as string);

    const triple = (c0 << 18) | (c1 << 12) | ((c2 ?? 0) << 6) | (c3 ?? 0);

    bytes[byteIndex++] = (triple >> 16) & 0xff;
    if (c2 !== undefined) bytes[byteIndex++] = (triple >> 8) & 0xff;
    if (c3 !== undefined) bytes[byteIndex++] = triple & 0xff;
  }

  return bytes;
}
