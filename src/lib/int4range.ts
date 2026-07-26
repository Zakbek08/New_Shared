/**
 * Parses Postgres `int4range` text into an inclusive `[from, to]` tuple.
 *
 * Postgres *canonicalises* discrete ranges to the half-open `[a,b)` form, so the
 * `[5411,5411]` written in a migration comes back over PostgREST as `[5411,5412)`.
 * Handing that to the engine unconverted would silently widen every MCC range by
 * one, which is exactly the kind of off-by-one that quietly pays the wrong bonus.
 *
 * The engine works in inclusive tuples, so the conversion belongs here at the
 * data boundary rather than in the domain layer.
 */

/** Inclusive bounds, the form `EvaluableCondition.includedMccRanges` expects. */
export type InclusiveRange = readonly [number, number];

/**
 * Converts one range literal.
 *
 * Returns `null` for an empty range, a malformed literal, or an unbounded one —
 * an MCC range with no bound is not something to guess at.
 */
export function parseInt4Range(literal: string): InclusiveRange | null {
  const trimmed = literal.trim();
  if (trimmed.length === 0 || trimmed.toLowerCase() === 'empty') return null;

  const match = /^([[(])\s*(-?\d+)?\s*,\s*(-?\d+)?\s*([\])])$/u.exec(trimmed);
  if (match === null) return null;

  const [, lowerBracket, lowerRaw, upperRaw, upperBracket] = match;
  if (lowerRaw === undefined || upperRaw === undefined) return null;

  const lowerInclusive = lowerBracket === '[';
  const upperInclusive = upperBracket === ']';

  const from = Number.parseInt(lowerRaw, 10) + (lowerInclusive ? 0 : 1);
  const to = Number.parseInt(upperRaw, 10) - (upperInclusive ? 0 : 1);

  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  // A canonicalised `[5,5)` is empty, not a one-element range.
  if (from > to) return null;

  return [from, to];
}

/** Parses a column of range literals, dropping any that cannot be read. */
export function parseInt4Ranges(literals: readonly string[]): InclusiveRange[] {
  return literals
    .map(parseInt4Range)
    .filter((range): range is InclusiveRange => range !== null);
}
