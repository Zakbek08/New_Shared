import { base64ToBytes, bytesToBase64 } from './base64';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('bytesToBase64', () => {
  it('matches known reference encodings', () => {
    // 'Man' -> 'TWFu', the canonical RFC 4648 example.
    expect(bytesToBase64(bytes(0x4d, 0x61, 0x6e))).toBe('TWFu');
    expect(bytesToBase64(bytes(0x4d, 0x61))).toBe('TWE=');
    expect(bytesToBase64(bytes(0x4d))).toBe('TQ==');
  });

  it('encodes an empty array as an empty string', () => {
    expect(bytesToBase64(bytes())).toBe('');
  });

  it('pads to a multiple of four characters', () => {
    for (let length = 1; length <= 16; length += 1) {
      const encoded = bytesToBase64(new Uint8Array(length));
      expect(encoded.length % 4).toBe(0);
    }
  });

  it('handles the full byte range, including 0x00 and 0xFF', () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) all[i] = i;
    expect(base64ToBytes(bytesToBase64(all))).toEqual(all);
  });
});

describe('base64ToBytes', () => {
  it('decodes known reference values', () => {
    expect(base64ToBytes('TWFu')).toEqual(bytes(0x4d, 0x61, 0x6e));
    expect(base64ToBytes('TWE=')).toEqual(bytes(0x4d, 0x61));
    expect(base64ToBytes('TQ==')).toEqual(bytes(0x4d));
  });

  it('accepts the URL-safe alphabet', () => {
    // 0xFB 0xFF encodes as '+/' in standard and '-_' URL-safe form.
    const standard = bytesToBase64(bytes(0xfb, 0xff, 0xbf));
    const urlSafe = standard.replace(/\+/g, '-').replace(/\//g, '_');
    expect(base64ToBytes(urlSafe)).toEqual(base64ToBytes(standard));
  });

  it('tolerates missing padding', () => {
    expect(base64ToBytes('TWE')).toEqual(bytes(0x4d, 0x61));
    expect(base64ToBytes('TQ')).toEqual(bytes(0x4d));
  });

  it('throws on a character outside the alphabet', () => {
    // Silently skipping bad characters would truncate a decryption payload,
    // which is far worse than a caught error.
    expect(() => base64ToBytes('TW*u')).toThrow(/alphabet/);
    expect(() => base64ToBytes('hello world')).toThrow(/alphabet/);
  });

  it('throws on an impossible length', () => {
    expect(() => base64ToBytes('TWFuX')).toThrow(/length/);
  });
});

describe('round trip', () => {
  it('preserves every length from 0 to 64 bytes', () => {
    for (let length = 0; length <= 64; length += 1) {
      const input = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) input[i] = (i * 37 + length) % 256;
      expect(base64ToBytes(bytesToBase64(input))).toEqual(input);
    }
  });

  it('produces output matching Node Buffer, the reference implementation', () => {
    for (const length of [1, 2, 3, 15, 32, 44, 100]) {
      const input = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) input[i] = (i * 91) % 256;
      expect(bytesToBase64(input)).toBe(Buffer.from(input).toString('base64'));
    }
  });
});
