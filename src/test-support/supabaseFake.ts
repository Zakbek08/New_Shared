/**
 * A minimal chainable stand-in for the Supabase client.
 *
 * The real client returns a thenable builder, so every filter method has to
 * return `this` and the whole chain has to resolve to `{ data, error }`. This
 * fake reproduces that shape and records the calls, which lets the API tests
 * assert what was actually sent — the `.eq('id', …)` scoping on an update, for
 * instance, is a security-relevant detail worth pinning.
 */
import type { PostgrestError } from '@supabase/supabase-js';

export interface RecordedCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

export interface TableResult {
  readonly data?: unknown;
  readonly error?: PostgrestError | null;
}

/** One queued response per `from()` call, in order. */
export interface FakeConfig {
  readonly results?: readonly TableResult[];
  readonly user?: { id: string; email?: string | null } | null;
  readonly authError?: { message: string; status?: number } | null;
}

export interface SupabaseFake {
  readonly client: ReturnType<typeof buildClient>;
  readonly calls: RecordedCall[];
  /** Table names passed to `from()`, in order. */
  readonly tables: string[];
  /** Payloads passed to `insert()` / `update()`, in order. */
  readonly writes: unknown[];
}

function buildClient(config: FakeConfig, sink: SupabaseFake) {
  let resultIndex = 0;

  const nextResult = (): TableResult => {
    const result = config.results?.[resultIndex] ?? { data: null, error: null };
    resultIndex += 1;
    // The real client always returns an explicit `error: null` on success, and the
    // production code tests `error !== null`. Normalising here means a queued result
    // that omits `error` behaves like a success rather than tripping every check —
    // a footgun that cost real debugging time before it was closed.
    return { data: result.data ?? null, error: result.error ?? null };
  };

  const makeBuilder = () => {
    // Resolved lazily: the chain may add filters after the builder is created,
    // and the result must not be consumed until the caller awaits.
    let pending: TableResult | null = null;
    const resolve = (): TableResult => {
      pending ??= nextResult();
      return pending;
    };

    const record = (method: string, args: readonly unknown[]) => {
      sink.calls.push({ method, args });
    };

    const builder: Record<string, unknown> = {};

    // Every chainable filter the app uses. A method missing from this list throws
    // `is not a function` inside a `try`, which surfaces as an opaque "unknown"
    // DataError — so the list is deliberately broader than today's call sites.
    for (const method of [
      'select',
      'eq',
      'neq',
      'gt',
      'gte',
      'lt',
      'lte',
      'like',
      'ilike',
      'or',
      'order',
      'limit',
      'range',
      'in',
      'is',
      'not',
      'contains',
      'overlaps',
      'filter',
      'match',
    ]) {
      builder[method] = (...args: unknown[]) => {
        record(method, args);
        return builder;
      };
    }

    for (const method of ['insert', 'update', 'upsert']) {
      builder[method] = (...args: unknown[]) => {
        record(method, args);
        sink.writes.push(args[0]);
        return builder;
      };
    }

    builder['delete'] = (...args: unknown[]) => {
      record('delete', args);
      return builder;
    };

    // Terminal operators. `single`/`maybeSingle` resolve like the base builder.
    builder['single'] = () => {
      record('single', []);
      return Promise.resolve(resolve());
    };
    builder['maybeSingle'] = () => {
      record('maybeSingle', []);
      return Promise.resolve(resolve());
    };

    // The builder itself is awaitable, as PostgrestBuilder is.
    builder['then'] = (
      onFulfilled?: (value: TableResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(resolve()).then(onFulfilled, onRejected);

    return builder;
  };

  return {
    from: (table: string) => {
      sink.tables.push(table);
      return makeBuilder();
    },
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: config.user ?? null },
          error: config.authError ?? null,
        }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
  };
}

export function createSupabaseFake(config: FakeConfig = {}): SupabaseFake {
  const sink: SupabaseFake = {
    calls: [],
    tables: [],
    writes: [],
  } as unknown as SupabaseFake;

  (sink as { client: unknown }).client = buildClient(config, sink);
  return sink;
}

/** Builds a PostgrestError with the shape the real client returns. */
export function postgrestError(code: string, message = 'error'): PostgrestError {
  return { code, message, details: '', hint: '' } as PostgrestError;
}

/** Finds the arguments of the first recorded call to `method`. */
export function callArgs(fake: SupabaseFake, method: string): readonly unknown[] | undefined {
  return fake.calls.find((call) => call.method === method)?.args;
}
