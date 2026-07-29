#!/usr/bin/env node
/**
 * Starts the dev server against the bundled demonstration wallet.
 *
 * WHY A SCRIPT AND NOT AN npm SCRIPT WITH INLINE VARIABLES
 * `FOO=bar expo start` is shell syntax that Windows `cmd` does not understand, and the
 * usual fix — a `cross-env` dependency — is a lot of supply chain for four assignments.
 * Node sets environment variables the same way everywhere.
 *
 * WHY --offline
 * `expo start` contacts Expo's servers for a routine dependency-version check before it
 * opens anything, and on a restricted or offline network that failure is fatal and
 * inscrutable: `SyntaxError: Unexpected token 'H', "Host not i"... is not valid JSON`,
 * which names neither the network nor the check. Skipping it costs a warning we do not
 * need — `npm run verify` already pins dependency versions far more strictly.
 *
 * NOTHING HERE IS A SECRET, and the placeholder values are written so that is obvious.
 * In demo mode `getSupabaseClient()` returns a proxy that throws on any use, so the URL
 * and key are never dialled. They exist because `getEnv()` validates their shape at boot,
 * deliberately: a real build must not start with configuration missing.
 */
import { spawn } from 'node:child_process';

const environment = {
  ...process.env,
  EXPO_PUBLIC_DEMO_MODE: 'true',
  // `.invalid` is reserved by RFC 2606 and can never resolve, so if a demo build ever did
  // try to reach a backend it would fail immediately and loudly rather than hang.
  EXPO_PUBLIC_SUPABASE_URL: 'https://demo-mode-no-backend.invalid',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'demo-mode-no-key-is-used-this-is-not-a-secret',
  // Never `production`: getEnv() refuses demo mode in a production build, so this would
  // throw at boot. That refusal is the point — demo data must not reach a real release.
  EXPO_PUBLIC_ENVIRONMENT: 'development',
  EXPO_PUBLIC_ENABLE_DEMO_DATA: 'true',
  EXPO_OFFLINE: '1',
};

process.stdout.write(
  'Starting WalletWise with the bundled demonstration wallet.\n' +
    'No database and no account are needed. Every card and rate is fictional.\n\n',
);

const child = spawn('npx', ['expo', 'start', '--web', '--offline', ...process.argv.slice(2)], {
  env: environment,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code) => process.exit(code ?? 0));
