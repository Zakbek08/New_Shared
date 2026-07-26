import { DataError, fromAuthError, fromPostgrestError, toDataError } from './errors';
import { postgrestError } from '@/test-support/supabaseFake';

describe('DataError', () => {
  it('carries a kind, a user-safe message and an optional code', () => {
    const error = new DataError('forbidden', 'Not allowed.', '42501');
    expect(error.kind).toBe('forbidden');
    expect(error.userMessage).toBe('Not allowed.');
    expect(error.code).toBe('42501');
    expect(error).toBeInstanceOf(Error);
  });

  it('marks only network and rate-limit failures as retryable', () => {
    expect(new DataError('network', 'x').isRetryable).toBe(true);
    expect(new DataError('rate_limited', 'x').isRetryable).toBe(true);
    // Retrying an RLS refusal or a validation error will fail identically.
    expect(new DataError('forbidden', 'x').isRetryable).toBe(false);
    expect(new DataError('validation', 'x').isRetryable).toBe(false);
    expect(new DataError('not_found', 'x').isRetryable).toBe(false);
    expect(new DataError('unknown', 'x').isRetryable).toBe(false);
  });
});

describe('fromPostgrestError', () => {
  it('maps insufficient_privilege to forbidden — the RLS refusal case', () => {
    const mapped = fromPostgrestError(postgrestError('42501'));
    expect(mapped.kind).toBe('forbidden');
    expect(mapped.isRetryable).toBe(false);
  });

  it.each([
    ['23505', 'conflict'],
    ['23503', 'validation'],
    ['23514', 'validation'],
    ['23502', 'validation'],
    ['PGRST116', 'not_found'],
    ['PGRST301', 'unauthenticated'],
    ['401', 'unauthenticated'],
    ['403', 'forbidden'],
  ])('maps %s to %s', (code, kind) => {
    expect(fromPostgrestError(postgrestError(code)).kind).toBe(kind);
  });

  it('falls back to unknown for an unrecognised code', () => {
    expect(fromPostgrestError(postgrestError('XX999')).kind).toBe('unknown');
  });

  it('never surfaces the raw database message to the user', () => {
    const raw = 'duplicate key value violates unique constraint "user_cards_pkey"';
    const mapped = fromPostgrestError(postgrestError('23505', raw));
    expect(mapped.userMessage).not.toContain('user_cards_pkey');
    expect(mapped.userMessage).toBe('That already exists.');
  });

  it('keeps the code for telemetry, since a SQLSTATE is not sensitive', () => {
    expect(fromPostgrestError(postgrestError('23514')).code).toBe('23514');
  });
});

describe('fromAuthError', () => {
  it('does not distinguish a wrong password from a missing account', () => {
    // Telling them apart would be an account-enumeration oracle.
    const mapped = fromAuthError({ message: 'Invalid login credentials', status: 400 });
    expect(mapped.kind).toBe('unauthenticated');
    expect(mapped.userMessage).toBe('That email or password is not right.');
  });

  it('explains an unconfirmed email, which the user can act on', () => {
    const mapped = fromAuthError({ message: 'Email not confirmed', status: 400 });
    expect(mapped.userMessage).toMatch(/confirm your email/i);
  });

  it('maps an already-registered address to conflict', () => {
    const mapped = fromAuthError({ message: 'User already registered', status: 422 });
    expect(mapped.kind).toBe('conflict');
    expect(mapped.userMessage).toMatch(/already exists/i);
  });

  it('maps a weak password to validation', () => {
    const mapped = fromAuthError({
      message: 'Password should be at least 10 characters',
      status: 422,
    });
    expect(mapped.kind).toBe('validation');
  });

  it('maps 429 to rate_limited, which is retryable', () => {
    const mapped = fromAuthError({ message: 'too many requests', status: 429 });
    expect(mapped.kind).toBe('rate_limited');
    expect(mapped.isRetryable).toBe(true);
  });

  it('maps a server error to network, which is retryable', () => {
    const mapped = fromAuthError({ message: 'internal error', status: 503 });
    expect(mapped.kind).toBe('network');
    expect(mapped.isRetryable).toBe(true);
  });

  it('maps 401 and 403 to unauthenticated', () => {
    expect(fromAuthError({ message: 'nope', status: 401 }).kind).toBe('unauthenticated');
    expect(fromAuthError({ message: 'nope', status: 403 }).kind).toBe('unauthenticated');
  });
});

describe('toDataError', () => {
  it('passes a DataError through unchanged', () => {
    const original = new DataError('conflict', 'Already there.');
    expect(toDataError(original)).toBe(original);
  });

  it('recognises a fetch failure as a network error', () => {
    expect(toDataError(new TypeError('Network request failed')).kind).toBe('network');
    expect(toDataError(new Error('Network request failed')).kind).toBe('network');
    expect(toDataError(new Error('timeout of 5000ms exceeded')).kind).toBe('network');
  });

  it('falls back to unknown for anything else, without leaking the message', () => {
    const mapped = toDataError(new Error('column "cvv" does not exist'));
    expect(mapped.kind).toBe('unknown');
    expect(mapped.userMessage).toBe('Something went wrong. Please try again.');
  });

  it('handles a thrown non-Error value', () => {
    expect(toDataError('a string').kind).toBe('unknown');
    expect(toDataError(null).kind).toBe('unknown');
    expect(toDataError(undefined).kind).toBe('unknown');
  });
});
