/**
 * The step-by-step arithmetic behind one recommendation.
 *
 * This component is why the engine is deterministic. A user can read it top to
 * bottom and reproduce the figure on paper — which is the only honest basis for
 * asking them to trust a financial estimate.
 *
 * Every row comes from `RewardBreakdown`. Nothing is recomputed here.
 */
import { Card } from '@/components/ui/Card';
import { Divider, HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { CAP_PERIOD_LABELS } from '@/domain/enums';
import type { RecommendationCandidate } from '@/domain/rewards';
import { formatRewardRate, formatRewardUnits, formatUsd, formatUsdCompact } from '@/lib/format';

interface Row {
  readonly label: string;
  readonly value: string;
  /** Costs are shown in red; the winning total in green. */
  readonly tone?: 'primary' | 'secondary' | 'danger' | 'success';
  readonly isTotal?: boolean;
}

function BreakdownRow({ row }: { readonly row: Row }) {
  return (
    <HStack
      gap="md"
      justify="space-between"
      align="flex-start"
      // One accessible node per row, so a screen reader reads label and value
      // together rather than drifting between two columns.
      style={{ paddingVertical: 2 }}
    >
      <Text
        variant={row.isTotal === true ? 'bodyStrong' : 'callout'}
        tone="secondary"
        style={{ flex: 1 }}
      >
        {row.label}
      </Text>
      <Text
        variant={row.isTotal === true ? 'bodyStrong' : 'callout'}
        tone={row.tone ?? 'primary'}
        tabularNumbers
      >
        {row.value}
      </Text>
    </HStack>
  );
}

/**
 * Builds the rows for a candidate.
 *
 * Exported so a test can assert the arithmetic reads correctly without rendering.
 */
export function breakdownRows(
  candidate: RecommendationCandidate,
  amountUsd: number,
): readonly Row[] {
  const { breakdown } = candidate;
  const rows: Row[] = [{ label: 'Purchase amount', value: formatUsd(amountUsd) }];

  if (breakdown.appliedRuleLabel !== null) {
    rows.push({ label: 'Rule applied', value: breakdown.appliedRuleLabel });
  }

  if (breakdown.effectiveRate !== null && breakdown.rewardType !== null) {
    rows.push({
      label: 'Reward rate',
      value: formatRewardRate(breakdown.effectiveRate, breakdown.rewardType),
    });
  }

  // Only show the cap split when a cap actually bit; otherwise it is noise.
  if (breakdown.overCapSpendUsd > 0) {
    rows.push({
      label: 'Earning the bonus rate',
      value: formatUsd(breakdown.withinCapSpendUsd),
    });
    rows.push({
      label: 'Above the cap',
      value: formatUsd(breakdown.overCapSpendUsd),
      tone: 'secondary',
    });
    if (breakdown.postCapRate !== null && breakdown.rewardType !== null) {
      rows.push({
        label: 'Rate above the cap',
        value: formatRewardRate(breakdown.postCapRate, breakdown.rewardType),
        tone: 'secondary',
      });
    }
  }

  if (breakdown.rewardUnit !== null && breakdown.rewardUnit !== 'usd') {
    rows.push({
      label: 'Reward earned',
      value: formatRewardUnits(breakdown.grossRewardUnits, breakdown.rewardUnit),
    });
    if (breakdown.appliedCentsPerUnit !== null) {
      rows.push({
        label: 'Your valuation',
        value: `${Number.parseFloat(breakdown.appliedCentsPerUnit.toFixed(4))}¢ per ${
          breakdown.rewardUnit === 'points' ? 'point' : 'mile'
        }`,
      });
    }
    rows.push({ label: 'Reward value', value: formatUsd(breakdown.rewardValueUsd) });
  } else {
    rows.push({ label: 'Cash back', value: formatUsd(breakdown.rewardValueUsd) });
  }

  if (breakdown.statementCreditUsd > 0) {
    rows.push({
      label: 'Statement credit',
      value: formatUsd(breakdown.statementCreditUsd),
    });
  }

  if (breakdown.offerValueUsd > 0) {
    rows.push({ label: 'Merchant offer', value: formatUsd(breakdown.offerValueUsd) });
  }

  if (breakdown.foreignTransactionFeeUsd > 0) {
    rows.push({
      label: 'Foreign transaction fee',
      value: `−${formatUsd(breakdown.foreignTransactionFeeUsd)}`,
      tone: 'danger',
    });
  }

  rows.push({
    label: 'Estimated value',
    value: formatUsd(breakdown.netValueUsd),
    tone: 'success',
    isTotal: true,
  });

  return rows;
}

export function BreakdownTable({
  candidate,
  amountUsd,
  testID,
}: {
  readonly candidate: RecommendationCandidate;
  readonly amountUsd: number;
  readonly testID?: string;
}) {
  const rows = breakdownRows(candidate, amountUsd);

  return (
    <Card testID={testID}>
      <VStack gap="md">
        <Text variant="title3" accessibilityRole="header">
          How this figure was worked out
        </Text>

        <VStack gap="xs">
          {rows.map((row, index) => (
            <VStack key={`${row.label}-${index}`} gap="xs">
              {row.isTotal === true ? <Divider /> : null}
              <BreakdownRow row={row} />
            </VStack>
          ))}
        </VStack>

        {candidate.capAmountUsd !== null && candidate.capPeriod !== null ? (
          <Text variant="footnote" tone="tertiary">
            This bonus is capped at {formatUsdCompact(candidate.capAmountUsd)}{' '}
            {CAP_PERIOD_LABELS[candidate.capPeriod]}
            {candidate.capRemainingUsd === null
              ? ''
              : `, and ${formatUsdCompact(candidate.capRemainingUsd)} was available`}
            . Cap figures are our estimate: issuers measure them against a statement cycle we
            cannot see.
          </Text>
        ) : null}

        <Text variant="footnote" tone="tertiary">
          Every number above comes from a validated database record and a plain TypeScript
          function. Nothing here is generated by a model.
        </Text>
      </VStack>
    </Card>
  );
}
