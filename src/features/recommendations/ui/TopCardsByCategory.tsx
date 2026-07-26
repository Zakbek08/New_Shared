/**
 * "Your top cards by category" for the home dashboard.
 *
 * Runs the real engine against a reference purchase in each category rather than
 * printing a headline rate off the rule, because the two genuinely differ once
 * caps, activation and the user's own point valuations are taken into account.
 *
 * Categories where nothing qualifies say so. That gap is useful information —
 * "no card in your wallet earns a bonus on transit" is a real answer — and
 * inventing a figure to fill it would be the exact defect CLAUDE.md forbids.
 */
import { useMemo } from 'react';

import { EmptyState, ErrorNotice, LoadingState } from '@/components/StateViews';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { useWalletSnapshot } from '@/features/recommendations/hooks';
import {
  REFERENCE_AMOUNT_USD,
  topCardsByCategory,
  type TopCardForCategory,
} from '@/features/recommendations/topCards';
import { formatCardName, formatUsd } from '@/lib/format';

function CategoryRow({ entry }: { readonly entry: TopCardForCategory }) {
  const { category, candidate, effectiveReturnPercent } = entry;

  if (candidate === null) {
    return (
      <HStack gap="md" justify="space-between" align="center">
        <Text variant="callout" style={{ flex: 1 }}>
          {category.displayName}
        </Text>
        <Text
          variant="caption"
          tone="tertiary"
          accessibilityLabel={`${category.displayName}. No card in your wallet earns a bonus here.`}
        >
          No bonus card
        </Text>
      </HStack>
    );
  }

  const name = formatCardName(candidate.card.displayName, candidate.card.nickname);

  return (
    <HStack
      gap="md"
      justify="space-between"
      align="center"
      accessible
      accessibilityLabel={`${category.displayName}. Best card ${name}. ${
        effectiveReturnPercent === null ? '' : `About ${effectiveReturnPercent}% back. `
      }Worth ${formatUsd(candidate.breakdown.netValueUsd)} on a ${formatUsd(
        REFERENCE_AMOUNT_USD,
      )} purchase.`}
    >
      <VStack gap="xxs" style={{ flex: 1 }}>
        <Text variant="callout">{category.displayName}</Text>
        <Text variant="caption" tone="secondary">
          {name}
        </Text>
      </VStack>
      {effectiveReturnPercent === null ? null : (
        <Text variant="bodyStrong" tone="accent" tabularNumbers accessibilityElementsHidden>
          {effectiveReturnPercent}%
        </Text>
      )}
    </HStack>
  );
}

export function TopCardsByCategory({
  asOf,
  testID,
}: {
  /**
   * The instant to evaluate against, supplied by the screen.
   *
   * The engine never reads a clock; time enters here, at the edge, so a test can
   * pin it and get a stable list.
   */
  readonly asOf: Date;
  readonly testID?: string;
}) {
  const snapshot = useWalletSnapshot();

  // Keyed on the snapshot object and the instant, so the thirteen evaluations do
  // not re-run on every unrelated render.
  const entries = useMemo<readonly TopCardForCategory[]>(() => {
    if (snapshot.data === undefined) return [];
    return topCardsByCategory({
      cards: snapshot.data.cards,
      valuation: snapshot.data.valuation,
      asOf,
    });
  }, [snapshot.data, asOf]);

  if (snapshot.isPending) {
    return <LoadingState label="Working out your best card for each category" />;
  }

  if (snapshot.isError) {
    return (
      <ErrorNotice
        error={snapshot.error}
        onRetry={() => void snapshot.refetch()}
        testID="top-cards-error"
      />
    );
  }

  if (snapshot.data === undefined || snapshot.data.cards.length === 0) {
    return (
      <EmptyState
        title="Add a card to see this"
        description="Once your wallet has a card, WalletWise works out your best option for each category."
        testID="top-cards-empty"
      />
    );
  }

  const withBonus = entries.filter((entry) => entry.candidate !== null).length;

  return (
    <Card testID={testID}>
      <VStack gap="md">
        <VStack gap="xxs">
          <Text variant="title3" accessibilityRole="header">
            Your top cards by category
          </Text>
          <Text variant="caption" tone="secondary">
            Compared on a {formatUsd(REFERENCE_AMOUNT_USD)} reference purchase, in store.
          </Text>
        </VStack>

        <HStack gap="sm" wrap align="flex-start">
          <Badge label={`${withBonus} of ${entries.length} covered`} tone="neutral" />
        </HStack>

        <VStack gap="sm">
          {entries.map((entry) => (
            <CategoryRow key={entry.category.slug} entry={entry} />
          ))}
        </VStack>

        <Text variant="footnote" tone="tertiary">
          A real purchase can rank differently — a nearly-exhausted cap or an unactivated bonus
          changes the answer. Enter the purchase for the figure that counts.
        </Text>
      </VStack>
    </Card>
  );
}
