/**
 * Tests for the account export document.
 *
 * The interesting test here is not that `buildAccountExport` copies arrays. It is
 * `every table holding personal data has a section`, which reads the migrations
 * and fails when the schema grows a table the export forgot. Without it, the
 * export's promise — "this is everything we hold about you" — would be a comment
 * rather than a claim, and the way that promise breaks is silent: a new table
 * ships, the export keeps working, and it is quietly incomplete.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildAccountExport,
  CIPHERTEXT_PLACEHOLDER,
  EXPORT_FORMAT_VERSION,
  SECTION_KEYS,
  exportFileName,
  serialiseAccountExport,
  totalRecords,
  type AccountExportInput,
  type SectionKey,
} from './exportDocument';

import type {
  AuditLogRow,
  PurchaseQueryRow,
  RecommendationCandidateRow,
  RecommendationRow,
  RewardRuleConditionRow,
  RewardRuleRow,
  RewardUsageRow,
  UserCardRow,
  UserOfferRow,
  UserRewardPreferenceRow,
  UserRow,
  UserRuleEnrollmentRow,
} from '@/types/database';

const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'supabase', 'migrations');

const allMigrationSql = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => readFileSync(join(MIGRATIONS_DIR, name), 'utf8'))
  .join('\n');

/**
 * Which database table each export section corresponds to.
 *
 * Written out longhand rather than derived, because the mapping is a decision:
 * `user_reward_preferences` is exported as "valuations" because that is what a
 * person calls it, and no amount of cleverness recovers that from the column
 * names.
 */
const SECTION_TABLES: Readonly<Record<SectionKey, string>> = {
  profile: 'users',
  cards: 'user_cards',
  valuations: 'user_reward_preferences',
  enrollments: 'user_rule_enrollments',
  offers: 'user_offers',
  rewardUsage: 'reward_usage',
  purchaseQueries: 'purchase_queries',
  recommendations: 'recommendations',
  recommendationCandidates: 'recommendation_candidates',
  customCardProducts: 'card_products',
  customRewardRules: 'reward_rules',
  customRuleConditions: 'reward_rule_conditions',
  auditTrail: 'audit_logs',
};

/**
 * Tables that hold personal data, read out of the RLS migration.
 *
 * Two signals, both of which mean "rows here belong to one user":
 *
 *   1. `force row level security` — migration 0008 applies it to exactly the
 *      tables holding user-owned rows, so that a misconfigured connection cannot
 *      read them. That list is maintained for a security reason, which makes it a
 *      reliable thing to key off: nobody adds a personal table and skips it.
 *   2. a policy named `*_own*` — the catalog tables hold a mix of shared rows and
 *      rows a user created (`is_user_defined and created_by = auth.uid()`), and
 *      those user rows are just as personal for being stored next to shared ones.
 */
function personalTablesFromMigrations(): ReadonlySet<string> {
  const forced = [
    ...allMigrationSql.matchAll(/alter table public\.(\w+)\s+force row level security/g),
  ].map((match) => match[1] as string);

  const ownScoped = [
    ...allMigrationSql.matchAll(/create policy (\w*_own\w*) on public\.(\w+)/g),
  ].map((match) => match[2] as string);

  return new Set([...forced, ...ownScoped]);
}

function card(overrides: Partial<UserCardRow> = {}): UserCardRow {
  return {
    id: 'card-1',
    user_id: 'user-1',
    card_product_id: 'product-1',
    nickname: 'Everyday',
    last_four_cipher: null,
    last_four_key_id: null,
    display_order: 0,
    is_archived: false,
    is_excluded_from_recommendations: false,
    account_opened_on: '2024-03-14',
    is_preferred: false,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const profile: UserRow = {
  id: 'user-1',
  email: 'someone@example.test',
  display_name: 'Someone',
  role: 'member',
  home_country_code: 'US',
  home_currency_code: 'USD',
  preferred_locale: 'en-US',
  disclaimers_accepted_version: '1',
  disclaimers_accepted_at: '2026-01-01T00:00:00.000Z',
  onboarding_completed_at: '2026-01-01T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function input(overrides: Partial<AccountExportInput> = {}): AccountExportInput {
  return {
    profile,
    cards: [card()],
    valuations: [] as readonly UserRewardPreferenceRow[],
    enrollments: [] as readonly UserRuleEnrollmentRow[],
    offers: [] as readonly UserOfferRow[],
    rewardUsage: [] as readonly RewardUsageRow[],
    purchaseQueries: [] as readonly PurchaseQueryRow[],
    recommendations: [] as readonly RecommendationRow[],
    recommendationCandidates: [] as readonly RecommendationCandidateRow[],
    customCardProducts: [],
    customRewardRules: [] as readonly RewardRuleRow[],
    customRuleConditions: [] as readonly RewardRuleConditionRow[],
    auditTrail: [] as readonly AuditLogRow[],
    ...overrides,
  };
}

const EXPORTED_AT = new Date('2026-07-26T15:30:00.000Z');

describe('export completeness', () => {
  it('has a section for every table holding personal data', () => {
    const personal = personalTablesFromMigrations();
    const covered = new Set(Object.values(SECTION_TABLES));

    const missing = [...personal].filter((table) => !covered.has(table)).sort();

    // The message names the table, because "expected 13 to be 14" would send the
    // next person hunting through the migrations for something this test already
    // knows.
    expect(missing).toEqual([]);
  });

  it('found the personal tables it claims to check, rather than an empty set', () => {
    // Guards the guard: a regex that silently stops matching would make the test
    // above pass for the wrong reason.
    const personal = personalTablesFromMigrations();
    expect(personal.size).toBeGreaterThanOrEqual(12);
    expect(personal).toContain('user_cards');
    expect(personal).toContain('card_products');
    expect(personal).toContain('audit_logs');
  });

  it('maps every section key to a table that exists in the migrations', () => {
    for (const key of SECTION_KEYS) {
      const table = SECTION_TABLES[key];
      expect(allMigrationSql).toContain(`create table public.${table} `);
    }
  });

  it('counts every section, so no section can be present but untallied', () => {
    const document = buildAccountExport(input(), EXPORTED_AT);
    for (const key of SECTION_KEYS) {
      expect(document.counts[key]).toBeDefined();
    }
    expect(Object.keys(document.counts).sort()).toEqual([...SECTION_KEYS].sort());
  });
});

describe('buildAccountExport', () => {
  it('stamps the version and the caller-supplied time', () => {
    const document = buildAccountExport(input(), EXPORTED_AT);
    expect(document.formatVersion).toBe(EXPORT_FORMAT_VERSION);
    expect(document.exportedAt).toBe('2026-07-26T15:30:00.000Z');
  });

  it('carries the profile and rows through unchanged', () => {
    const document = buildAccountExport(input(), EXPORTED_AT);
    expect(document.profile).toEqual(profile);
    expect(document.cards).toHaveLength(1);
    expect(document.cards[0]?.nickname).toBe('Everyday');
  });

  // 1 profile + 1 card + 2 offers + 3 queries = 7
  it('totals the records across sections', () => {
    const document = buildAccountExport(
      input({
        offers: [{ id: 'o1' }, { id: 'o2' }] as unknown as readonly UserOfferRow[],
        purchaseQueries: [
          { id: 'q1' },
          { id: 'q2' },
          { id: 'q3' },
        ] as unknown as readonly PurchaseQueryRow[],
      }),
      EXPORTED_AT,
    );
    expect(totalRecords(document)).toBe(7);
  });

  it('reports one profile even though the profile is a single row, not an array', () => {
    const document = buildAccountExport(input(), EXPORTED_AT);
    expect(document.counts.profile).toBe(1);
  });
});

describe('encrypted card digits', () => {
  it('replaces the ciphertext with a marker rather than exporting it', () => {
    const document = buildAccountExport(
      input({
        cards: [card({ last_four_cipher: 'BASE64CIPHERTEXT==', last_four_key_id: 'key-1' })],
      }),
      EXPORTED_AT,
    );

    expect(document.cards[0]?.last_four_cipher).toBe(CIPHERTEXT_PLACEHOLDER);
    expect(document.cards[0]?.last_four_key_id).toBe(CIPHERTEXT_PLACEHOLDER);
    expect(serialiseAccountExport(document)).not.toContain('BASE64CIPHERTEXT');
    expect(serialiseAccountExport(document)).not.toContain('key-1');
  });

  it('leaves a card with no stored digits as null, not as the marker', () => {
    // "You gave us nothing" and "you gave us something we cannot show you" are
    // different facts, and the file should not conflate them.
    const document = buildAccountExport(input({ cards: [card()] }), EXPORTED_AT);
    expect(document.cards[0]?.last_four_cipher).toBeNull();
    expect(document.cards[0]?.last_four_key_id).toBeNull();
  });

  it('never emits four consecutive digits from a card field', () => {
    const document = buildAccountExport(
      input({ cards: [card({ last_four_cipher: '4111', last_four_key_id: '1234' })] }),
      EXPORTED_AT,
    );
    const serialisedCards = JSON.stringify(document.cards);
    expect(serialisedCards).not.toMatch(/"last_four_cipher":\s*"\d{4}"/);
    expect(serialisedCards).not.toMatch(/"last_four_key_id":\s*"\d{4}"/);
  });
});

describe('the notes in the file', () => {
  it('says what the placeholder means, since the file outlives the screen', () => {
    const document = buildAccountExport(input(), EXPORTED_AT);
    expect(document.notes.join(' ')).toContain(CIPHERTEXT_PLACEHOLDER);
  });

  it('states that no credential is stored, and does not name one as an example', () => {
    const document = buildAccountExport(input(), EXPORTED_AT);
    const notes = document.notes.join(' ');
    expect(notes).toContain('never stores a full card number');
    // The disclaimer must not itself read as an invitation to look for one.
    expect(notes).not.toMatch(/\b\d{13,19}\b/);
  });

  it('states that the reward figures are informational', () => {
    const document = buildAccountExport(input(), EXPORTED_AT);
    expect(document.notes.join(' ')).toContain('not an offer from any issuer');
  });
});

describe('serialisation', () => {
  it('produces indented JSON that round-trips', () => {
    const document = buildAccountExport(input(), EXPORTED_AT);
    const text = serialiseAccountExport(document);
    expect(text).toContain('\n  "formatVersion"');
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(document)));
  });

  it('names the file after the export time, with no characters a filesystem rejects', () => {
    expect(exportFileName(EXPORTED_AT)).toBe('walletwise-export-2026-07-26T15-30-00-000Z.json');
    expect(exportFileName(EXPORTED_AT)).not.toContain(':');
  });
});
