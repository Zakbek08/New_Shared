/**
 * Provenance for the bundled fictional wallet.
 *
 * WHY THE SOURCE HAS NO URL
 * `sources.url` is null for every entry here, and deliberately so. A plausible-looking
 * link — `https://northwind-financial.example/terms` — would be a **fabricated
 * citation**, which is the same class of defect as a fabricated rate and arguably
 * worse: a made-up number invites doubt, a made-up citation invites trust. The demo
 * says what it is instead, and `document_type: 'fictional_demo_data'` makes the UI
 * badge it.
 *
 * THE RATES IN THE HISTORY ARE DERIVED, NOT TYPED
 * A history row snapshots the rate as it stood at verification time. Those figures
 * are read back out of `DEMO_CARDS` rather than written again here, so the timeline
 * cannot claim a rate the engine would not use. Writing `6` by hand would work until
 * someone changed the rule and left this file behind.
 *
 * NO CLOCK. Every date is an explicit literal, matching `supabase/seed/`.
 */
import { DEMO_CARDS } from '@/features/demo/demoCatalog';
import type {
  RuleProvenance,
  SourceSummary,
  VerificationEvent,
} from '@/features/provenance/api/provenance';
import type { EvaluableRule } from '@/domain/rewards/types';

/**
 * The one document behind the whole demo wallet.
 *
 * The label matches `supabase/seed/02_demo_sources_and_issuers.sql` exactly, and a
 * test asserts it, so the bundled demo and the seeded database cite the same thing.
 */
export const DEMO_SOURCE: SourceSummary = {
  id: 'demo-source-1',
  label: 'WalletWise fictional demonstration dataset v1',
  url: null,
  publisher: 'WalletWise',
  documentType: 'fictional_demo_data',
  publishedOn: '2026-07-01',
  retrievedOn: '2026-07-01',
  notes: 'Invented rates for development and testing. Not a real product disclosure.',
  isFictional: true,
};

function findRule(ruleId: string): EvaluableRule | null {
  for (const card of DEMO_CARDS) {
    const match = card.rules.find((rule) => rule.id === ruleId);
    if (match !== undefined) return match;
  }
  return null;
}

/**
 * The entry every demo rule has: the day the fictional dataset was loaded.
 *
 * Rates come from the rule itself, so this is a record of the rule as it actually
 * stands rather than a second, independent claim about it.
 */
function initialLoad(rule: EvaluableRule): VerificationEvent {
  return {
    id: `demo-verification-${rule.id}-1`,
    rewardRuleId: rule.id,
    previousStatus: 'unverified',
    newStatus: 'verified',
    verifiedBaseRate: rule.baseRate,
    verifiedBonusRate: rule.bonusRate,
    verifiedAt: '2026-07-01T00:00:00.000Z',
    sourceLabel: DEMO_SOURCE.label,
    note: 'Fictional demo dataset: initial load.',
  };
}

/**
 * An earlier re-check on the grocery rule, so at least one rule in the demo has a
 * timeline with more than one entry in it.
 *
 * Without this the history section would always render a single row and the ordering,
 * the "checked again" wording and the change-of-status path would all be untested by
 * the thing a person actually looks at.
 */
function groceryRecheck(rule: EvaluableRule): VerificationEvent {
  return {
    id: `demo-verification-${rule.id}-0`,
    rewardRuleId: rule.id,
    previousStatus: 'verified',
    newStatus: 'verified',
    verifiedBaseRate: rule.baseRate,
    verifiedBonusRate: rule.bonusRate,
    verifiedAt: '2026-04-02T00:00:00.000Z',
    sourceLabel: DEMO_SOURCE.label,
    note: 'Quarterly re-check against the fictional dataset. No change.',
  };
}

const RULE_WITH_LONGER_HISTORY = 'demo-rule-grocery-6';

/**
 * Provenance for the demo rules the caller asked about, newest entry first.
 *
 * Unknown ids are dropped rather than answered with an empty shell, which is what
 * the Supabase path does for a rule that no longer exists.
 */
export function demoRuleProvenance(ruleIds: readonly string[]): readonly RuleProvenance[] {
  return ruleIds.flatMap((ruleId) => {
    const rule = findRule(ruleId);
    if (rule === null) return [];

    const history =
      ruleId === RULE_WITH_LONGER_HISTORY
        ? [initialLoad(rule), groceryRecheck(rule)]
        : [initialLoad(rule)];

    return [
      {
        ruleId: rule.id,
        ruleLabel: rule.label,
        verificationStatus: rule.verificationStatus,
        lastVerifiedAt: rule.lastVerifiedAt?.toISOString() ?? null,
        source: DEMO_SOURCE,
        history,
      },
    ];
  });
}
