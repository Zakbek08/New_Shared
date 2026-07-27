/**
 * Environment configuration.
 *
 * THIS FILE EXISTS BECAUSE OF A SHIPPED DEFECT
 * `env.ts` previously read `process.env` through a dynamic key:
 *
 *     function readRaw(name: string) {
 *       return (process.env as Record<string, string | undefined>)[name];
 *     }
 *
 * Metro inlines `EXPO_PUBLIC_*` variables by syntactically replacing each static
 * `process.env.SOME_NAME` expression with a string literal. A computed read is
 * invisible to that transform, so nothing was substituted, `process.env` was an
 * empty object in the bundle, and the app threw "Invalid environment
 * configuration" on boot — on device and on web — with a correct `.env` present.
 *
 * Every unit test passed throughout, because Jest runs in Node where
 * `process.env` really is populated and dynamic access really does work. No
 * behavioural test can catch this: the behaviour is identical under Node and only
 * differs after bundling. So the guard at the bottom reads this module's own
 * source and asserts the *shape* of the reads.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getEnv, isDemoDataEnabled, isDemoMode, isProduction, resetEnvCache } from './env';

const VALID_KEY = 'a'.repeat(40);

/** Keys this module reads, so a test can clear them without disturbing others. */
const KEYS = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_ENVIRONMENT',
  'EXPO_PUBLIC_ENABLE_DEMO_DATA',
  'EXPO_PUBLIC_ANALYTICS_WRITE_KEY',
  'EXPO_PUBLIC_ERROR_MONITORING_DSN',
  'EXPO_PUBLIC_DEMO_MODE',
] as const;

const originals: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) {
    originals[key] = process.env[key];
    delete process.env[key];
  }
  // A valid baseline; individual tests override one field at a time.
  process.env['EXPO_PUBLIC_SUPABASE_URL'] = 'https://project.supabase.co';
  process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY'] = VALID_KEY;
  resetEnvCache();
});

afterEach(() => {
  for (const key of KEYS) {
    if (originals[key] === undefined) delete process.env[key];
    else process.env[key] = originals[key];
  }
  resetEnvCache();
});

describe('a valid configuration', () => {
  it('reads the URL and key', () => {
    const env = getEnv();
    expect(env.supabaseUrl).toBe('https://project.supabase.co');
    expect(env.supabaseAnonKey).toBe(VALID_KEY);
  });

  it('defaults the environment to development', () => {
    expect(getEnv().environment).toBe('development');
  });

  it('defaults demo data to on, because the seed catalog is fictional', () => {
    // The safer default: showing the DEMO DATA banner when it is not needed is
    // harmless, hiding it when it is needed presents invented rates as real.
    expect(getEnv().enableDemoData).toBe(true);
  });

  it('reports optional keys as null rather than empty string', () => {
    // `null` means "known to be absent", which is what an unset analytics key is.
    const env = getEnv();
    expect(env.analyticsWriteKey).toBeNull();
    expect(env.errorMonitoringDsn).toBeNull();
  });

  it('treats an empty string as absent', () => {
    process.env['EXPO_PUBLIC_ANALYTICS_WRITE_KEY'] = '';
    resetEnvCache();
    expect(getEnv().analyticsWriteKey).toBeNull();
  });
});

describe('the URL rule', () => {
  it('accepts https', () => {
    process.env['EXPO_PUBLIC_SUPABASE_URL'] = 'https://project.supabase.co';
    resetEnvCache();
    expect(getEnv().supabaseUrl).toBe('https://project.supabase.co');
  });

  it('accepts http://localhost, for the local Supabase stack', () => {
    process.env['EXPO_PUBLIC_SUPABASE_URL'] = 'http://localhost:54321';
    resetEnvCache();
    expect(getEnv().supabaseUrl).toBe('http://localhost:54321');
  });

  it('rejects plain http to a remote host', () => {
    // Session tokens travel over this connection.
    process.env['EXPO_PUBLIC_SUPABASE_URL'] = 'http://project.supabase.co';
    resetEnvCache();
    expect(() => getEnv()).toThrow(/https/);
  });

  it('rejects a value that is not a URL', () => {
    process.env['EXPO_PUBLIC_SUPABASE_URL'] = 'project.supabase.co';
    resetEnvCache();
    expect(() => getEnv()).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
  });

  it('rejects a missing URL', () => {
    delete process.env['EXPO_PUBLIC_SUPABASE_URL'];
    resetEnvCache();
    expect(() => getEnv()).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
  });
});

describe('the key rule', () => {
  it('rejects a key that is too short to be real', () => {
    process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY'] = 'short';
    resetEnvCache();
    expect(() => getEnv()).toThrow(/EXPO_PUBLIC_SUPABASE_ANON_KEY/);
  });
});

describe('the error message', () => {
  it('names the variable but never the value', () => {
    // A configuration error goes to a crash reporter. The variable name is safe
    // to send; the value could be a key.
    //
    // The value has to be short enough to actually fail validation — the first
    // version of this test used a 20-character string, which passes the minimum,
    // so nothing threw and the assertion was checking an empty string.
    process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY'] = 'sk-live-oops';
    resetEnvCache();

    let message = '';
    try {
      getEnv();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('supabaseAnonKey');
    expect(message).not.toContain('sk-live-oops');
  });

  it('tells the reader how to fix it', () => {
    delete process.env['EXPO_PUBLIC_SUPABASE_URL'];
    resetEnvCache();
    expect(() => getEnv()).toThrow(/\.env\.example/);
  });
});

describe('booleans', () => {
  it.each([
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
    ['no', false],
  ])('reads %s as %s', (raw, expected) => {
    process.env['EXPO_PUBLIC_ENABLE_DEMO_DATA'] = raw;
    resetEnvCache();
    expect(getEnv().enableDemoData).toBe(expected);
  });

  it('falls back to the default when unset', () => {
    delete process.env['EXPO_PUBLIC_ENABLE_DEMO_DATA'];
    resetEnvCache();
    expect(isDemoDataEnabled()).toBe(true);
  });
});

describe('demo mode', () => {
  it('is off unless asked for', () => {
    // Forgetting the variable must produce the real app, never the fictional one.
    delete process.env['EXPO_PUBLIC_DEMO_MODE'];
    resetEnvCache();
    expect(getEnv().demoMode).toBe(false);
    expect(isDemoMode()).toBe(false);
  });

  it('can be switched on outside production', () => {
    process.env['EXPO_PUBLIC_DEMO_MODE'] = 'true';
    process.env['EXPO_PUBLIC_ENVIRONMENT'] = 'development';
    resetEnvCache();
    expect(isDemoMode()).toBe(true);
  });

  it('is refused in a production build', () => {
    // Demo mode serves an invented wallet with no backend. In production that
    // would mean showing fictional cards to a real user, so it fails the build
    // rather than warning. Refusing beats trusting a deployment checklist.
    process.env['EXPO_PUBLIC_DEMO_MODE'] = 'true';
    process.env['EXPO_PUBLIC_ENVIRONMENT'] = 'production';
    resetEnvCache();
    expect(() => getEnv()).toThrow(/must not be enabled in a production build/);
  });

  it('leaves production alone when it is off', () => {
    process.env['EXPO_PUBLIC_ENVIRONMENT'] = 'production';
    resetEnvCache();
    expect(() => getEnv()).not.toThrow();
    expect(isDemoMode()).toBe(false);
  });
});

describe('caching', () => {
  it('does not re-read until the cache is reset', () => {
    expect(getEnv().environment).toBe('development');

    process.env['EXPO_PUBLIC_ENVIRONMENT'] = 'production';
    expect(getEnv().environment).toBe('development');

    resetEnvCache();
    expect(getEnv().environment).toBe('production');
    expect(isProduction()).toBe(true);
  });
});

/**
 * The guard that would have caught the shipped defect.
 *
 * Reads the module's own source rather than its behaviour, because under Node the
 * broken and the fixed version behave identically — the difference only appears
 * after Metro has run.
 */
describe('the reads must survive bundling', () => {
  const source = readFileSync(join(__dirname, 'env.ts'), 'utf8');

  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it.each(KEYS)('reads %s as a static process.env member expression', (key) => {
    // Static dot access is the only form Metro inlines.
    expect(withoutComments).toContain(`process.env.${key}`);
  });

  it('never reads process.env through a computed key', () => {
    // `process.env[name]`, `process.env[key]`, `(process.env as ...)[x]` — any of
    // these silently yields undefined in a bundle.
    expect(withoutComments).not.toMatch(/process\.env\s*(as[^[]*)?\[/);
  });

  it('does not cast process.env to a record, which is how the bug was expressed', () => {
    expect(withoutComments).not.toMatch(/process\.env\s+as\s+Record/);
  });

  it('declares every variable it reads, so dot access typechecks', () => {
    // src/types/env.d.ts is what makes the static form legal under
    // noPropertyAccessFromIndexSignature. Without it the compiler pushes you
    // straight back to the computed access that caused the defect.
    //
    // It lives in src/types/ rather than beside env.ts because TypeScript treats
    // a sibling `env.d.ts` as the declaration output for `env.ts` and ignores its
    // global augmentations entirely — which looks exactly like the augmentation
    // not working.
    const declarations = readFileSync(join(__dirname, '..', 'types', 'env.d.ts'), 'utf8');
    for (const key of KEYS) {
      expect(declarations).toContain(key);
    }
  });
});
