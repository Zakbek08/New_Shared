#!/usr/bin/env node
/**
 * Runs the database integration tests against a real PostgreSQL cluster.
 *
 * WHY THIS IS A SEPARATE COMMAND AND NOT PART OF `npm test`
 * It needs a Postgres binary on the machine. Wiring it into the unit suite would
 * mean either failing on every machine without Postgres, or skipping silently —
 * and a suite that silently skips its most important tests is worse than one that
 * does not claim to run them. So: `npm test` is unit tests, `npm run test:db` is
 * this, and both are named honestly in TESTING.md.
 *
 * What it does:
 *   1. creates a throwaway cluster in a temp directory;
 *   2. applies every migration, then the fictional seed data;
 *   3. applies the test bootstrap (the `auth` shim and assertion helpers);
 *   4. runs the RLS matrix and the cap-window cross-check;
 *   5. prints every assertion and exits non-zero if any failed.
 *
 * The cluster is deleted afterwards, pass or fail.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chownSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PG_BIN_CANDIDATES = [
  '/usr/lib/postgresql/16/bin',
  '/usr/lib/postgresql/15/bin',
  '/usr/lib/postgresql/14/bin',
  '/usr/local/pgsql/bin',
];

const RED = '[31m';
const GREEN = '[32m';
const DIM = '[2m';
const RESET = '[0m';

function findPgBin() {
  for (const dir of PG_BIN_CANDIDATES) {
    if (existsSync(join(dir, 'initdb')) && existsSync(join(dir, 'postgres'))) return dir;
  }
  return null;
}

const pgBin = findPgBin();

if (pgBin === null) {
  process.stderr.write(
    'PostgreSQL server binaries were not found.\n\n' +
      'These tests execute the real row-level-security policies, so they need a\n' +
      'Postgres server — not just `psql`. Install one and re-run:\n\n' +
      '  Debian/Ubuntu:  sudo apt-get install postgresql\n' +
      '  macOS:          brew install postgresql@16\n' +
      '  Supabase CLI:   supabase start   (then point PGHOST/PGPORT at it)\n\n' +
      'Exiting non-zero: this command makes no claim it cannot back up.\n',
  );
  process.exit(1);
}

const dataDir = mkdtempSync(join(tmpdir(), 'walletwise-pg-'));
const socketDir = mkdtempSync(join(tmpdir(), 'walletwise-sock-'));
const DB = 'walletwise_test';
const serverLog = join(socketDir, 'postgres.log');

/**
 * Postgres refuses to run as root, and containers commonly are root.
 *
 * When that is the case the server and client commands are run as the `postgres`
 * system user via `setpriv`, and the temp directories are handed to it. This is
 * not a security measure — it is what `initdb` insists on, for the good reason
 * that a root-owned cluster is a foot-gun.
 */
const RUNNING_AS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;

function resolvePostgresIds() {
  if (!RUNNING_AS_ROOT) return null;

  try {
    const uid = Number(execFileSync('id', ['-u', 'postgres'], { encoding: 'utf8' }).trim());
    const gid = Number(execFileSync('id', ['-g', 'postgres'], { encoding: 'utf8' }).trim());
    if (Number.isInteger(uid) && Number.isInteger(gid)) return { uid, gid };
  } catch {
    // No `postgres` account. Reported below rather than guessed at.
  }
  return null;
}

const postgresIds = resolvePostgresIds();

if (RUNNING_AS_ROOT && postgresIds === null) {
  process.stderr.write(
    'Running as root, and there is no `postgres` system account to drop to.\n' +
      'PostgreSQL refuses to run as root. Create the account, or run this command\n' +
      'as an unprivileged user.\n',
  );
  process.exit(1);
}

if (postgresIds !== null) {
  chownSync(dataDir, postgresIds.uid, postgresIds.gid);
  chownSync(socketDir, postgresIds.uid, postgresIds.gid);
}

/** Wraps a command so it runs as `postgres` when this process is root. */
function asUnprivileged(binary, args) {
  if (postgresIds === null) return { file: binary, args };
  return {
    file: 'setpriv',
    args: [
      `--reuid=${postgresIds.uid}`,
      `--regid=${postgresIds.gid}`,
      '--clear-groups',
      binary,
      ...args,
    ],
  };
}

/** Runs a Postgres binary, throwing with its output on failure. */
function pg(binary, args, options = {}) {
  const { file, args: wrapped } = asUnprivileged(join(pgBin, binary), args);
  return execFileSync(file, wrapped, {
    encoding: 'utf8',
    stdio: options.inherit === true ? 'inherit' : 'pipe',
    env: { ...process.env, PGHOST: socketDir, PGDATABASE: DB },
  });
}

/** Runs SQL and returns stdout. `strict` fails the run on the first SQL error. */
function psql(args, { strict = true } = {}) {
  const { file, args: wrapped } = asUnprivileged(join(pgBin, 'psql'), [
    '--host',
    socketDir,
    '--dbname',
    DB,
    '--username',
    'postgres',
    '--no-psqlrc',
    '--quiet',
    ...(strict ? ['--set', 'ON_ERROR_STOP=1'] : []),
    ...args,
  ]);

  const result = spawnSync(file, wrapped, {
    encoding: 'utf8',
    env: { ...process.env, PGHOST: socketDir },
  });

  if (strict && result.status !== 0) {
    throw new Error(`psql failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

let started = false;

function shutdown() {
  if (started) {
    try {
      pg('pg_ctl', ['-D', dataDir, '-m', 'immediate', 'stop']);
    } catch {
      // The cluster may already be down; the directory removal below is what
      // matters and it happens either way.
    }
  }
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(socketDir, { recursive: true, force: true });
}

process.on('exit', shutdown);

try {
  process.stdout.write(`${DIM}Creating a throwaway cluster…${RESET}\n`);
  pg('initdb', ['-D', dataDir, '--username', 'postgres', '--auth', 'trust', '--no-sync']);

  // `-l` is not optional. Without it the server inherits this process's stdout
  // pipe and never closes it, so execFileSync waits on EOF forever even though
  // pg_ctl itself has already exited. The log is also what a startup failure is
  // diagnosed from, so it is echoed in the catch below.
  pg('pg_ctl', [
    '-D',
    dataDir,
    '-l',
    serverLog,
    '-o',
    `-c listen_addresses='' -c unix_socket_directories='${socketDir}' -c fsync=off`,
    '-w',
    'start',
  ]);
  started = true;

  pg('createdb', ['--host', socketDir, '--username', 'postgres', DB]);

  // ---- Schema ------------------------------------------------------------
  // The bootstrap runs first: the migrations reference `auth.users` and
  // `auth.uid()`, which only exist in a real Supabase project.
  process.stdout.write(`${DIM}Applying the auth shim…${RESET}\n`);
  psql(['--file', join(ROOT, 'supabase/tests/00_bootstrap.sql')]);

  const migrationsDir = join(ROOT, 'supabase/migrations');
  const migrations = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  process.stdout.write(`${DIM}Applying ${migrations.length} migrations…${RESET}\n`);
  for (const migration of migrations) {
    psql(['--file', join(migrationsDir, migration)]);
  }

  const seedDir = join(ROOT, 'supabase/seed');
  const seeds = readdirSync(seedDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  process.stdout.write(`${DIM}Loading ${seeds.length} seed files…${RESET}\n`);
  for (const seed of seeds) {
    psql(['--file', join(seedDir, seed)]);
  }

  // The helpers are re-applied because the migrations recreate `public`-schema
  // grants; running them again is idempotent and keeps the ordering obvious.
  psql(['--file', join(ROOT, 'supabase/tests/00_bootstrap.sql')]);

  // ---- Generate the cap-window cross-check -------------------------------
  // The expected values come from the TypeScript implementation, so this compares
  // the two implementations of the same rule rather than comparing SQL to itself.
  process.stdout.write(`${DIM}Generating the cap-window comparison…${RESET}\n`);
  const { generateCapWindowSql } = await import('./capWindowFixture.mjs');
  const capWindowSql = join(dataDir, 'cap_windows.sql');
  writeFileSync(capWindowSql, generateCapWindowSql());

  // ---- Run the tests -----------------------------------------------------
  process.stdout.write(`${DIM}Running the RLS matrix…${RESET}\n`);
  psql(['--file', join(ROOT, 'supabase/tests/10_rls.sql')]);

  process.stdout.write(`${DIM}Running the cap-window cross-check…${RESET}\n`);
  psql(['--file', capWindowSql]);

  // ---- Report ------------------------------------------------------------
  const report = psql([
    '--no-align',
    '--tuples-only',
    '--field-separator',
    '',
    '--command',
    "select passed, name, coalesce(detail, '') from wwtest.results order by id",
  ]);

  const rows = report.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [passed, name, detail] = line.split('');
      return { passed: passed === 't', name, detail };
    });

  let failures = 0;
  for (const row of rows) {
    if (row.passed) {
      process.stdout.write(`  ${GREEN}✓${RESET} ${row.name}\n`);
    } else {
      failures += 1;
      process.stdout.write(`  ${RED}✕ ${row.name}${RESET}\n      ${row.detail}\n`);
    }
  }

  process.stdout.write(
    `\n${rows.length} assertions, ${rows.length - failures} passed, ${failures} failed\n`,
  );

  if (rows.length === 0) {
    process.stderr.write(
      `${RED}No assertions ran. The test files loaded but recorded nothing — treat this as a failure.${RESET}\n`,
    );
    process.exit(1);
  }

  process.exit(failures === 0 ? 0 : 1);
} catch (error) {
  process.stderr.write(
    `${RED}${error instanceof Error ? error.message : String(error)}${RESET}\n`,
  );

  // The server log is the only place a startup or crash reason appears, and the
  // shutdown handler is about to delete it.
  if (existsSync(serverLog)) {
    process.stderr.write(
      `${DIM}--- postgres log ---${RESET}\n${readFileSync(serverLog, 'utf8')}\n`,
    );
  }
  process.exit(1);
}
