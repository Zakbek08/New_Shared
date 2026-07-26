/**
 * Bulk-import validation.
 *
 * Two properties matter more than the parsing details:
 *
 *   * a bad row never contaminates a good one — each is validated independently, so a
 *     200-row paste reports every problem in one pass;
 *   * a rejected row is reported with its own field and message, because "3 rows
 *     failed" turns a typo into a guessing game.
 */
import { parseImportText, summariseReport, validateRuleImport } from './bulkImport';

const PRODUCT_ID = '55555555-0000-4000-8000-000000000001';

/** A rule that passes `rewardRuleSchema`. Tests vary one field from it. */
function validRow(overrides: Record<string, unknown> = {}) {
  return {
    cardProductId: PRODUCT_ID,
    label: '6% cash back at US supermarkets',
    kind: 'category_bonus',
    rewardType: 'cash_back_percent',
    rewardUnit: 'usd',
    baseRate: 6,
    bonusRate: 0,
    priority: 100,
    stackGroup: 'category',
    isStackable: false,
    capAmount: 6000,
    capPeriod: 'calendar_year',
    capAppliesTo: 'spend',
    requiresEnrollment: false,
    verificationStatus: 'unverified',
    ...overrides,
  };
}

describe('validateRuleImport', () => {
  it('accepts a well-formed row and returns it ready to insert', () => {
    const report = validateRuleImport([validRow()]);

    expect(report.validCount).toBe(1);
    expect(report.invalidCount).toBe(0);
    expect(report.isEmpty).toBe(false);
    expect(report.validRows[0]).toMatchObject({
      cardProductId: PRODUCT_ID,
      baseRate: 6,
      capAmount: 6000,
      capPeriod: 'calendar_year',
    });
  });

  it('validates each row independently, so one bad row does not hide the others', () => {
    const report = validateRuleImport([
      validRow({ label: 'First rule' }),
      validRow({ label: 'x' }),
      validRow({ label: 'Third rule' }),
    ]);

    expect(report.validCount).toBe(2);
    expect(report.invalidCount).toBe(1);
    expect(report.rows.map((row) => row.isValid)).toEqual([true, false, true]);
  });

  it('reports the row index, so the editor can find the row again', () => {
    const report = validateRuleImport([validRow(), validRow({ baseRate: -5 })]);
    const rejected = report.rows.find((row) => !row.isValid);

    expect(rejected?.index).toBe(1);
  });

  it('names the field and the reason for each problem', () => {
    // A cap amount with no period is exactly the mistake the DB constraint catches;
    // catching it here means a readable message instead of a constraint name.
    const report = validateRuleImport([validRow({ capPeriod: 'none' })]);
    const issues = report.rows[0]?.issues ?? [];

    expect(issues.some((issue) => issue.field === 'capPeriod')).toBe(true);
    expect(issues.some((issue) => /cap period/i.test(issue.message))).toBe(true);
  });

  it('reports several problems on one row', () => {
    const report = validateRuleImport([validRow({ label: 'x', cardProductId: 'not-a-uuid' })]);

    expect(report.rows[0]?.issues.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('orders issues stably, so two runs read the same', () => {
    const rows = [validRow({ label: 'x', cardProductId: 'not-a-uuid', baseRate: -1 })];

    expect(validateRuleImport(rows)).toEqual(validateRuleImport(rows));
  });

  it('keeps a readable label for a rejected row where one can be read', () => {
    const report = validateRuleImport([validRow({ baseRate: -5, label: 'Grocery bonus' })]);

    expect(report.rows[0]?.label).toBe('Grocery bonus');
  });

  it('copes with a row that is not an object at all', () => {
    const report = validateRuleImport(['nonsense', 42, null]);

    expect(report.validCount).toBe(0);
    expect(report.invalidCount).toBe(3);
    expect(report.rows.every((row) => row.label === null)).toBe(true);
    expect(report.rows.every((row) => row.issues.length > 0)).toBe(true);
  });

  it('rejects a rule marked verified with no source or date', () => {
    // The schema's own refinement. Importing this would put a rule in the catalog
    // claiming to be verified with nothing behind it.
    const report = validateRuleImport([validRow({ verificationStatus: 'verified' })]);

    expect(report.validCount).toBe(0);
    expect(
      report.rows[0]?.issues.some((issue) =>
        /source and a verification date/i.test(issue.message),
      ),
    ).toBe(true);
  });

  it('rejects a rate rule that earns nothing', () => {
    const report = validateRuleImport([validRow({ baseRate: 0, bonusRate: 0 })]);

    expect(report.validCount).toBe(0);
    expect(report.rows[0]?.issues.some((issue) => issue.field === 'baseRate')).toBe(true);
  });

  it('rejects a credit rule with no amount', () => {
    const report = validateRuleImport([
      validRow({ rewardType: 'statement_credit', fixedAmountUsd: null }),
    ]);

    expect(report.rows[0]?.issues.some((issue) => issue.field === 'fixedAmountUsd')).toBe(true);
  });

  it('rejects text that looks like a card number in a free-text field', () => {
    // The credential guard runs on the admin path too. A rate document does not
    // contain a card number, and if a paste does, it must not be stored.
    const report = validateRuleImport([
      validRow({ notes: 'Cardholder 4111 1111 1111 1111 reported this' }),
    ]);

    expect(report.validCount).toBe(0);
    expect(report.rows[0]?.issues.some((issue) => /card number/i.test(issue.message))).toBe(
      true,
    );
  });

  it('reports an empty batch as empty rather than as a success', () => {
    const report = validateRuleImport([]);

    expect(report.validCount).toBe(0);
    expect(report.invalidCount).toBe(0);
    expect(report.isEmpty).toBe(true);
  });

  it('writes nothing — it only reports', () => {
    // The signature is the guarantee: a pure function over plain data cannot reach a
    // database. Asserted here so a later refactor that adds I/O breaks a test.
    const rows = [validRow()];
    const first = validateRuleImport(rows);
    const second = validateRuleImport(rows);

    expect(first).toEqual(second);
    expect(rows[0]).toEqual(validRow());
  });
});

describe('parseImportText', () => {
  it('parses an array of rules', () => {
    const parsed = parseImportText('[{"label":"one"},{"label":"two"}]');

    expect('rows' in parsed && parsed.rows).toHaveLength(2);
  });

  it('accepts a single object as a one-row batch', () => {
    // Pasting one rule is a normal thing to do; demanding brackets would be pedantry.
    const parsed = parseImportText('{"label":"one"}');

    expect('rows' in parsed && parsed.rows).toHaveLength(1);
  });

  it('explains what shape is expected rather than quoting a parser error', () => {
    const parsed = parseImportText('{not json');

    expect('error' in parsed && parsed.error).toMatch(/array of rule objects/i);
    // A character offset is no help in a text box.
    expect('error' in parsed && parsed.error).not.toMatch(/position \d+/);
  });

  it('asks for something when given nothing', () => {
    expect(parseImportText('   ')).toEqual({ error: 'Paste one or more rules as JSON.' });
  });

  it('rejects a bare scalar', () => {
    expect('error' in parseImportText('42')).toBe(true);
    expect('error' in parseImportText('"a string"')).toBe(true);
  });

  it('tolerates surrounding whitespace and newlines', () => {
    const parsed = parseImportText('\n  [{"label":"one"}]  \n');

    expect('rows' in parsed && parsed.rows).toHaveLength(1);
  });
});

describe('summariseReport', () => {
  it('says all rows are ready when none failed', () => {
    expect(summariseReport(validateRuleImport([validRow(), validRow()]))).toBe(
      'All 2 rules are ready to import.',
    );
  });

  it('uses the singular for one row', () => {
    expect(summariseReport(validateRuleImport([validRow()]))).toBe(
      '1 rule is ready to import.',
    );
  });

  it('states the split so the rejected rows cannot be missed', () => {
    // "12 valid" reads as though the rest were dropped silently. This does not.
    const report = validateRuleImport([validRow(), validRow({ baseRate: -1 })]);

    expect(summariseReport(report)).toBe(
      '1 of 2 rules are ready to import. 1 row needs fixing first.',
    );
  });

  it('pluralises the failing count', () => {
    const report = validateRuleImport([
      validRow(),
      validRow({ baseRate: -1 }),
      validRow({ label: 'x' }),
    ]);

    expect(summariseReport(report)).toMatch(/2 rows need fixing first/);
  });

  it('says plainly when nothing can be imported', () => {
    const report = validateRuleImport([validRow({ baseRate: -1 }), validRow({ label: 'x' })]);

    expect(summariseReport(report)).toBe(
      'None of the 2 rules can be imported. See the reasons below.',
    );
  });

  it('handles an empty batch', () => {
    expect(summariseReport(validateRuleImport([]))).toBe('Nothing to import.');
  });
});
