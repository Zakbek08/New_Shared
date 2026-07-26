/**
 * The half-open conversion is worth its own suite because getting it wrong is
 * invisible: every MCC range would simply be one wider, and the engine would pay a
 * bonus at a merchant that does not qualify for it.
 */
import {
  formatInt4Range,
  formatInt4Ranges,
  parseInt4Range,
  parseInt4Ranges,
} from './int4range';

describe('parseInt4Range', () => {
  it('converts the canonical half-open form Postgres returns', () => {
    // A migration writes `[5411,5411]`; Postgres canonicalises it to `[5411,5412)`.
    // Inclusive, that is exactly the single code 5411.
    expect(parseInt4Range('[5411,5412)')).toEqual([5411, 5411]);
  });

  it('converts a multi-code half-open range', () => {
    // 5811 through 5814 inclusive: the four dining codes.
    expect(parseInt4Range('[5811,5815)')).toEqual([5811, 5814]);
  });

  it('accepts a fully inclusive literal unchanged', () => {
    expect(parseInt4Range('[5411,5499]')).toEqual([5411, 5499]);
  });

  it('accepts an exclusive lower bound', () => {
    // `(5410,5412)` is 5411 only.
    expect(parseInt4Range('(5410,5412)')).toEqual([5411, 5411]);
  });

  it('tolerates whitespace inside the literal', () => {
    expect(parseInt4Range('  [ 5411 , 5412 )  ')).toEqual([5411, 5411]);
  });

  it('treats a canonicalised empty range as absent', () => {
    // `[5,5)` contains nothing. Reading it as `[5,5]` would invent a code.
    expect(parseInt4Range('[5,5)')).toBeNull();
  });

  it('treats the literal "empty" as absent, in either case', () => {
    expect(parseInt4Range('empty')).toBeNull();
    expect(parseInt4Range('EMPTY')).toBeNull();
  });

  it('refuses an unbounded range rather than guessing a bound', () => {
    expect(parseInt4Range('[5411,)')).toBeNull();
    expect(parseInt4Range('(,5412)')).toBeNull();
  });

  it('refuses a malformed literal', () => {
    expect(parseInt4Range('')).toBeNull();
    expect(parseInt4Range('5411-5412')).toBeNull();
    expect(parseInt4Range('[5411 5412)')).toBeNull();
    expect(parseInt4Range('{5411,5412}')).toBeNull();
    expect(parseInt4Range('[abc,def)')).toBeNull();
  });

  it('handles negative bounds, which an int4range permits', () => {
    expect(parseInt4Range('[-5,0)')).toEqual([-5, -1]);
  });
});

describe('parseInt4Ranges', () => {
  it('converts every readable literal', () => {
    expect(parseInt4Ranges(['[5411,5412)', '[5300,5301)'])).toEqual([
      [5411, 5411],
      [5300, 5300],
    ]);
  });

  it('drops unreadable literals rather than failing the whole column', () => {
    // One bad row should not cost the user every other rule on the card.
    expect(parseInt4Ranges(['[5411,5412)', 'nonsense', 'empty'])).toEqual([[5411, 5411]]);
  });

  it('returns an empty array for an empty column', () => {
    expect(parseInt4Ranges([])).toEqual([]);
  });
});

describe('formatInt4Range', () => {
  it('writes an inclusive single code as the canonical half-open literal', () => {
    // The engine's `[5411, 5411]` is Postgres's `[5411,5412)`.
    expect(formatInt4Range([5411, 5411])).toBe('[5411,5412)');
  });

  it('writes a span', () => {
    expect(formatInt4Range([5811, 5814])).toBe('[5811,5815)');
  });

  it('round-trips through the parser', () => {
    // The property that matters: a range written by the admin editor and read back by
    // the engine must be the same range. An asymmetry here widens every MCC range by
    // one code, invisibly.
    for (const range of [
      [1, 1],
      [5411, 5411],
      [5811, 5814],
      [9999, 9999],
    ] as const) {
      expect(parseInt4Range(formatInt4Range(range))).toEqual([...range]);
    }
  });

  it('refuses a range that starts above it ends', () => {
    expect(() => formatInt4Range([5814, 5811])).toThrow(RangeError);
  });

  it('refuses a non-integer bound', () => {
    expect(() => formatInt4Range([5411.5, 5412])).toThrow(RangeError);
  });

  it('formats a whole column', () => {
    expect(
      formatInt4Ranges([
        [5411, 5411],
        [5811, 5814],
      ]),
    ).toEqual(['[5411,5412)', '[5811,5815)']);
  });

  it('formats an empty column as an empty array', () => {
    expect(formatInt4Ranges([])).toEqual([]);
  });
});
