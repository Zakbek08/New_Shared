/**
 * Screen 9 — Recommendation Results.
 *
 * Makes the comparison unmistakable: the winner in green, the runner-up beside it
 * for reference, an amber warning when the merchant's coding is uncertain, and red
 * wherever a fee or an ineligible card costs the user money.
 *
 * Every figure on this screen comes from the deterministic engine. There is no
 * code path in which a model produces a number here.
 */
import { useRouter } from 'expo-router';

import { DisclaimerNotice, MerchantCodingWarning } from '@/components/Disclaimers';
import { EmptyState } from '@/components/StateViews';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { getCategoryById } from '@/domain/categories';
import { useAcceptRecommendation } from '@/features/recommendations/hooks';
import { useLatestRecommendation } from '@/features/recommendations/RecommendationProvider';
import { CandidateCard } from '@/features/recommendations/ui/CandidateCard';
import { formatUsd } from '@/lib/format';

export default function RecommendationResultsScreen() {
  const router = useRouter();
  const { latest } = useLatestRecommendation();
  const accept = useAcceptRecommendation();

  // Opening this screen without a live result — a deep link, or after a restart.
  // The engine's input snapshot is deliberately not persisted, so there is nothing
  // honest to render; say so and offer the way forward.
  if (latest === null) {
    return (
      <Screen accessibilityLabel="Recommendation results" testID="results-screen">
        <EmptyState
          title="No recommendation to show"
          description="Recommendations are worked out on your device from your current wallet. Start a purchase and we will compare your cards."
          actionLabel="Start a purchase"
          onAction={() => router.replace('/(app)/assistant')}
          testID="results-empty"
        />
      </Screen>
    );
  }

  const { result, classification, recommendationId } = latest;
  const { intent } = result;

  const category =
    intent.categoryId === null ? null : (getCategoryById(intent.categoryId) ?? null);

  return (
    <Screen scroll accessibilityLabel="Recommendation results" testID="results-screen">
      <VStack gap="xl">
        {/* ---- What we evaluated ---- */}
        <VStack gap="sm">
          <Text variant="title1" accessibilityRole="header">
            Best card for this purchase
          </Text>
          <Text
            variant="body"
            tone="secondary"
            accessibilityLabel={`Comparing ${formatUsd(intent.amountUsd)} at ${intent.merchantInput}${
              category === null ? '' : `, category ${category.displayName}`
            }`}
          >
            {formatUsd(intent.amountUsd)} at {intent.merchantInput}
            {category === null ? '' : ` · ${category.displayName}`}
          </Text>
          <HStack gap="sm" wrap align="flex-start">
            <Badge label={intent.channel === 'online' ? 'Online' : 'In store'} tone="neutral" />
            {intent.currencyCode !== 'USD' ? (
              <Badge label={intent.currencyCode} tone="uncertain" glyph="!" />
            ) : null}
            {classification.resolvedMerchantName !== null ? (
              <Badge label={`Matched ${classification.resolvedMerchantName}`} tone="neutral" />
            ) : null}
          </HStack>
        </VStack>

        {/* ---- The amber warning, when the coding is uncertain ---- */}
        {intent.hasAmbiguousCoding ? (
          <MerchantCodingWarning
            merchantName={classification.resolvedMerchantName ?? intent.merchantInput}
          />
        ) : null}

        {classification.disagreesWithUserSelection ? (
          <Card emphasis="uncertain">
            <VStack gap="sm">
              <Badge label="Different from your choice" tone="uncertain" glyph="!" />
              <Text variant="callout" tone="secondary">
                You picked a different category, but this merchant is usually coded as{' '}
                {category?.displayName ?? 'something else'}. Your issuer decides the category,
                so we have used the coding rather than the choice.
              </Text>
            </VStack>
          </Card>
        ) : null}

        {/* ---- The plain-language answer ---- */}
        <Card emphasis={result.recommended === null ? 'negative' : 'best'}>
          <VStack gap="sm">
            <Text variant="title3" accessibilityRole="header">
              In short
            </Text>
            <Text variant="body">{result.explanation}</Text>
          </VStack>
        </Card>

        {/* ---- The winner ---- */}
        {result.recommended !== null ? (
          <VStack gap="md">
            <CandidateCard
              candidate={result.recommended}
              isRecommended
              testID="results-recommended"
            />

            <HStack gap="md" wrap>
              <Button
                label="I used this card"
                onPress={() => accept.mutate(recommendationId)}
                loading={accept.isPending}
                disabled={accept.isSuccess}
                accessibilityHint="Records that you followed this recommendation, which helps track your cap progress"
                testID="results-accept"
              />
              <Button
                label="How we worked this out"
                variant="secondary"
                onPress={() => router.push(`/recommendations/${recommendationId}`)}
                accessibilityHint="Opens the full calculation"
                testID="results-details"
              />
            </HStack>

            {accept.isSuccess ? (
              <Text variant="caption" tone="success" accessibilityLiveRegion="polite">
                Noted. We will use this to track your cap progress.
              </Text>
            ) : null}
          </VStack>
        ) : null}

        {/* ---- Runner-up ---- */}
        {result.runnerUp !== null ? (
          <VStack gap="sm">
            <Text variant="title3" accessibilityRole="header">
              Second best
            </Text>
            {result.advantageOverRunnerUpUsd !== null && result.advantageOverRunnerUpUsd > 0 ? (
              <Text variant="callout" tone="secondary">
                {formatUsd(result.advantageOverRunnerUpUsd)} less than the card above.
              </Text>
            ) : null}
            <CandidateCard
              candidate={result.runnerUp}
              isRecommended={false}
              testID="results-runner-up"
            />
          </VStack>
        ) : null}

        {/* ---- The rest of the eligible cards ---- */}
        {result.eligible.length > 2 ? (
          <VStack gap="sm">
            <Text variant="title3" accessibilityRole="header">
              Your other cards
            </Text>
            {result.eligible.slice(2).map((candidate) => (
              <CandidateCard
                key={candidate.card.userCardId}
                candidate={candidate}
                isRecommended={false}
                testID={`results-eligible-${candidate.card.userCardId}`}
              />
            ))}
          </VStack>
        ) : null}

        {/* ---- Ineligible, always shown with a reason ---- */}
        {result.ineligible.length > 0 ? (
          <VStack gap="sm">
            <Text variant="title3" accessibilityRole="header">
              Cards that do not qualify
            </Text>
            <Text variant="callout" tone="secondary">
              Shown with the reason for each, so you can see what we ruled out and why.
            </Text>
            {result.ineligible.map((candidate) => (
              <CandidateCard
                key={candidate.card.userCardId}
                candidate={candidate}
                isRecommended={false}
                testID={`results-ineligible-${candidate.card.userCardId}`}
              />
            ))}
          </VStack>
        ) : null}

        <Button
          label="Compare another purchase"
          variant="ghost"
          fullWidth
          onPress={() => router.replace('/(app)/assistant')}
        />

        <DisclaimerNotice kind="financial" />
        <DisclaimerNotice kind="estimate" />
      </VStack>
    </Screen>
  );
}
