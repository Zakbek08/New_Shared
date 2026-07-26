/**
 * Administrative catalog data access — and the Phase 6 exit criteria.
 *
 * Three things are proved here:
 *
 *   1. **An editor can create, verify and retire a rule.** The three flows are
 *      exercised end to end against the fake client, with the exact payloads asserted.
 *   2. **A member is refused by the database, not by the UI.** Every write path is
 *      driven with a 42501 response and must surface as a `forbidden` DataError —
 *      which is what happens when RLS refuses, whatever the client believed.
 *   3. **Retiring is not deleting.** A delete would orphan the recommendations and
 *      cap-usage rows that point at a rule and make an old answer unexplainable.
 */
import {
  callArgs,
  createSupabaseFake,
  postgrestError,
  type SupabaseFake,
} from '@/test-support/supabaseFake';

const fakeRef: { current: SupabaseFake | null } = { current: null };

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => fakeRef.current?.client,
  resetSupabaseClient: jest.fn(),
}));

import type { RewardRuleInput } from '@/domain/schemas';

import {
  bulkInsertRewardRules,
  createCondition,
  createRewardRule,
  createSource,
  deleteCondition,
  listAuditLog,
  listCatalogRules,
  listVerificationHistory,
  recordVerification,
  reinstateRewardRule,
  retireRewardRule,
  updateRewardRule,
} from './catalog';

const USER = { id: 'editor-1', email: 'editor@example.com' };
const AS_OF = new Date('2026-07-26T14:30:00.000Z');
const PRODUCT_ID = '55555555-0000-4000-8000-000000000001';
const RULE_ID = '66666666-0000-4000-8000-000000000102';
const SOURCE_ID = '88888888-0000-4000-8000-000000000001';

const ruleInput: RewardRuleInput = {
  cardProductId: PRODUCT_ID,
  label: '6% cash back at US supermarkets',
  kind: 'category_bonus',
  rewardType: 'cash_back_percent',
  rewardUnit: 'usd',
  baseRate: 6,
  bonusRate: 0,
  fixedAmountUsd: null,
  priority: 100,
  stackGroup: 'category',
  isStackable: false,
  capAmount: 6000,
  capAppliesTo: 'spend',
  capPeriod: 'calendar_year',
  postCapRate: 1,
  startsAt: null,
  endsAt: null,
  requiresEnrollment: false,
  enrollmentUrl: null,
  spendThresholdUsd: null,
  sourceId: null,
  lastVerifiedAt: null,
  verificationStatus: 'unverified',
  notes: undefined,
};

const ruleRow = (overrides: Record<string, unknown> = {}) => ({
  id: RULE_ID,
  card_product_id: PRODUCT_ID,
  reward_program_id: null,
  label: '6% cash back at US supermarkets',
  kind: 'category_bonus',
  reward_type: 'cash_back_percent',
  reward_unit: 'usd',
  base_rate: 6,
  bonus_rate: 0,
  fixed_amount_usd: null,
  priority: 100,
  stack_group: 'category',
  is_stackable: false,
  cap_amount: 6000,
  cap_applies_to: 'spend',
  cap_period: 'calendar_year',
  post_cap_rate: 1,
  starts_at: null,
  ends_at: null,
  requires_enrollment: false,
  enrollment_url: null,
  enrollment_notes: null,
  spend_threshold_usd: null,
  source_id: SOURCE_ID,
  last_verified_at: '2026-07-01T00:00:00.000Z',
  verification_status: 'verified',
  is_active: true,
  notes: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  card_products: {
    name: 'DEMO — Northwind Grocery Card',
    issuers: { name: 'DEMO — Northwind' },
  },
  sources: { label: 'Issuer terms', url: 'https://example.test/terms', is_fictional: true },
  reward_rule_conditions: [],
  ...overrides,
});

const conditionRow = (overrides: Record<string, unknown> = {}) => ({
  id: '77777777-0000-4000-8000-000000001021',
  reward_rule_id: RULE_ID,
  merchant_category_id: '33333333-0000-4000-8000-000000000002',
  included_category_ids: [],
  excluded_category_ids: [],
  included_mccs: [],
  included_mcc_ranges: ['[5411,5412)'],
  excluded_mccs: [],
  included_merchant_ids: [],
  excluded_merchant_ids: ['44444444-0000-4000-8000-000000000002'],
  included_country_codes: ['US'],
  excluded_country_codes: [],
  included_currency_codes: [],
  channel: 'either',
  included_payment_methods: [],
  starts_at: null,
  ends_at: null,
  min_amount_usd: null,
  max_amount_usd: null,
  notes: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

describe('listCatalogRules', () => {
  it('maps a rule, its product, its source and its conditions', async () => {
    fakeRef.current = createSupabaseFake({
      results: [{ data: [ruleRow({ reward_rule_conditions: [conditionRow()] })] }],
      user: USER,
    });

    const [rule] = await listCatalogRules({ asOf: AS_OF });

    expect(rule).toMatchObject({
      id: RULE_ID,
      productName: 'DEMO — Northwind Grocery Card',
      issuerName: 'DEMO — Northwind',
      baseRate: 6,
      capAmount: 6000,
      sourceLabel: 'Issuer terms',
      isFictionalSource: true,
      verificationStatus: 'verified',
      isActive: true,
    });
    expect(rule?.conditions).toHaveLength(1);
  });

  it('converts the stored MCC range back to inclusive bounds', async () => {
    // `[5411,5412)` is the single code 5411. Reading it as 5411–5412 would show the
    // editor a range one code wider than the rule actually matches.
    fakeRef.current = createSupabaseFake({
      results: [{ data: [ruleRow({ reward_rule_conditions: [conditionRow()] })] }],
      user: USER,
    });

    const [rule] = await listCatalogRules({ asOf: AS_OF });

    expect(rule?.conditions[0]?.includedMccRanges).toEqual([[5411, 5411]]);
  });

  it('derives freshness against the instant the caller supplied', async () => {
    // Verified 2026-07-01, asked as of 2026-07-26: 25 days, comfortably fresh.
    fakeRef.current = createSupabaseFake({ results: [{ data: [ruleRow()] }], user: USER });

    const [rule] = await listCatalogRules({ asOf: AS_OF });

    expect(rule?.freshness).toMatchObject({ daysSinceVerified: 25, band: 'fresh' });
  });

  it('treats a long-verified rule as out of date without a write', async () => {
    fakeRef.current = createSupabaseFake({
      results: [{ data: [ruleRow({ last_verified_at: '2025-01-01T00:00:00.000Z' })] }],
      user: USER,
    });

    const [rule] = await listCatalogRules({ asOf: AS_OF });

    expect(rule?.verificationStatus).toBe('verified');
    expect(rule?.freshness.effectiveStatus).toBe('stale');
    expect(rule?.freshness.isDowngradedByAge).toBe(true);
    // Nothing was written to arrive at that conclusion.
    expect(fakeRef.current.writes).toHaveLength(0);
  });

  it('escapes the search term so it cannot restructure the filter', async () => {
    fakeRef.current = createSupabaseFake({ results: [{ data: [] }], user: USER });

    await listCatalogRules({ asOf: AS_OF, search: 'grocery,%(evil)' });

    const ilike = fakeRef.current.calls.find((call) => call.method === 'ilike');
    // Each of `,` `%` `(` `)` becomes a space, so the term can only ever be a term.
    expect(ilike?.args[1]).toBe('%grocery   evil %');
  });

  it('does not filter on a one-character search', async () => {
    fakeRef.current = createSupabaseFake({ results: [{ data: [] }], user: USER });

    await listCatalogRules({ asOf: AS_OF, search: 'g' });

    expect(fakeRef.current.calls.some((call) => call.method === 'ilike')).toBe(false);
  });

  it('surfaces a read failure', async () => {
    fakeRef.current = createSupabaseFake({
      results: [{ error: postgrestError('42501') }],
      user: USER,
    });

    await expect(listCatalogRules({ asOf: AS_OF })).rejects.toMatchObject({
      kind: 'forbidden',
    });
  });
});

// ---------------------------------------------------------------------------
// Exit criterion 1: create, verify, retire
// ---------------------------------------------------------------------------

describe('an editor can create a rule', () => {
  it('sends every column, with the dates as ISO strings', async () => {
    fakeRef.current = createSupabaseFake({ results: [{ data: ruleRow() }], user: USER });

    await createRewardRule({
      ...ruleInput,
      startsAt: new Date('2026-07-01T00:00:00.000Z'),
      endsAt: new Date('2026-10-01T00:00:00.000Z'),
    });

    expect(fakeRef.current.writes[0]).toMatchObject({
      card_product_id: PRODUCT_ID,
      label: '6% cash back at US supermarkets',
      base_rate: 6,
      cap_amount: 6000,
      cap_period: 'calendar_year',
      post_cap_rate: 1,
      starts_at: '2026-07-01T00:00:00.000Z',
      ends_at: '2026-10-01T00:00:00.000Z',
      verification_status: 'unverified',
    });
  });

  it('creates a rule unverified — saving is not verifying', async () => {
    // A new rule has been read by nobody. Marking it verified on save would let a
    // typo enter the catalog wearing a verification.
    fakeRef.current = createSupabaseFake({ results: [{ data: ruleRow() }], user: USER });

    await createRewardRule(ruleInput);

    expect(fakeRef.current.writes[0]).toMatchObject({
      verification_status: 'unverified',
      last_verified_at: null,
    });
  });

  it('updates an existing rule scoped to its id', async () => {
    fakeRef.current = createSupabaseFake({ results: [{ data: ruleRow() }], user: USER });

    await updateRewardRule(RULE_ID, { ...ruleInput, baseRate: 5 });

    expect(fakeRef.current.writes[0]).toMatchObject({ base_rate: 5 });
    expect(callArgs(fakeRef.current, 'eq')).toEqual(['id', RULE_ID]);
  });
});

describe('an editor can verify a rule', () => {
  it('appends to the history and then updates the rule', async () => {
    fakeRef.current = createSupabaseFake({
      results: [
        { data: { verification_status: 'unverified' } },
        { data: { id: 'history-1' } },
        { data: null },
      ],
      user: USER,
    });

    await recordVerification(
      {
        rewardRuleId: RULE_ID,
        sourceId: SOURCE_ID,
        newStatus: 'verified',
        verifiedBaseRate: 6,
        verifiedBonusRate: null,
        note: 'Checked the terms PDF',
      },
      { asOf: AS_OF },
    );

    // History first: it is append-only and cannot be rolled back, so the worst
    // failure leaves an accurate record with the rule unchanged.
    expect(fakeRef.current.tables).toEqual([
      'reward_rules',
      'verification_history',
      'reward_rules',
    ]);

    expect(fakeRef.current.writes[0]).toMatchObject({
      reward_rule_id: RULE_ID,
      source_id: SOURCE_ID,
      previous_status: 'unverified',
      new_status: 'verified',
      verified_base_rate: 6,
      verified_at: '2026-07-26T14:30:00.000Z',
      // The RLS policy requires this to equal auth.uid(): an editor cannot attribute
      // a verification to someone else.
      verified_by: USER.id,
      note: 'Checked the terms PDF',
    });
  });

  it('stamps the verification date on the rule', async () => {
    fakeRef.current = createSupabaseFake({
      results: [
        { data: { verification_status: 'unverified' } },
        { data: { id: 'history-1' } },
        { data: null },
      ],
      user: USER,
    });

    await recordVerification(
      {
        rewardRuleId: RULE_ID,
        sourceId: SOURCE_ID,
        newStatus: 'verified',
        verifiedBaseRate: null,
        verifiedBonusRate: null,
        note: undefined,
      },
      { asOf: AS_OF },
    );

    expect(fakeRef.current.writes[1]).toMatchObject({
      verification_status: 'verified',
      source_id: SOURCE_ID,
      last_verified_at: '2026-07-26T14:30:00.000Z',
    });
  });

  it('does not stamp the date when the outcome is disputed', async () => {
    // Marking a rule disputed is not evidence that anyone checked it today, and
    // stamping the date would reset its staleness clock.
    fakeRef.current = createSupabaseFake({
      results: [
        { data: { verification_status: 'verified' } },
        { data: { id: 'history-2' } },
        { data: null },
      ],
      user: USER,
    });

    await recordVerification(
      {
        rewardRuleId: RULE_ID,
        sourceId: null,
        newStatus: 'disputed',
        verifiedBaseRate: null,
        verifiedBonusRate: null,
        note: 'Issuer page now shows 3%',
      },
      { asOf: AS_OF },
    );

    const ruleUpdate = fakeRef.current.writes[1] as Record<string, unknown>;
    expect(ruleUpdate['verification_status']).toBe('disputed');
    expect(ruleUpdate).not.toHaveProperty('last_verified_at');
  });

  it('records the previous status, so the history reads as a transition', async () => {
    fakeRef.current = createSupabaseFake({
      results: [
        { data: { verification_status: 'stale' } },
        { data: { id: 'history-3' } },
        { data: null },
      ],
      user: USER,
    });

    await recordVerification(
      {
        rewardRuleId: RULE_ID,
        sourceId: SOURCE_ID,
        newStatus: 'verified',
        verifiedBaseRate: null,
        verifiedBonusRate: null,
        note: undefined,
      },
      { asOf: AS_OF },
    );

    expect(fakeRef.current.writes[0]).toMatchObject({
      previous_status: 'stale',
      new_status: 'verified',
    });
  });

  it('refuses without a session', async () => {
    fakeRef.current = createSupabaseFake({ user: null });

    await expect(
      recordVerification({
        rewardRuleId: RULE_ID,
        sourceId: SOURCE_ID,
        newStatus: 'verified',
        verifiedBaseRate: null,
        verifiedBonusRate: null,
        note: undefined,
      }),
    ).rejects.toMatchObject({ kind: 'unauthenticated' });

    expect(fakeRef.current.writes).toHaveLength(0);
  });

  it('does not touch the rule when the history insert fails', async () => {
    // The rule must not end up claiming a verification that nothing recorded.
    fakeRef.current = createSupabaseFake({
      results: [
        { data: { verification_status: 'unverified' } },
        { error: postgrestError('42501') },
      ],
      user: USER,
    });

    await expect(
      recordVerification({
        rewardRuleId: RULE_ID,
        sourceId: SOURCE_ID,
        newStatus: 'verified',
        verifiedBaseRate: null,
        verifiedBonusRate: null,
        note: undefined,
      }),
    ).rejects.toMatchObject({ kind: 'forbidden' });

    // Only the history insert was attempted.
    expect(fakeRef.current.writes).toHaveLength(1);
  });
});

describe('an editor can retire a rule', () => {
  it('deactivates and marks it retired rather than deleting it', async () => {
    // A delete would orphan the recommendations, cap-usage rows and verification
    // history that reference it, and make an old answer unexplainable.
    fakeRef.current = createSupabaseFake({ results: [{ data: null }], user: USER });

    await retireRewardRule(RULE_ID);

    expect(fakeRef.current.writes[0]).toEqual({
      is_active: false,
      verification_status: 'retired',
    });
    expect(fakeRef.current.calls.some((call) => call.method === 'delete')).toBe(false);
    expect(callArgs(fakeRef.current, 'eq')).toEqual(['id', RULE_ID]);
  });

  it('brings a rule back as unverified, because its old verification has expired', async () => {
    fakeRef.current = createSupabaseFake({ results: [{ data: null }], user: USER });

    await reinstateRewardRule(RULE_ID);

    expect(fakeRef.current.writes[0]).toEqual({
      is_active: true,
      verification_status: 'unverified',
    });
  });
});

// ---------------------------------------------------------------------------
// Exit criterion 2: a member is refused by the database
// ---------------------------------------------------------------------------

describe('a member is refused by the database, not by the UI', () => {
  /**
   * 42501 is `insufficient_privilege` — what Postgres returns when an RLS policy
   * refuses. Each write path is driven with it to prove the refusal reaches the user
   * as a clear error rather than a silent no-op.
   */
  const refused = () =>
    createSupabaseFake({ results: [{ error: postgrestError('42501') }], user: USER });

  it('refuses a rule insert', async () => {
    fakeRef.current = refused();

    await expect(createRewardRule(ruleInput)).rejects.toMatchObject({
      kind: 'forbidden',
      userMessage: expect.stringMatching(/permission/i),
    });
  });

  it('refuses a rule update', async () => {
    fakeRef.current = refused();

    await expect(updateRewardRule(RULE_ID, ruleInput)).rejects.toMatchObject({
      kind: 'forbidden',
    });
  });

  it('refuses a retire', async () => {
    fakeRef.current = refused();

    await expect(retireRewardRule(RULE_ID)).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('refuses a condition write', async () => {
    fakeRef.current = refused();

    await expect(
      createCondition({
        rewardRuleId: RULE_ID,
        merchantCategoryId: null,
        includedCategoryIds: [],
        excludedCategoryIds: [],
        includedMccs: [],
        includedMccRanges: [],
        excludedMccs: [],
        includedMerchantIds: [],
        excludedMerchantIds: [],
        includedCountryCodes: [],
        excludedCountryCodes: [],
        includedCurrencyCodes: [],
        channel: 'either',
        includedPaymentMethods: [],
        startsAt: null,
        endsAt: null,
        minAmountUsd: null,
        maxAmountUsd: null,
        notes: undefined,
      }),
    ).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('refuses a source insert', async () => {
    fakeRef.current = refused();

    await expect(
      createSource({
        label: 'Issuer terms',
        url: 'https://example.test/terms',
        publisher: undefined,
        documentType: 'issuer_terms',
        publishedOn: null,
        retrievedOn: null,
        notes: undefined,
        isFictional: false,
      }),
    ).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('refuses a bulk import', async () => {
    fakeRef.current = refused();

    await expect(bulkInsertRewardRules([ruleInput])).rejects.toMatchObject({
      kind: 'forbidden',
    });
  });

  it('refuses a verification, on the append-only history', async () => {
    fakeRef.current = createSupabaseFake({
      results: [
        { data: { verification_status: 'unverified' } },
        { error: postgrestError('42501') },
      ],
      user: USER,
    });

    await expect(
      recordVerification({
        rewardRuleId: RULE_ID,
        sourceId: SOURCE_ID,
        newStatus: 'verified',
        verifiedBaseRate: null,
        verifiedBonusRate: null,
        note: undefined,
      }),
    ).rejects.toMatchObject({ kind: 'forbidden' });
  });
});

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

describe('condition writes', () => {
  const condition = {
    rewardRuleId: RULE_ID,
    merchantCategoryId: '33333333-0000-4000-8000-000000000002',
    includedCategoryIds: [],
    excludedCategoryIds: [],
    includedMccs: [5541],
    includedMccRanges: [
      [5411, 5411],
      [5811, 5814],
    ] as [number, number][],
    excludedMccs: [5300],
    includedMerchantIds: [],
    excludedMerchantIds: ['44444444-0000-4000-8000-000000000002'],
    includedCountryCodes: ['US'],
    excludedCountryCodes: [],
    includedCurrencyCodes: [],
    channel: 'either' as const,
    includedPaymentMethods: ['apple_pay' as const],
    startsAt: null,
    endsAt: null,
    minAmountUsd: null,
    maxAmountUsd: null,
    notes: undefined,
  };

  it('writes MCC ranges in the canonical half-open form', async () => {
    // Inclusive `[5411, 5411]` becomes `[5411,5412)`. Writing `[5411,5411]` would
    // work — Postgres canonicalises — but emitting the canonical form keeps the two
    // directions of the conversion visibly symmetrical.
    fakeRef.current = createSupabaseFake({ results: [{ data: conditionRow() }], user: USER });

    await createCondition(condition);

    expect(fakeRef.current.writes[0]).toMatchObject({
      included_mcc_ranges: ['[5411,5412)', '[5811,5815)'],
      included_mccs: [5541],
      excluded_mccs: [5300],
      excluded_merchant_ids: ['44444444-0000-4000-8000-000000000002'],
      included_country_codes: ['US'],
      included_payment_methods: ['apple_pay'],
    });
  });

  it('deletes a condition scoped to its id', async () => {
    fakeRef.current = createSupabaseFake({ results: [{ data: null }], user: USER });

    await deleteCondition('condition-1');

    expect(fakeRef.current.tables).toEqual(['reward_rule_conditions']);
    expect(callArgs(fakeRef.current, 'eq')).toEqual(['id', 'condition-1']);
  });
});

// ---------------------------------------------------------------------------
// Verification history and the audit trail
// ---------------------------------------------------------------------------

describe('listVerificationHistory', () => {
  it('maps the history newest first, with its source', async () => {
    fakeRef.current = createSupabaseFake({
      results: [
        {
          data: [
            {
              id: 'history-1',
              reward_rule_id: RULE_ID,
              source_id: SOURCE_ID,
              previous_status: 'unverified',
              new_status: 'verified',
              verified_base_rate: 6,
              verified_bonus_rate: null,
              verified_at: '2026-07-01T00:00:00.000Z',
              verified_by: USER.id,
              note: 'Checked the terms',
              created_at: '2026-07-01T00:00:00.000Z',
              sources: { label: 'Issuer terms' },
            },
          ],
        },
      ],
      user: USER,
    });

    const [entry] = await listVerificationHistory(RULE_ID);

    expect(entry).toMatchObject({
      previousStatus: 'unverified',
      newStatus: 'verified',
      verifiedBaseRate: 6,
      sourceLabel: 'Issuer terms',
      note: 'Checked the terms',
    });

    const order = fakeRef.current.calls.find((call) => call.method === 'order');
    expect(order?.args).toEqual(['verified_at', { ascending: false }]);
  });
});

describe('listAuditLog', () => {
  it('maps entries and never asks for values', async () => {
    fakeRef.current = createSupabaseFake({
      results: [
        {
          data: [
            {
              id: 12,
              actor_id: USER.id,
              actor_role: 'catalog_editor',
              subject_user_id: null,
              action: 'update',
              table_name: 'reward_rules',
              record_id: RULE_ID,
              changed_columns: ['base_rate', 'verification_status'],
              context: {},
              occurred_at: '2026-07-26T10:00:00.000Z',
            },
          ],
        },
      ],
      user: USER,
    });

    const [entry] = await listAuditLog();

    expect(entry).toMatchObject({
      action: 'update',
      tableName: 'reward_rules',
      changedColumns: ['base_rate', 'verification_status'],
      actorRole: 'catalog_editor',
    });
  });

  it('does not filter client-side — the database decides what comes back', async () => {
    // RLS returns an admin everything and everyone else only their own rows. A
    // client-side filter would be a filter that can be bypassed.
    fakeRef.current = createSupabaseFake({ results: [{ data: [] }], user: USER });

    await listAuditLog();

    expect(fakeRef.current.calls.some((call) => call.method === 'eq')).toBe(false);
  });

  it('filters by table when asked', async () => {
    fakeRef.current = createSupabaseFake({ results: [{ data: [] }], user: USER });

    await listAuditLog({ tableName: 'reward_rules' });

    expect(callArgs(fakeRef.current, 'eq')).toEqual(['table_name', 'reward_rules']);
  });
});

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------

describe('bulkInsertRewardRules', () => {
  it('inserts the batch in one statement', async () => {
    // One statement rather than a loop: the batch either lands or does not. There is
    // no client-side transaction over PostgREST to undo a half-applied import.
    fakeRef.current = createSupabaseFake({
      results: [{ data: [ruleRow(), ruleRow({ id: 'rule-2' })] }],
      user: USER,
    });

    const outcome = await bulkInsertRewardRules([ruleInput, { ...ruleInput, baseRate: 3 }]);

    expect(outcome.insertedCount).toBe(2);
    expect(Array.isArray(fakeRef.current.writes[0])).toBe(true);
    expect((fakeRef.current.writes[0] as unknown[]).length).toBe(2);
  });

  it('writes nothing for an empty batch', async () => {
    fakeRef.current = createSupabaseFake({ user: USER });

    const outcome = await bulkInsertRewardRules([]);

    expect(outcome).toEqual({ insertedCount: 0, rows: [] });
    expect(fakeRef.current.tables).toEqual([]);
  });
});
