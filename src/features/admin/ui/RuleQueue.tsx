/**
 * The review queue: every catalog rule, worst freshness first.
 *
 * The order is the point. A rule nobody has ever verified is the biggest liability in
 * the catalog — the app is quoting a rate no human checked — so it sorts above a stale
 * one, which sorts above one merely due for review. `compareReviewPriority` owns that
 * judgement and this component only renders it.
 */
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { VERIFICATION_STATUS_LABELS } from '@/domain/enums';
import {
  compareReviewPriority,
  FRESHNESS_BAND_LABELS,
  freshnessTally,
  type FreshnessBand,
} from '@/domain/catalog/staleness';
import type { CatalogRule } from '@/features/admin/api/catalog';
import { formatRewardRate } from '@/lib/format';

const BAND_TONE: Readonly<Record<FreshnessBand, 'best' | 'uncertain' | 'negative'>> = {
  fresh: 'best',
  due_soon: 'uncertain',
  stale: 'negative',
  never_verified: 'negative',
};

function freshnessHint(rule: CatalogRule): string {
  const { freshness } = rule;

  if (freshness.daysSinceVerified === null) return 'No verification on record.';
  if (freshness.band === 'stale') {
    return `Verified ${freshness.daysSinceVerified} days ago — past the window.`;
  }
  if (freshness.daysUntilStale === null)
    return `Verified ${freshness.daysSinceVerified} days ago.`;
  return `Verified ${freshness.daysSinceVerified} days ago · ${freshness.daysUntilStale} days left.`;
}

export function RuleQueueRow({
  rule,
  onEdit,
  onVerify,
  onRetire,
  testID,
}: {
  readonly rule: CatalogRule;
  readonly onEdit: (rule: CatalogRule) => void;
  readonly onVerify: (rule: CatalogRule) => void;
  readonly onRetire: (rule: CatalogRule) => void;
  readonly testID?: string;
}) {
  const rate =
    rule.rewardType === 'statement_credit' || rule.rewardType === 'fixed_amount'
      ? null
      : formatRewardRate(rule.baseRate + rule.bonusRate, rule.rewardType);

  return (
    <VStack gap="sm" testID={testID ?? `rule-row-${rule.id}`} accessible={false}>
      <VStack gap="xxs">
        <Text variant="bodyStrong">{rule.label}</Text>
        <Text variant="caption" tone="secondary">
          {rule.productName}
          {rule.issuerName === null ? '' : ` · ${rule.issuerName}`}
          {rate === null ? '' : ` · ${rate}`}
        </Text>
      </VStack>

      <HStack gap="sm" wrap align="flex-start">
        <Badge
          label={FRESHNESS_BAND_LABELS[rule.freshness.band]}
          tone={BAND_TONE[rule.freshness.band]}
          glyph={rule.freshness.band === 'fresh' ? '✓' : '!'}
        />
        <Badge
          label={VERIFICATION_STATUS_LABELS[rule.freshness.effectiveStatus]}
          tone="neutral"
        />
        {rule.freshness.isDowngradedByAge ? (
          <Badge
            label="Stored as verified"
            tone="uncertain"
            accessibilityLabel="Stored as verified, but treated as out of date because of its age"
          />
        ) : null}
        {rule.isFictionalSource ? <Badge label="Demo source" tone="info" glyph="i" /> : null}
        {!rule.isActive ? <Badge label="Retired" tone="neutral" /> : null}
      </HStack>

      <Text variant="caption" tone="tertiary">
        {freshnessHint(rule)}
        {rule.sourceLabel === null ? ' No source.' : ` Source: ${rule.sourceLabel}.`}
      </Text>

      <HStack gap="sm" wrap>
        <Button
          label="Edit"
          variant="secondary"
          onPress={() => onEdit(rule)}
          testID={`rule-edit-${rule.id}`}
        />
        <Button
          label="Verify"
          variant="secondary"
          onPress={() => onVerify(rule)}
          testID={`rule-verify-${rule.id}`}
        />
        <Button
          label={rule.isActive ? 'Retire' : 'Reinstate'}
          variant="ghost"
          onPress={() => onRetire(rule)}
          accessibilityHint={
            rule.isActive
              ? 'Stops the engine using this rule. It is kept, not deleted, so old recommendations stay explainable.'
              : 'Brings the rule back as unverified'
          }
          testID={`rule-retire-${rule.id}`}
        />
      </HStack>
    </VStack>
  );
}

export function RuleQueueSummary({ rules }: { readonly rules: readonly CatalogRule[] }) {
  const tally = freshnessTally(rules.map((rule) => rule.freshness));

  return (
    <HStack gap="sm" wrap align="flex-start">
      {tally.never_verified > 0 ? (
        <Badge label={`${tally.never_verified} never verified`} tone="negative" glyph="!" />
      ) : null}
      {tally.stale > 0 ? (
        <Badge label={`${tally.stale} out of date`} tone="negative" glyph="!" />
      ) : null}
      {tally.due_soon > 0 ? (
        <Badge label={`${tally.due_soon} due for review`} tone="uncertain" glyph="!" />
      ) : null}
      {tally.fresh > 0 ? <Badge label={`${tally.fresh} fresh`} tone="best" glyph="✓" /> : null}
    </HStack>
  );
}

/** Sorts by review priority. Exported so a test can assert the order directly. */
export function sortRulesForReview(rules: readonly CatalogRule[]): readonly CatalogRule[] {
  return [...rules].sort((left, right) =>
    compareReviewPriority(
      { id: left.id, freshness: left.freshness },
      { id: right.id, freshness: right.freshness },
    ),
  );
}

export function RuleQueue({
  rules,
  onEdit,
  onVerify,
  onRetire,
  testID,
}: {
  readonly rules: readonly CatalogRule[];
  readonly onEdit: (rule: CatalogRule) => void;
  readonly onVerify: (rule: CatalogRule) => void;
  readonly onRetire: (rule: CatalogRule) => void;
  readonly testID?: string;
}) {
  const sorted = sortRulesForReview(rules);

  return (
    <Card testID={testID}>
      <VStack gap="lg">
        <VStack gap="sm">
          <Text variant="title3" accessibilityRole="header">
            Review queue
          </Text>
          <Text variant="caption" tone="secondary">
            Never-verified rules first, then out of date, then due for review.
          </Text>
          <RuleQueueSummary rules={rules} />
        </VStack>

        {sorted.map((rule) => (
          <RuleQueueRow
            key={rule.id}
            rule={rule}
            onEdit={onEdit}
            onVerify={onVerify}
            onRetire={onRetire}
          />
        ))}
      </VStack>
    </Card>
  );
}
