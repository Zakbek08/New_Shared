/**
 * Provenance for the bundled demo wallet.
 *
 * The two failure modes worth guarding are both about honesty rather than crashes.
 *
 * A **fabricated citation** — a plausible `https://northwind-financial.example/terms` —
 * would invite exactly the trust the demo has not earned, so no demo source may carry a
 * URL. A **drifting rate snapshot** — a history entry claiming 6% after someone changed
 * the rule to 5% — would make the audit trail lie about the arithmetic it is supposed to
 * corroborate, so the recorded rates are compared against the rules themselves.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DEMO_CARDS } from './demoCatalog';
import { DEMO_SOURCE, demoRuleProvenance } from './demoProvenance';

const ALL_RULE_IDS = DEMO_CARDS.flatMap((card) => card.rules.map((rule) => rule.id));

describe('the demo source', () => {
  it('announces itself as invented', () => {
    expect(DEMO_SOURCE.documentType).toBe('fictional_demo_data');
    expect(DEMO_SOURCE.isFictional).toBe(true);
  });

  // The central rule of this file. A made-up number invites doubt; a made-up
  // citation invites trust.
  it('cites no URL, because there is no real document to cite', () => {
    expect(DEMO_SOURCE.url).toBeNull();
  });

  it('is worded identically to the seeded database', () => {
    const seed = readFileSync(
      join(__dirname, '..', '..', '..', 'supabase', 'seed', '02_demo_sources_and_issuers.sql'),
      'utf8',
    );

    expect(seed).toContain(DEMO_SOURCE.label);
    expect(seed).toContain(DEMO_SOURCE.notes ?? '');
  });
});

describe('demoRuleProvenance', () => {
  it('covers every rule in the demo wallet', () => {
    const covered = demoRuleProvenance(ALL_RULE_IDS).map((entry) => entry.ruleId);

    expect(covered).toEqual(ALL_RULE_IDS);
  });

  it('drops an unknown rule id rather than inventing a source for it', () => {
    expect(demoRuleProvenance(['not-a-demo-rule'])).toEqual([]);
  });

  it('returns nothing for an empty request', () => {
    expect(demoRuleProvenance([])).toEqual([]);
  });

  it('gives every rule the one fictional source', () => {
    for (const entry of demoRuleProvenance(ALL_RULE_IDS)) {
      expect(entry.source).toBe(DEMO_SOURCE);
    }
  });

  it('copies the rule label and status off the rule, not a second copy of them', () => {
    const [entry] = demoRuleProvenance(['demo-rule-grocery-6']);
    const rule = DEMO_CARDS.flatMap((card) => card.rules).find(
      (candidate) => candidate.id === 'demo-rule-grocery-6',
    );

    expect(entry?.ruleLabel).toBe(rule?.label);
    expect(entry?.verificationStatus).toBe(rule?.verificationStatus);
    expect(entry?.lastVerifiedAt).toBe(rule?.lastVerifiedAt?.toISOString());
  });

  // Written out rather than asserted loosely: the grocery rule pays 0 base + 6 bonus,
  // so its history must record exactly that, and 6 is 6% because
  // `money.percentOf` divides by 100.
  it('records the grocery rule’s real rates: 0 base and 6 bonus', () => {
    const [entry] = demoRuleProvenance(['demo-rule-grocery-6']);

    for (const event of entry?.history ?? []) {
      expect(event.verifiedBaseRate).toBe(0);
      expect(event.verifiedBonusRate).toBe(6);
    }
  });

  it('records every other rule’s rates from the rule itself', () => {
    const rulesById = new Map(
      DEMO_CARDS.flatMap((card) => card.rules).map((rule) => [rule.id, rule]),
    );

    for (const entry of demoRuleProvenance(ALL_RULE_IDS)) {
      const rule = rulesById.get(entry.ruleId);
      for (const event of entry.history) {
        expect(event.verifiedBaseRate).toBe(rule?.baseRate);
        expect(event.verifiedBonusRate).toBe(rule?.bonusRate);
      }
    }
  });

  it('gives at least one rule a history worth scrolling', () => {
    const [entry] = demoRuleProvenance(['demo-rule-grocery-6']);

    expect(entry?.history.length).toBeGreaterThan(1);
  });

  it('orders history newest first', () => {
    const [entry] = demoRuleProvenance(['demo-rule-grocery-6']);
    const timestamps = (entry?.history ?? []).map((event) => event.verifiedAt);

    expect([...timestamps].sort().reverse()).toEqual(timestamps);
  });

  it('gives every entry a distinct id, so React keys do not collide', () => {
    const ids = demoRuleProvenance(ALL_RULE_IDS).flatMap((entry) =>
      entry.history.map((event) => event.id),
    );

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reads no clock, so the demo timeline is reproducible', () => {
    const source = readFileSync(join(__dirname, 'demoProvenance.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    expect(source).not.toContain('Date.now()');
    expect(source).not.toMatch(/new Date\(\s*\)/);
  });
});
