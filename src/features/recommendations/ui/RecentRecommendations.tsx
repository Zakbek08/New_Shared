/**
 * "Recently evaluated merchants" for the home dashboard.
 *
 * These are summaries read back from `recommendations` — the stored figure and the
 * card that won — not re-computations. The workings behind an old answer are not
 * persisted, so this list deliberately does not link to a breakdown; tapping a row
 * starts a fresh comparison at the same merchant, which is both honest and what
 * the user actually wants on a repeat trip.
 */
import { Pressable } from 'react-native';

import { EmptyState, ErrorNotice, LoadingState } from '@/components/StateViews';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { getCategoryById } from '@/domain/categories';
import { useRecentRecommendations } from '@/features/recommendations/hooks';
import type { RecommendationSummary } from '@/features/recommendations/api/recommendations';
import { formatUsd } from '@/lib/format';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

function summaryLabel(summary: RecommendationSummary): string {
  const category =
    summary.categoryId === null ? null : getCategoryById(summary.categoryId)?.displayName;

  return [
    `${summary.merchantInput}, ${formatUsd(summary.amountUsd)}.`,
    category === null || category === undefined ? null : `${category}.`,
    summary.recommendedCardName === null
      ? 'No card qualified.'
      : `You used ${summary.recommendedCardName}.`,
    summary.estimatedValueUsd === null
      ? null
      : `Estimated ${formatUsd(summary.estimatedValueUsd)}.`,
    summary.hasCodingWarning ? 'Merchant coding was uncertain.' : null,
    'Tap to compare again.',
  ]
    .filter((part): part is string => part !== null)
    .join(' ');
}

function RecentRow({
  summary,
  onPress,
}: {
  readonly summary: RecommendationSummary;
  readonly onPress: (summary: RecommendationSummary) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(summary)}
      accessibilityRole="button"
      accessibilityLabel={summaryLabel(summary)}
      accessibilityHint="Starts a new comparison at this merchant"
      testID={`recent-${summary.id}`}
      style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
    >
      <HStack gap="md" justify="space-between" align="center">
        <VStack gap="xxs" style={{ flex: 1 }}>
          <Text variant="callout" numberOfLines={1}>
            {summary.merchantInput}
          </Text>
          <Text variant="caption" tone="secondary">
            {summary.recommendedCardName ?? 'No card qualified'}
          </Text>
        </VStack>

        <VStack gap="xxs" align="flex-end">
          <Text variant="callout" tone="secondary" tabularNumbers>
            {formatUsd(summary.amountUsd)}
          </Text>
          {summary.estimatedValueUsd === null ? null : (
            <Text variant="caption" tone="success" tabularNumbers>
              {formatUsd(summary.estimatedValueUsd)} back
            </Text>
          )}
        </VStack>

        {summary.hasCodingWarning ? (
          <Badge label="Coding uncertain" tone="uncertain" glyph="!" />
        ) : null}
      </HStack>
    </Pressable>
  );
}

export function RecentRecommendations({
  onSelectMerchant,
  limit = 5,
  testID,
}: {
  readonly onSelectMerchant: (merchant: string) => void;
  readonly limit?: number;
  readonly testID?: string;
}) {
  const recent = useRecentRecommendations(limit);

  if (recent.isPending) {
    return <LoadingState label="Loading your recent comparisons" />;
  }

  if (recent.isError) {
    return (
      <ErrorNotice
        error={recent.error}
        onRetry={() => void recent.refetch()}
        testID="recent-error"
      />
    );
  }

  if (recent.data === undefined || recent.data.length === 0) {
    return (
      <EmptyState
        title="No comparisons yet"
        description="Once you have compared a purchase, the merchant appears here so a repeat trip is one tap."
        testID="recent-empty"
      />
    );
  }

  return (
    <Card testID={testID}>
      <VStack gap="md">
        <Text variant="title3" accessibilityRole="header">
          Recently evaluated
        </Text>

        <VStack gap="sm">
          {recent.data.map((summary) => (
            <RecentRow
              key={summary.id}
              summary={summary}
              onPress={(selected) => onSelectMerchant(selected.merchantInput)}
            />
          ))}
        </VStack>

        <Text variant="footnote" tone="tertiary">
          These are the figures we recorded at the time. Rates and caps change, so compare again
          rather than relying on an old answer.
        </Text>
      </VStack>
    </Card>
  );
}
