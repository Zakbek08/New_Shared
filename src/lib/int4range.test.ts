/**
 * The half-open conversion is worth its own suite because getting it wrong is
 * invisible: every MCC range would simply be one wider, and the engine would pay a
 * bonus at a merchant that does not qualify for it.
 */
import { parseInt4Range, parseInt4Ranges } from './int4range';

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
