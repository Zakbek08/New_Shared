/**
 * The error boundary's two jobs: never leak an underlying message to the user, and
 * only offer a retry when one could work.
 *
 * The leak test is the one that matters. `toDataError` wraps whatever was thrown, and
 * the thing thrown may carry the purchase amount or the contents of a stored record. If
 * that string reached `userMessage` it would be rendered on screen.
 */
import { DataError, toDataError } from './errors';

describe('DataError', () => {
  it('renders the message it was given, not the internal one', () => {
    const error = new DataError('validation', 'Those details are not valid.');

    expect(error.userMessage).toBe('Those details are not valid.');
    // The internal message carries the kind, for logs. The two are separate on purpose.
    expect(error.message).toContain('validation');
  });

  it('offers a retry only for a storage failure', () => {
    expect(new DataError('storage', 'Could not save.').isRetryable).toBe(true);
    // A validation failure fails identically every time. A retry button that never
    // works teaches the user to ignore retry buttons.
    expect(new DataError('validation', 'Not valid.').isRetryable).toBe(false);
    expect(new DataError('not_found', 'Not found.').isRetryable).toBe(false);
    expect(new DataError('unknown', 'Went wrong.').isRetryable).toBe(false);
  });
});

describe('toDataError', () => {
  it('passes an existing DataError straight through', () => {
    const original = new DataError('not_found', 'That card is not in the catalog.');

    expect(toDataError(original)).toBe(original);
  });

  // The load-bearing assertion. Whatever was thrown might contain the amount someone
  // was about to spend, or the contents of a stored record.
  it('never puts the underlying message in front of the user', () => {
    const secret = 'amount 4321.55 for user@example.com';
    const wrapped = toDataError(new Error(secret));

    expect(wrapped.kind).toBe('unknown');
    expect(wrapped.userMessage).not.toContain(secret);
    expect(wrapped.userMessage).toBe('Something went wrong. Please try again.');
  });

  it('keeps the cause on the stack, so a log can still diagnose it', () => {
    const wrapped = toDataError(new Error('the real reason'));

    expect(wrapped.stack ?? '').toContain('the real reason');
  });

  it('handles a thrown non-Error without crashing', () => {
    expect(toDataError('just a string').kind).toBe('unknown');
    expect(toDataError(undefined).userMessage).toBe('Something went wrong. Please try again.');
  });
});
