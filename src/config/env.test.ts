/**
 * Environment configuration, and the source-shape guard that exists because of a real
 * boot-blocking defect.
 *
 * THE DEFECT THIS FILE EXISTS TO PREVENT
 * `readRawEnvironment` once read `process.env` through a computed key. Metro inlines
 * `EXPO_PUBLIC_*` by syntactically replacing each static `process.env.NAME` member
 * expression at build time, so a computed read is invisible to it: nothing is
 * substituted, `process.env` is an empty object on device and on the web, and the app
 * throws on boot with a perfectly correct `.env` sitting right there.
 *
 * Every behavioural test passed throughout, because Jest runs in Node where
 * `process.env` really is populated and dynamic access works. Only a check on the
 * *source text* could catch it, which is why the second half of this file reads
 * `env.ts` as a string.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getEnv, isProduction, resetEnvCache } from './env';

const MANAGED = [
  'EXPO_PUBLIC_ENVIRONMENT',
  'EXPO_PUBLIC_ANALYTICS_WRITE_KEY',
  'EXPO_PUBLIC_ERROR_MONITORING_DSN',
] as const;

const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of MANAGED) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  resetEnvCache();
});

afterEach(() => {
  for (const key of MANAGED) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetEnvCache();
});

describe('getEnv', () => {
  // The app has no backend, so a build with nothing configured is the normal case
  // rather than an error. Requiring a variable that configures nothing would make the
  // app unstartable for no reason.
  it('starts with no configuration at all', () => {
    expect(() => getEnv()).not.toThrow();
    expect(getEnv().environment).toBe('development');
  });

  it('reads the environment when one is set', () => {
    process.env['EXPO_PUBLIC_ENVIRONMENT'] = 'production';
    resetEnvCache();

    expect(getEnv().environment).toBe('production');
    expect(isProduction()).toBe(true);
  });

  it('refuses an environment name it does not recognise', () => {
    process.env['EXPO_PUBLIC_ENVIRONMENT'] = 'prod';
    resetEnvCache();

    expect(() => getEnv()).toThrow(/Invalid environment configuration/);
  });

  it('treats a blank optional value as absent, not as an empty key', () => {
    process.env['EXPO_PUBLIC_ANALYTICS_WRITE_KEY'] = '';
    resetEnvCache();

    // An empty string would be sent to the telemetry SDK as a real key and fail
    // obscurely at the first event.
    expect(getEnv().analyticsWriteKey).toBeNull();
  });

  it('reads the optional telemetry endpoints when they are set', () => {
    process.env['EXPO_PUBLIC_ANALYTICS_WRITE_KEY'] = 'write-key-not-a-real-one';
    process.env['EXPO_PUBLIC_ERROR_MONITORING_DSN'] = 'https://example.test/dsn';
    resetEnvCache();

    expect(getEnv().analyticsWriteKey).toBe('write-key-not-a-real-one');
    expect(getEnv().errorMonitoringDsn).toBe('https://example.test/dsn');
  });

  it('caches, so repeated reads cannot disagree mid-session', () => {
    const first = getEnv();
    process.env['EXPO_PUBLIC_ENVIRONMENT'] = 'staging';

    expect(getEnv()).toBe(first);
    expect(getEnv().environment).toBe('development');
  });

  it('never mentions a value in a failure, only the variable', () => {
    process.env['EXPO_PUBLIC_ENVIRONMENT'] = 'sk-live-oops';
    resetEnvCache();

    // A crash report must not carry the setting that caused it.
    expect(() => getEnv()).toThrow(/environment/);
    expect(() => getEnv()).not.toThrow(/sk-live-oops/);
  });
});

describe('the source reads process.env in a form Metro can inline', () => {
  const source = readFileSync(join(__dirname, 'env.ts'), 'utf8');
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it.each(MANAGED)('reads %s as a static member expression', (name) => {
    expect(withoutComments).toContain(`process.env.${name}`);
  });

  // The actual defect, asserted directly. `process.env[name]`, `process.env[key]` and
  // `(process.env as Record<string, string>)[name]` are all invisible to the inliner.
  it('contains no computed access to process.env', () => {
    expect(withoutComments).not.toMatch(/process\.env\s*(as[^[]*)?\[/);
  });

  it('does not widen process.env to a Record, which invites computed access', () => {
    expect(withoutComments).not.toMatch(/process\.env\s+as\s+Record/);
  });

  // No backend means no URL and no key. If one reappeared here it would be a variable
  // the app does not use, shipped to the device, that someone would then try to fill in.
  it.each(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'DEMO_MODE'])('no longer reads %s', (name) => {
    expect(withoutComments).not.toContain(name);
  });
});
