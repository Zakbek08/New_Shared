/**
 * One card in the recommendation results.
 *
 * The product's colour language is load-bearing here — green for the best value,
 * amber for uncertain coding, red for a fee or an ineligible card — and every
 * coloured element also carries a text label, so the meaning survives greyscale,
 * colour-blindness and a screenshot.
 *
 * The whole row is one accessible element with a composed label, so a screen
 * reader announces "Best value. Northwind Grocery Card. 7 dollars 20 cents. 6% at
 * US supermarkets." rather than a dozen disconnected fragments.
 */
import { View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { CONFIDENCE_LABELS } from '@/domain/enums';
import { describeReward, type RecommendationCandidate } from '@/domain/rewards';
import { formatCardName, formatRewardRate, formatUsd, formatVerifiedOn } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';

/** Spoken forms for the machine-readable warnings. */
const WARNING_LABELS: Readonly<Record<string, string>> = {
  merchant_coding_uncertain: 'Coding uncertain',
  category_inferred: 'Category guessed',
  category_missing: 'No category',
  cap_partially_available: 'Cap partly used',
  cap_nearly_reached: 'Cap nearly reached',
  enrollment_required: 'Needs activation',
  source_unverified: 'Rate unverified',
  source_stale: 'Rate may be out of date',
  foreign_transaction_fee_applied: 'Foreign fee applied',
  tie_broken_by_preference: 'Your preferred card',
  offer_requires_activation: 'Offer needs activating',
  estimated_point_valuation: 'Your own point value',
};

/** Which warnings deserve amber rather than neutral. */
const AMBER_WARNINGS = new Set([
  'merchant_coding_uncertain',
  'category_inferred',
  'category_missing',
  'cap_partially_available',
  'cap_nearly_reached',
  'enrollment_required',
  'source_unverified',
  'source_stale',
  'offer_requires_activation',
]);

export function CandidateCard({
  candidate,
  isRecommended,
  testID,
}: {
  readonly candidate: RecommendationCandidate;
  readonly isRecommended: boolean;
  readonly testID?: string;
}) {
  const theme = useTheme();

  const name = formatCardName(candidate.card.displayName, candidate.card.nickname);
  const { breakdown } = candidate;

  const emphasis = !candidate.isEligible
    ? 'negative'
    : isRecommended
      ? 'best'
      : candidate.warnings.some((warning) => AMBER_WARNINGS.has(warning))
        ? 'uncertain'
        : 'neutral';

  // One composed sentence, so assistive technology reads a coherent summary.
  const accessibilityLabel = [
    isRecommended ? 'Best value.' : null,
    `${name}, from ${candidate.card.issuerName}.`,
    candidate.isEligible ? `Earns about ${describeReward(candidate)}.` : null,
    candidate.reason,
    candidate.isEligible ? CONFIDENCE_LABELS[candidate.confidence] : null,
  ]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(' ');

  return (
    <Card emphasis={emphasis} accessibilityLabel={accessibilityLabel} testID={testID}>
      <VStack gap="md">
        <HStack gap="sm" wrap align="flex-start">
          {isRecommended ? <Badge label="Best value" tone="best" glyph="✓" /> : null}
          {!candidate.isEligible ? (
            <Badge label="Not eligible" tone="negative" glyph="×" />
          ) : null}
          {candidate.card.isPreferred ? (
            <Badge label="Preferred" tone="accent" glyph="★" />
          ) : null}
        </HStack>

        <HStack gap="md" justify="space-between" align="flex-start">
          <VStack gap="xxs" style={{ flex: 1 }}>
            <Text variant={isRecommended ? 'title2' : 'title3'}>{name}</Text>
            <Text variant="caption" tone="secondary">
              {candidate.card.issuerName}
            </Text>
          </VStack>

          {candidate.isEligible ? (
            <VStack gap="xxs" align="flex-end">
              <Text
                variant={isRecommended ? 'numeric' : 'title3'}
                tone={isRecommended ? 'success' : 'primary'}
                tabularNumbers
                // The composed row label already speaks this.
                accessibilityElementsHidden
              >
                {formatUsd(breakdown.netValueUsd)}
              </Text>
              {breakdown.rewardUnit !== null && breakdown.rewardUnit !== 'usd' ? (
                <Text variant="caption" tone="secondary" tabularNumbers>
                  {describeReward(candidate)}
                </Text>
              ) : null}
            </VStack>
          ) : null}
        </HStack>

        <Text variant="callout" tone="secondary">
          {candidate.reason}
        </Text>

        {candidate.isEligible &&
        breakdown.effectiveRate !== null &&
        breakdown.rewardType !== null ? (
          <HStack gap="md" wrap>
            <Text variant="label" tone="accent" tabularNumbers>
              {formatRewardRate(breakdown.effectiveRate, breakdown.rewardType)}
            </Text>
            {candidate.capRemainingUsd !== null && candidate.capAmountUsd !== null ? (
              <Text variant="caption" tone="secondary" tabularNumbers>
                {formatUsd(candidate.capRemainingUsd)} of cap left
              </Text>
            ) : null}
          </HStack>
        ) : null}

        {breakdown.foreignTransactionFeeUsd > 0 ? (
          <View
            style={{
              backgroundColor: theme.colors.dangerSubtle,
              borderRadius: theme.radii.sm,
              padding: theme.spacing.sm,
            }}
          >
            <Text variant="caption" style={{ color: theme.colors.onDangerSubtle }}>
              Less {formatUsd(breakdown.foreignTransactionFeeUsd)} foreign transaction fee
            </Text>
          </View>
        ) : null}

        <HStack gap="sm" wrap align="flex-start">
          {candidate.isEligible ? (
            <Badge
              label={CONFIDENCE_LABELS[candidate.confidence]}
              tone={
                candidate.confidence === 'high'
                  ? 'best'
                  : candidate.confidence === 'medium'
                    ? 'uncertain'
                    : 'negative'
              }
            />
          ) : null}
          {candidate.warnings.map((warning) => (
            <Badge
              key={warning}
              label={WARNING_LABELS[warning] ?? warning}
              tone={AMBER_WARNINGS.has(warning) ? 'uncertain' : 'neutral'}
              glyph={AMBER_WARNINGS.has(warning) ? '!' : undefined}
            />
          ))}
        </HStack>

        {candidate.isEligible ? (
          <Text variant="footnote" tone="tertiary">
            {formatVerifiedOn(candidate.sourceVerifiedAt)}
          </Text>
        ) : null}
      </VStack>
    </Card>
  );
}
