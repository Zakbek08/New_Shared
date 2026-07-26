/**
 * Translates Supabase and PostgREST failures into a closed set of application
 * errors, at the data-access boundary.
 *
 * Two reasons this exists rather than letting raw errors reach the UI:
 *
 *   1. A Postgres error message can echo the input that caused it and leaks
 *      schema detail. Neither belongs in front of a user.
 *   2. Retry behaviour depends on the *kind* of failure. `forbidden` means RLS
 *      refused and asking again is pointless; `network` is worth one retry.
 */
import type { PostgrestError } from '@supabase/supabase-js';

export type DataErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'rate_limited'
  | 'network'
  | 'unknown';

export class DataError extends Error {
  readonly kind: DataErrorKind;
  /** Safe to render. Never contains a raw database message. */
  readonly userMessage: string;
  /** Non-sensitive code for telemetry, e.g. a Postgres SQLSTATE. */
  readonly code: string | null;

  constructor(kind: DataErrorKind, userMessage: string, code: string | null = null) {
    super(`${kind}: ${userMessage}`);
    this.name = 'DataError';
    this.kind = kind;
    this.userMessage = userMessage;
    this.code = code;
  }

  /** Whether retrying could plausibly succeed. */
  get isRetryable(): boolean {
    return this.kind === 'network' || this.kind === 'rate_limited';
  }
}

/**
 * Postgres SQLSTATE codes we can say something specific about.
 * https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const SQLSTATE: Record<string, { kind: DataErrorKind; message: string }> = {
  // insufficient_privilege — an RLS policy or a missing GRANT refused this.
  '42501': {
    kind: 'forbidden',
    message: 'You do not have permission to do that.',
  },
  // unique_violation
  '23505': {
    kind: 'conflict',
    message: 'That already exists.',
  },
  // foreign_key_violation
  '23503': {
    kind: 'validation',
    message: 'Something that entry depends on is missing.',
  },
  // check_violation — one of our own CHECK constraints rejected the row.
  '23514': {
    kind: 'validation',
    message: 'Those details are not valid. Please check them and try again.',
  },
  // not_null_violation
  '23502': {
    kind: 'validation',
    message: 'Something required was missing.',
  },
  // PostgREST: no rows returned by .single()
  PGRST116: {
    kind: 'not_found',
    message: 'We could not find that.',
  },
  // PostgREST: JWT expired or invalid
  PGRST301: {
    kind: 'unauthenticated',
    message: 'Your session has expired. Please sign in again.',
  },
};

/**
 * Maps a PostgREST error.
 *
 * An RLS refusal is the interesting case: PostgREST reports a blocked *read* as
 * zero rows rather than as an error, so a `forbidden` here almost always means a
 * blocked write. Both are correct outcomes of the policy model, not bugs.
 */
export function fromPostgrestError(error: PostgrestError): DataError {
  const mapped = SQLSTATE[error.code];
  if (mapped !== undefined) {
    return new DataError(mapped.kind, mapped.message, error.code);
  }

  // 401/403 surfaced as a bare string code.
  if (error.code === '401') {
    return new DataError('unauthenticated', 'Please sign in again.', error.code);
  }
  if (error.code === '403') {
    return new DataError('forbidden', 'You do not have permission to do that.', error.code);
  }

  return new DataError(
    'unknown',
    'Something went wrong. Please try again.',
    error.code || null,
  );
}

/** Maps a Supabase Auth error, whose useful signal is an HTTP status. */
export function fromAuthError(error: { message: string; status?: number }): DataError {
  const status = error.status ?? 0;
  const message = error.message.toLowerCase();

  if (message.includes('invalid login credentials')) {
    // Deliberately does not distinguish "no such account" from "wrong password":
    // that difference is an account-enumeration oracle.
    return new DataError(
      'unauthenticated',
      'That email or password is not right.',
      String(status),
    );
  }
  if (message.includes('email not confirmed')) {
    return new DataError(
      'unauthenticated',
      'Please confirm your email address first. Check your inbox for the link.',
      String(status),
    );
  }
  if (message.includes('already registered') || message.includes('already been registered')) {
    return new DataError(
      'conflict',
      'An account with that email already exists. Try signing in instead.',
      String(status),
    );
  }
  if (message.includes('password')) {
    return new DataError(
      'validation',
      'That password does not meet the requirements.',
      String(status),
    );
  }

  if (status === 429) {
    return new DataError(
      'rate_limited',
      'Too many attempts. Please wait a moment and try again.',
      '429',
    );
  }
  if (status === 401 || status === 403) {
    return new DataError('unauthenticated', 'Please sign in again.', String(status));
  }
  if (status >= 500) {
    return new DataError(
      'network',
      'We could not reach the server. Please try again.',
      String(status),
    );
  }

  return new DataError('unknown', 'Something went wrong. Please try again.', String(status));
}

/** Last-resort mapping for a thrown value of unknown shape. */
export function toDataError(cause: unknown): DataError {
  if (cause instanceof DataError) return cause;

  if (cause instanceof TypeError && /network|fetch/i.test(cause.message)) {
    return new DataError('network', 'We could not reach the server. Please try again.');
  }

  if (cause instanceof Error && /network request failed|timeout/i.test(cause.message)) {
    return new DataError('network', 'We could not reach the server. Please try again.');
  }

  return new DataError('unknown', 'Something went wrong. Please try again.');
}
