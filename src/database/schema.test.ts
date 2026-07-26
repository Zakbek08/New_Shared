/**
 * Structural tests over the SQL itself.
 *
 * The security requirements in SECURITY.md are properties of the schema, not of
 * any one code path, so they are asserted against the migration files directly.
 * A migration that adds a forbidden column, or forgets RLS on a user-owned
 * table, fails here — before it reaches a database.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase', 'migrations');
const SEED_DIR = join(__dirname, '..', '..', 'supabase', 'seed');

const readSqlDir = (dir: string): { name: string; sql: string }[] =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }));

const migrations = readSqlDir(MIGRATIONS_DIR);
const seeds = readSqlDir(SEED_DIR);
const allMigrationSql = migrations.map((file) => file.sql).join('\n');
const allSeedSql = seeds.map((file) => file.sql).join('\n');

/** A single seed file, so counts can be scoped to the insert that owns them. */
const seedFile = (namePart: string): string => {
  const match = seeds.find((file) => file.name.includes(namePart));
  if (match === undefined) throw new Error(`No seed file matching "${namePart}"`);
  return match.sql;
};

/**
 * SQL types used in this schema. Requiring one lets a column-definition regex
 * distinguish `  last_four_cipher text,` from a CHECK constraint body that
 * happens to start a line with the same identifier.
 */
const SQL_TYPE =
  '(?:text|bytea|uuid|boolean|integer|bigint|smallint|numeric|date|timestamptz|char|citext|jsonb|extensions\\.citext|int4range|tsrange|tstzrange|public\\.\\w+)';

/** Every table the specification requires. */
const REQUIRED_TABLES = [
  'users',
  'issuers',
  'card_products',
  'reward_programs',
  'reward_rules',
  'reward_rule_conditions',
  'merchant_categories',
  'merchants',
  'user_cards',
  'user_reward_preferences',
  'user_rule_enrollments',
  'user_offers',
  'reward_usage',
  'purchase_queries',
  'recommendations',
  'recommendation_candidates',
  'sources',
  'verification_history',
  'audit_logs',
] as const;

/** Tables holding rows owned by one user. Each needs owner-scoped RLS. */
const USER_OWNED_TABLES = [
  'users',
  'user_cards',
  'user_reward_preferences',
  'user_rule_enrollments',
  'user_offers',
  'reward_usage',
  'purchase_queries',
  'recommendations',
  'recommendation_candidates',
  'audit_logs',
] as const;

describe('migrations', () => {
  it('exist and are ordered by a sortable timestamp prefix', () => {
    expect(migrations.length).toBeGreaterThan(0);
    for (const { name } of migrations) {
      expect(name).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    }
  });

  it.each(REQUIRED_TABLES)('creates the %s table', (table) => {
    expect(allMigrationSql).toMatch(new RegExp(`create table public\\.${table}\\b`));
  });

  it('creates no table outside the required set', () => {
    const created = [...allMigrationSql.matchAll(/create table public\.(\w+)/g)].map(
      (match) => match[1],
    );
    expect(created.sort()).toEqual([...REQUIRED_TABLES].sort());
  });
});

describe('SECURITY: no payment credentials anywhere in the schema', () => {
  /**
   * Column definitions that must never exist. Matched against the start of a
   * column definition line so a *comment* mentioning `cvv` — of which there are
   * several, deliberately — does not trip the check.
   */
  const FORBIDDEN_COLUMNS = [
    'card_number',
    'cardnumber',
    'pan',
    'account_number',
    'full_card_number',
    'cvv',
    'cvc',
    'cid',
    'security_code',
    'pin',
    'bank_password',
    'password',
    'security_answer',
    'expiry',
    'expiration_date',
  ];

  it.each(FORBIDDEN_COLUMNS)('declares no column named %s', (column) => {
    // A column definition looks like `  <name> <sql type>` at the start of a
    // line. Requiring a real type keyword means a comment or a CHECK body that
    // mentions the word — of which there are several, deliberately — does not
    // produce a false positive.
    const definition = new RegExp(`^\\s+${column}\\s+${SQL_TYPE}\\b`, 'im');
    expect(allMigrationSql).not.toMatch(definition);
  });

  it('stores only an encrypted last four, and only on user_cards', () => {
    const digitColumns = [
      ...allMigrationSql.matchAll(new RegExp(`^\\s+(last_four\\w*)\\s+${SQL_TYPE}\\b`, 'gim')),
    ].map((match) => match[1]);
    expect(digitColumns.sort()).toEqual(['last_four_cipher', 'last_four_key_id']);
  });

  it('rejects plaintext digits in last_four_cipher with a CHECK constraint', () => {
    expect(allMigrationSql).toMatch(/user_cards_last_four_not_plaintext/);
    expect(allMigrationSql).toMatch(/last_four_cipher\s*!~\s*'\^\[0-9\]\{1,19\}\$'/);
  });

  it('requires a key id whenever ciphertext is present', () => {
    expect(allMigrationSql).toMatch(/user_cards_cipher_requires_key_id/);
  });

  it('blocks credential keys from the audit log context', () => {
    expect(allMigrationSql).toMatch(/audit_logs_no_credential_keys/);
    for (const key of ['cvv', 'pin', 'password', 'card_number']) {
      expect(allMigrationSql).toMatch(new RegExp(`'${key}'`));
    }
  });

  it('records changed column names in the audit log, never values', () => {
    expect(allMigrationSql).toMatch(/changed_columns text\[\]/);
    expect(allMigrationSql).not.toMatch(/^\s+(old_value|new_value|changed_values)\s+\w/im);
  });
});

describe('SECURITY: row-level security', () => {
  it.each(REQUIRED_TABLES)('enables RLS on %s', (table) => {
    expect(allMigrationSql).toMatch(
      new RegExp(`alter table public\\.${table}\\s+enable row level security`),
    );
  });

  it.each(USER_OWNED_TABLES)(
    'forces RLS on %s, so the table owner cannot bypass it',
    (table) => {
      expect(allMigrationSql).toMatch(
        new RegExp(`alter table public\\.${table}\\s+force row level security`),
      );
    },
  );

  it.each(REQUIRED_TABLES)('defines at least one policy on %s', (table) => {
    expect(allMigrationSql).toMatch(new RegExp(`create policy \\w+ on public\\.${table}\\b`));
  });

  it('grants nothing to the anonymous role', () => {
    expect(allMigrationSql).toMatch(/revoke all on all tables in schema public from anon/);
  });

  it('scopes every policy to the authenticated role', () => {
    const policies = [
      ...allMigrationSql.matchAll(/create policy (\w+) on public\.\w+[\s\S]*?;/g),
    ];
    expect(policies.length).toBeGreaterThan(20);
    for (const [statement, name] of policies) {
      expect(statement).toMatch(/to authenticated/);
      expect(name).toBeTruthy();
    }
  });

  it('scopes user-owned reads to auth.uid()', () => {
    for (const table of ['user_cards', 'user_offers', 'reward_usage', 'purchase_queries']) {
      const policy = new RegExp(
        `create policy ${table}_select on public\\.${table}[\\s\\S]*?using \\(user_id = auth\\.uid\\(\\)\\)`,
      );
      expect(allMigrationSql).toMatch(policy);
    }
  });

  it('pins the user role in the self-update policy, blocking self-promotion', () => {
    expect(allMigrationSql).toMatch(
      /create policy users_update_self[\s\S]*?role = \(select u\.role from public\.users u where u\.id = auth\.uid\(\)\)/,
    );
  });

  it('defines no update or delete policy on the append-only tables', () => {
    for (const table of ['verification_history', 'audit_logs']) {
      const forbidden = new RegExp(
        `create policy \\w+ on public\\.${table}\\s+for (update|delete)`,
      );
      expect(allMigrationSql).not.toMatch(forbidden);
    }
  });

  it('defines no update policy on purchase_queries, which are immutable records', () => {
    expect(allMigrationSql).not.toMatch(
      /create policy \w+ on public\.purchase_queries\s+for update/,
    );
  });

  it('pins search_path on every SECURITY DEFINER function', () => {
    const definers = [...allMigrationSql.matchAll(/security definer([\s\S]*?)(?:as \$\$)/g)];
    expect(definers.length).toBeGreaterThan(0);
    for (const [body] of definers) {
      expect(body).toMatch(/set search_path = /);
    }
  });
});

describe('reward rule integrity constraints', () => {
  it.each([
    'reward_rules_window_ordered',
    'reward_rules_cap_needs_period',
    'reward_rules_period_needs_cap',
    'reward_rules_fixed_needs_amount',
    'reward_rules_rate_needs_value',
    'reward_rules_unit_matches_type',
    'reward_rules_verified_needs_evidence',
  ])('declares the %s constraint', (constraint) => {
    expect(allMigrationSql).toMatch(new RegExp(`constraint ${constraint}`));
  });

  it('requires a reason on every ineligible recommendation candidate', () => {
    expect(allMigrationSql).toMatch(/recommendation_candidates_ineligible_has_code/);
  });

  it('forbids a negative advantage over the runner-up', () => {
    expect(allMigrationSql).toMatch(/advantage_over_runner_up_usd >= 0/);
  });
});

describe('seed data', () => {
  it('defines exactly ten fictional card products', () => {
    const products = [
      ...allSeedSql.matchAll(/'55555555-0000-4000-8000-0000000000\d{2}',\s*'demo-/g),
    ];
    expect(products).toHaveLength(10);
  });

  it('prefixes every demonstration name with DEMO', () => {
    const names = [...allSeedSql.matchAll(/'(DEMO — [^']+)'/g)].map((match) => match[1]);
    expect(names.length).toBeGreaterThan(20);
  });

  it('covers each required demonstration archetype', () => {
    for (const archetype of [
      'demo-northwind-everyday-grocery',
      'demo-cobalt-table-dining',
      'demo-meridian-fuel-advantage',
      'demo-summit-ridge-voyager',
      'demo-harborline-quarterly-rotator',
      'demo-cobalt-everyday-flat',
      'demo-northwind-tappay',
      'demo-meridian-online-shopper',
      'demo-harborline-stay-rewards',
      'demo-summit-sky-alliance',
    ]) {
      expect(allSeedSql).toContain(archetype);
    }
  });

  it('marks every seeded issuer, program, merchant and product as fictional', () => {
    // `is_fictional` defaults to false, so the seed must pass true explicitly.
    for (const table of ['issuers', 'reward_programs', 'merchants', 'card_products']) {
      expect(allSeedSql).toMatch(new RegExp(`insert into public\\.${table}`));
    }
    expect(allSeedSql).not.toMatch(/is_fictional[^)]*\)\s*values[\s\S]*?,\s*false\s*\)/);
  });

  it('seeds all thirteen quick categories', () => {
    // Scoped to the taxonomy file: the same UUIDs are referenced again by the
    // rule conditions, so counting them across every seed file would overcount.
    const taxonomy = seedFile('reference_taxonomy');
    const ids = new Set(
      [...taxonomy.matchAll(/'(33333333-0000-4000-8000-\w{12})'/g)].map((match) => match[1]),
    );
    expect(ids.size).toBe(13);
  });

  it('seeds the category slugs the purchase form renders', () => {
    const taxonomy = seedFile('reference_taxonomy');
    for (const slug of [
      'dining',
      'grocery',
      'gas',
      'airfare',
      'hotel',
      'general_travel',
      'transit',
      'pharmacy',
      'online_shopping',
      'entertainment',
      'warehouse_club',
      'utilities',
      'other',
    ]) {
      expect(taxonomy).toMatch(new RegExp(`'${slug}',`));
    }
  });

  it('includes merchants with deliberately ambiguous coding, for the amber path', () => {
    const ambiguous = [...allSeedSql.matchAll(/'US', true, false,/g)];
    expect(ambiguous.length).toBeGreaterThanOrEqual(2);
    expect(allSeedSql).toContain('bulkbarn-warehouse');
    expect(allSeedSql).toContain('fuelworks-express-mart');
  });

  it('includes an expired, a stale and an unverified rule for the confidence paths', () => {
    expect(allSeedSql).toMatch(/'retired'/);
    expect(allSeedSql).toMatch(/'stale'/);
    expect(allSeedSql).toMatch(/'unverified'/);
    expect(allSeedSql).toMatch(/'user_reported'/);
  });

  it('creates no user-owned rows, which are the app and RLS to create', () => {
    for (const table of ['users', 'user_cards', 'user_offers', 'reward_usage']) {
      expect(allSeedSql).not.toMatch(new RegExp(`insert into public\\.${table}\\b`));
    }
  });
});
