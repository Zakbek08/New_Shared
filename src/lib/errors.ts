/**
 * A closed set of application errors, so the UI never renders a raw exception.
 *
 * The set is small because the app's failure surface is small: with no server, the
 * things that can go wrong are a malformed stored record, a storage read that fails,
 * and a programming mistake. What survives from the earlier server-backed design is
 * the discipline, which is worth keeping:
 *
 *   1. A raw error message can echo the input that caused it. That does not belong in
 *      front of a user, and in a financial app the input may be the amount they were
 *      about to spend.
 *   2. Whether retrying helps depends on the *kind* of failure, and only the thrower
 *      knows. `ErrorNotice` reads `isRetryable` rather than guessing from a string.
 */
export type DataErrorKind = 'not_found' | 'validation' | 'storage' | 'unknown';

export class DataError extends Error {
  readonly kind: DataErrorKind;
  /** Safe to render. Never contains a raw underlying message. */
  readonly userMessage: string;
  /** Non-sensitive code for telemetry. */
  readonly code: string | null;

  constructor(kind: DataErrorKind, userMessage: string, code: string | null = null) {
    super(`${kind}: ${userMessage}`);
    this.name = 'DataError';
    this.kind = kind;
    this.userMessage = userMessage;
    this.code = code;
  }

  /**
   * Whether retrying could plausibly succeed.
   *
   * Only a storage failure qualifies. A validation failure will fail identically on
   * every attempt, and offering a retry button for it teaches the user that the
   * button does nothing.
   */
  get isRetryable(): boolean {
    return this.kind === 'storage';
  }
}

/**
 * Wraps anything thrown into a `DataError`.
 *
 * The `cause` message is deliberately **not** passed through to `userMessage`. It is
 * kept on the wrapper's own message for logs, where the redaction layer will handle
 * it, and the user gets a generic line instead — because an unexpected error is
 * exactly the case where nobody has checked what the string contains.
 */
export function toDataError(cause: unknown): DataError {
  if (cause instanceof DataError) return cause;

  const detail = cause instanceof Error ? cause.message : String(cause);
  const error = new DataError('unknown', 'Something went wrong. Please try again.');
  error.stack = `${error.stack ?? ''}\nCaused by: ${detail}`;
  return error;
}
