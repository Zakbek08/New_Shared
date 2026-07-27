#!/usr/bin/env node
/**
 * Asserts that a built bundle actually contains its configuration.
 *
 * WHY THIS EXISTS
 * `src/config/env.ts` once read `process.env` through a computed key. Metro
 * inlines `EXPO_PUBLIC_*` by syntactically replacing each static
 * `process.env.SOME_NAME` expression with a string literal, so a computed read is
 * invisible to it: nothing gets substituted, `process.env` is an empty object at
 * runtime, and the app cannot boot. Every unit test passed anyway, because Jest
 * runs in Node where dynamic access works.
 *
 * `env.test.ts` guards the *shape* of those reads at the source level. This guards
 * the *outcome* at the artefact level, which is the claim that actually matters: a
 * future change to Metro, babel-preset-expo or the tsconfig could break inlining
 * without touching a line of env.ts, and only a check against the built output
 * would notice.
 *
 * Run after `expo export`:
 *   node scripts/check-bundle.mjs <bundle-dir>
 *
 * Exits non-zero and names the missing variable, because "the bundle is broken"
 * is not an actionable message.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RED = '[31m';
const GREEN = '[32m';
const DIM = '[2m';
const RESET = '[0m';

const bundleDir = process.argv[2];

if (bundleDir === undefined) {
  process.stderr.write('Usage: node scripts/check-bundle.mjs <bundle-dir>\n');
  process.exit(1);
}

/**
 * The variables whose values must appear in the bundle.
 *
 * Only the ones with a value in the environment are checked: an unset optional
 * key legitimately has nothing to inline, and demanding it would fail a build
 * that is correct.
 */
const REQUIRED = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'];
const OPTIONAL = [
  'EXPO_PUBLIC_ENVIRONMENT',
  'EXPO_PUBLIC_ENABLE_DEMO_DATA',
  'EXPO_PUBLIC_ANALYTICS_WRITE_KEY',
  'EXPO_PUBLIC_ERROR_MONITORING_DSN',
];

/**
 * Below this length, finding a value in the bundle proves nothing.
 *
 * `EXPO_PUBLIC_ENVIRONMENT=development` and `EXPO_PUBLIC_ENABLE_DEMO_DATA=true`
 * are the motivating cases: both strings occur all over a React Native bundle for
 * unrelated reasons, so a substring match on them passes whether or not Metro
 * inlined anything. Reporting that as a tick would be worse than not checking —
 * it is a green light with no information behind it.
 *
 * The URL and the anon key are long and distinctive, which is why they are the
 * required checks and why they are sufficient: they exercise exactly the same
 * inlining path as every other variable.
 */
const MEANINGFUL_LENGTH = 16;

/**
 * The values the build actually used.
 *
 * `expo export` gives a `.env` file precedence over variables already exported in
 * the shell — verified, not assumed: with both set, only the `.env` value appeared
 * in the bundle. So this must read from the same place, or a local run compares
 * the bundle against values the build never saw and fails for no reason.
 *
 * In CI there is no `.env` (it is git-ignored), so the workflow's `env:` block is
 * the source. Both paths end up consistent, which is the point.
 */
function resolveExpectedValues() {
  const fromProcess = { ...process.env };

  if (!existsSync('.env')) {
    return { values: fromProcess, source: 'the environment' };
  }

  const values = { ...fromProcess };
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    values[trimmed.slice(0, separator).trim()] = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }

  return { values, source: '.env (which the build prefers over the shell)' };
}

/** Every JavaScript file in the bundle, concatenated. */
function readBundleSource(dir) {
  const files = [];

  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (entry.endsWith('.js')) files.push(path);
    }
  };

  walk(dir);

  if (files.length === 0) {
    process.stderr.write(
      `${RED}No .js files under ${dir}. Did the export run, and is this the right directory?${RESET}\n`,
    );
    process.exit(1);
  }

  return {
    text: files.map((file) => readFileSync(file, 'utf8')).join('\n'),
    count: files.length,
  };
}

const { text: bundle, count } = readBundleSource(bundleDir);
const { values: expected, source: valueSource } = resolveExpectedValues();

process.stdout.write(`${DIM}Read ${count} bundled JS file(s) from ${bundleDir}${RESET}\n`);
process.stdout.write(`${DIM}Comparing against values from ${valueSource}${RESET}\n`);

let failures = 0;

function check(name, isRequired) {
  const value = expected[name];

  if (value === undefined || value === '') {
    if (isRequired) {
      process.stderr.write(
        `${RED}✕ ${name} is not set in this environment, so the bundle cannot contain it.${RESET}\n` +
          `      Set it before building, or the app will not boot.\n`,
      );
      failures += 1;
    } else {
      process.stdout.write(`${DIM}· ${name} unset — nothing to inline, skipping${RESET}\n`);
    }
    return;
  }

  if (value.length < MEANINGFUL_LENGTH) {
    // Say so rather than print a tick that means nothing. A required variable
    // this short is itself suspicious, so it is still a failure.
    const note = `${name} is only ${value.length} characters — too short for a substring match to prove inlining`;
    if (isRequired) {
      process.stderr.write(`  ${RED}✕ ${note}, and it is required.${RESET}\n`);
      failures += 1;
    } else {
      process.stdout.write(`${DIM}· ${note}; not checked${RESET}\n`);
    }
    return;
  }

  if (bundle.includes(value)) {
    process.stdout.write(`  ${GREEN}✓${RESET} ${name} is inlined\n`);
    return;
  }

  failures += 1;
  process.stderr.write(
    `  ${RED}✕ ${name} is NOT inlined into the bundle.${RESET}\n` +
      `      The value is set in the environment but does not appear in the built output.\n` +
      `      That means Metro did not substitute it, and the app will throw\n` +
      `      "Invalid environment configuration" on boot.\n` +
      `      Check that src/config/env.ts reads it as a static process.env.${name}\n` +
      `      expression — a computed read like process.env[name] cannot be inlined.\n`,
  );
}

for (const name of REQUIRED) check(name, true);
for (const name of OPTIONAL) check(name, false);

// A literal `process.env[...]` surviving into the bundle is always wrong: at
// runtime process.env is empty, so the read yields undefined.
//
// This catches only the direct form. Assigning process.env to a local first and
// indexing that — `const e = process.env; e['KEY']` — compiles to something this
// pattern cannot see, and is exactly what the original defect did. So this is a
// cheap extra signal, not the load-bearing check; the value comparisons above are.
if (/process\.env\s*\[/.test(bundle)) {
  failures += 1;
  process.stderr.write(
    `  ${RED}✕ The bundle contains a literal computed read of process.env.${RESET}\n` +
      `      At runtime process.env is empty, so that read yields undefined.\n`,
  );
} else {
  process.stdout.write(
    `  ${GREEN}✓${RESET} no literal computed process.env access ${DIM}(indirect forms are not detectable here)${RESET}\n`,
  );
}

/**
 * No test code in a shipped bundle.
 *
 * Expo Router builds its route table from `require.context(app/)` over every `.tsx`
 * file, with no exclusion for test files. The three screen tests colocated beside their
 * screens were therefore registered as routes and bundled, dragging
 * `@testing-library/react-native` and `react-test-renderer` in behind them — 342 KB of
 * assertion library in the app a user downloads, and a dev server that refused to boot
 * because `react-test-renderer` is not a dependency of this app.
 *
 * `metro.config.js` now blocks `*.test.*`. This asserts the outcome rather than the
 * configuration, for the same reason the value checks above do: the config could be
 * correct and the mechanism still break, and only the artefact settles it.
 *
 * Both markers were confirmed against a deliberately broken build before being trusted —
 * the same negative control the rest of this repo's guards get. A third candidate,
 * `@testing-library/react-native`, was dropped after that control: the module *name* does
 * not survive bundling even when its code does, so it reported clean on a bundle that was
 * demonstrably contaminated. A tick with nothing behind it is worse than no check, which
 * is the same reasoning as MEANINGFUL_LENGTH above.
 *
 * `toBeTruthy` is the load-bearing one, because it is the assertion surface rather than a
 * package name: nothing in this app calls it, so its presence means a test file is in here.
 */
const FORBIDDEN_IN_BUNDLE = [
  ['react-test-renderer', 'the React test renderer'],
  ['toBeTruthy', 'a Jest matcher'],
];

for (const [marker, description] of FORBIDDEN_IN_BUNDLE) {
  if (bundle.includes(marker)) {
    failures += 1;
    process.stderr.write(
      `  ${RED}✕ The bundle contains ${JSON.stringify(marker)} — ${description}.${RESET}\n` +
        `      A test file has been pulled into the app bundle. The usual cause is a\n` +
        `      *.test.tsx file under app/, which Expo Router turns into a route.\n` +
        `      Check the blockList in metro.config.js still covers it.\n`,
    );
  } else {
    process.stdout.write(`  ${GREEN}✓${RESET} bundle is free of ${description}\n`);
  }
}

if (failures > 0) {
  process.stderr.write(`\n${RED}${failures} bundle check(s) failed.${RESET}\n`);
  process.exit(1);
}

process.stdout.write(`\n${GREEN}Bundle configuration is inlined correctly.${RESET}\n`);
