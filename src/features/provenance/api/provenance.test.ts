/**
 * The provenance read.
 *
 * What is asserted here is mostly *what was sent*, because this file's job is to ask
 * the right two questions and stitch the answers together. In particular:
 *
 *   - an empty rule list must not reach the database at all, because PostgREST rejects
 *     `in.()` and the failure would surface as an opaque error on a screen that simply
 *     had nothing to show;
 *   - history must be attached to the right rule, since attaching one rule's change log
 *     to another would misattribute evidence, which is worse than showing none;
 *   - a rule that no longer exists must be dropped rather than filled in.
 */
import {
  createSupabaseFake,
  postgrestError,
  type SupabaseFake,
} from '@/test-support/supabaseFake';

const fakeRef: { current: SupabaseFake | null } = { current: null };

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => fakeRef.current?.client,
  resetSupabaseClient: jest.fn(),
}));

import { listRuleProvenance } from './provenance';

function useFake(config: Parameters<typeof createSupabaseFake>[0]) {
  const fake = createSupabaseFake(config);
  fakeRef.current = fake;
  return fake;
}

const sourceRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'source-1',
  label: 'Northwind Grocery Card terms',
  url: 'https://example.test/terms',
  publisher: 'Northwind Financial',
  document_type: 'issuer_terms',
  published_on: '2026-06-15',
  retrieved_on: '2026-07-01',
  notes: null,
  is_fictional: false,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  ...overrides,
});

const ruleRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'rule-1',
  label: '6% at supermarkets',
  verification_status: 'verified',
  last_verified_at: '2026-07-01T00:00:00.000Z',
  sources: sourceRow(),
  ...overrides,
});

const historyRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'event-1',
  reward_rule_id: 'rule-1',
  source_id: 'source-1',
  previous_status: 'unverified',
  new_status: 'verified',
  verified_base_rate: 1,
  verified_bonus_rate: 5,
  verified_at: '2026-07-01T00:00:00.000Z',
  verified_by: null,
  note: 'Initial load.',
  created_at: '2026-07-01T00:00:00.000Z',
  sources: { label: 'Northwind Grocery Card terms' },
  ...overrides,
});

afterEach(() => {
  fakeRef.current = null;
});

describe('listRuleProvenance', () => {
  it('sends nothing at all for an empty rule list', async () => {
    const fake = useFake({});

    await expect(listRuleProvenance([])).resolves.toEqual([]);
    expect(fake.tables).toEqual([]);
  });

  it('reads the rules and their history, and nothing else', async () => {
    const fake = useFake({
      results: [{ data: [ruleRow()] }, { data: [historyRow()] }],
    });

    await listRuleProvenance(['rule-1']);

    expect(fake.tables).toEqual(['reward_rules', 'verification_history']);
    // Filtered by id, not fetched wholesale and filtered here.
    expect(fake.calls).toEqual(
      expect.arrayContaining([
        { method: 'in', args: ['id', ['rule-1']] },
        { method: 'in', args: ['reward_rule_id', ['rule-1']] },
      ]),
    );
  });

  it('deduplicates ids, so two rules citing one document ask once', async () => {
    const fake = useFake({
      results: [{ data: [ruleRow()] }, { data: [] }],
    });

    await listRuleProvenance(['rule-1', 'rule-1', 'rule-2', 'rule-1']);

    expect(fake.calls).toEqual(
      expect.arrayContaining([{ method: 'in', args: ['id', ['rule-1', 'rule-2']] }]),
    );
  });

  it('camel-cases the source at the boundary', async () => {
    useFake({ results: [{ data: [ruleRow()] }, { data: [] }] });

    const [entry] = await listRuleProvenance(['rule-1']);

    expect(entry?.source).toEqual({
      id: 'source-1',
      label: 'Northwind Grocery Card terms',
      url: 'https://example.test/terms',
      publisher: 'Northwind Financial',
      documentType: 'issuer_terms',
      publishedOn: '2026-06-15',
      retrievedOn: '2026-07-01',
      notes: null,
      isFictional: false,
    });
  });

  it('reports a rule with no source as having none, rather than failing', async () => {
    useFake({ results: [{ data: [ruleRow({ sources: null })] }, { data: [] }] });

    const [entry] = await listRuleProvenance(['rule-1']);

    expect(entry?.source).toBeNull();
    expect(entry?.ruleLabel).toBe('6% at supermarkets');
  });

  // Misattributing a change log is worse than showing none: it would present one
  // rule's evidence as another's.
  it('attaches each history entry to its own rule', async () => {
    useFake({
      results: [
        { data: [ruleRow({ id: 'rule-1' }), ruleRow({ id: 'rule-2', label: '2% flat' })] },
        {
          data: [
            historyRow({ id: 'event-a', reward_rule_id: 'rule-2' }),
            historyRow({ id: 'event-b', reward_rule_id: 'rule-1' }),
            historyRow({ id: 'event-c', reward_rule_id: 'rule-2' }),
          ],
        },
      ],
    });

    const entries = await listRuleProvenance(['rule-1', 'rule-2']);

    expect(entries[0]?.history.map((event) => event.id)).toEqual(['event-b']);
    expect(entries[1]?.history.map((event) => event.id)).toEqual(['event-a', 'event-c']);
  });

  it('returns the rules in the order they were asked for', async () => {
    useFake({
      results: [
        // Deliberately the other way round from the request, as PostgREST is free to be.
        { data: [ruleRow({ id: 'rule-2' }), ruleRow({ id: 'rule-1' })] },
        { data: [] },
      ],
    });

    const entries = await listRuleProvenance(['rule-1', 'rule-2']);

    expect(entries.map((entry) => entry.ruleId)).toEqual(['rule-1', 'rule-2']);
  });

  it('drops a rule the catalog no longer has, rather than inventing an entry', async () => {
    useFake({ results: [{ data: [ruleRow({ id: 'rule-1' })] }, { data: [] }] });

    const entries = await listRuleProvenance(['rule-1', 'rule-gone']);

    expect(entries.map((entry) => entry.ruleId)).toEqual(['rule-1']);
  });

  it('has empty history rather than null when nothing is recorded', async () => {
    useFake({ results: [{ data: [ruleRow()] }, { data: [] }] });

    const [entry] = await listRuleProvenance(['rule-1']);

    expect(entry?.history).toEqual([]);
  });

  it('surfaces a rules-query failure as a DataError', async () => {
    useFake({
      results: [{ error: postgrestError('42501') }, { data: [] }],
    });

    await expect(listRuleProvenance(['rule-1'])).rejects.toMatchObject({
      kind: 'forbidden',
    });
  });

  // The history query failing must not be swallowed into "no changes recorded",
  // which would read as a fact about the rule rather than a failure to load.
  it('surfaces a history-query failure rather than reporting no history', async () => {
    useFake({
      results: [{ data: [ruleRow()] }, { error: postgrestError('42501') }],
    });

    await expect(listRuleProvenance(['rule-1'])).rejects.toMatchObject({
      kind: 'forbidden',
    });
  });
});
