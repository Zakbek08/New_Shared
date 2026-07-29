/**
 * Screen 4 — The answer.
 *
 * One card, in words, with the figure it earns and why. Then the runner-up and the gap
 * between them, then every card that could not be used and the reason for each.
 *
 * The rejected cards are not filler. "Your 5% card is not activated" and "your 6% card
 * has spent its cap" are the two reasons a user would otherwise think the app was wrong,
 * and hiding them would turn a correct answer into an unexplained one.
 *
 * Every number on this screen came out of `evaluateWallet`. The wording is assembled by
 * `explainRecommendation` from the figures the engine produced. Nothing here is generated
 * by a model, and nothing is recomputed.
 */
import { useRouter } from 'expo-router';

import { DisclaimerNotice } from '@/components/Disclaimers';
import { EmptyState } from '@/components/StateViews';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Divider, HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { getCategoryById } from '@/domain/categories';
import { CONFIDENCE_LABELS } from '@/domain/enums';
import type { RecommendationCandidate } from '@/domain/rewards/types';
import { findMarketCard } from '@/data/marketCards';
import { CENTS_PER_POINT } from '@/features/local/recommend';
import { useLastResult } from '@/features/local/LastResult';
import { formatDay, formatUsd } from '@/lib/format';

/** The card's name as the user chose it in the catalog, not the engine's composite. */
function cardName(candidate: RecommendationCandidate): string {
  const card = findMarketCard(candidate.card.cardProductId);
  return card === null ? candidate.card.displayName : `${card.issuerName} ${card.productName}`;
}

function RejectedCard({ candidate }: { readonly candidate: RecommendationCandidate }) {
  return (
    <VStack gap="xxs" testID={`result-rejected-${candidate.card.userCardId}`}>
      <Text variant="callout">{cardName(candidate)}</Text>
      <Text variant="footnote" tone="tertiary">
        {candidate.reason}
      </Text>
    </VStack>
  );
}

export default function ResultScreen() {
  const router = useRouter();
  const { last } = useLastResult();

  // A reload, a deep link, or a back-navigation after the app restarted. Rather than
  // show a figure under the wrong purchase, say there is nothing to show.
  if (last === null) {
    return (
      <Screen accessibilityLabel="Best card" testID="result-screen">
        <EmptyState
          title="This answer is no longer in memory"
          description="Recommendations are worked out on your device when you ask, and are not stored. Run the purchase again to see the answer."
          actionLabel="Start a purchase"
          onAction={() => router.replace('/purchase')}
          testID="result-empty"
        />
      </Screen>
    );
  }

  const { result, input } = last;
  const winner = result.recommended;
  const category = getCategoryById(input.categoryId);

  if (winner === null) {
    return (
      <Screen scroll accessibilityLabel="Best card" testID="result-screen">
        <VStack gap="xl">
          <VStack gap="xs">
            <Text variant="title1" accessibilityRole="header">
              No card in your wallet qualifies
            </Text>
            <Text variant="body" tone="secondary">
              None of your cards can be used for {formatUsd(input.amountUsd)} at{' '}
              {input.merchant}. Every reason is below.
            </Text>
          </VStack>

          <Card>
            <VStack gap="md">
              <Text variant="title3" accessibilityRole="header">
                Why each card was ruled out
              </Text>
              {result.ineligible.map((candidate) => (
                <RejectedCard key={candidate.card.userCardId} candidate={candidate} />
              ))}
            </VStack>
          </Card>

          <Button
            label="Start another purchase"
            size="large"
            fullWidth
            onPress={() => router.replace('/purchase')}
            testID="result-again"
          />
          <DisclaimerNotice kind="financial" />
        </VStack>
      </Screen>
    );
  }

  const isPointsCard = winner.breakdown.rewardUnit !== 'usd';
  const ratesAsOf = findMarketCard(winner.card.cardProductId)?.ratesAsOf ?? null;

  return (
    <Screen scroll accessibilityLabel="Best card" testID="result-screen">
      <VStack gap="xl">
        <VStack gap="xs">
          <Text variant="footnote" tone="tertiary">
            {formatUsd(input.amountUsd)} at {input.merchant}
            {category === undefined ? '' : ` · ${category.displayName}`}
          </Text>
          <Text variant="title1" accessibilityRole="header">
            Use your {cardName(winner)}
          </Text>
        </VStack>

        {/* The headline figure, and the sentence the engine assembled to explain it. */}
        <Card emphasis="best" testID="result-winner">
          <VStack gap="md">
            <VStack gap="xxs">
              <Text variant="label" tone="secondary">
                You should earn about
              </Text>
              <Text variant="display" tone="success" tabularNumbers>
                {formatUsd(winner.breakdown.netValueUsd)}
              </Text>
            </VStack>

            <Text variant="body">{result.explanation}</Text>

            <HStack gap="sm" wrap align="flex-start">
              <Badge label={CONFIDENCE_LABELS[result.confidence]} tone="neutral" />
              {winner.capRemainingUsd === null ? null : (
                <Badge
                  label={`${formatUsd(winner.capRemainingUsd)} of the bonus cap left`}
                  tone="neutral"
                />
              )}
            </HStack>
          </VStack>
        </Card>

        {/* Why it beat the alternative, in dollars. Without this the answer is an
            assertion; with it, the user can see the size of the decision. */}
        {result.runnerUp === null ? null : (
          <Card testID="result-runner-up">
            <VStack gap="sm">
              <Text variant="title3" accessibilityRole="header">
                Next best
              </Text>
              <Text variant="body">
                {cardName(result.runnerUp)} would earn{' '}
                {formatUsd(result.runnerUp.breakdown.netValueUsd)}.
              </Text>
              {result.advantageOverRunnerUpUsd === null ? null : (
                <Text variant="callout" tone="secondary">
                  {result.advantageOverRunnerUpUsd === 0
                    ? 'The two are worth the same on this purchase, so either is fine.'
                    : `Using the recommended card is worth ${formatUsd(result.advantageOverRunnerUpUsd)} more.`}
                </Text>
              )}
            </VStack>
          </Card>
        )}

        {result.ineligible.length === 0 ? null : (
          <Card testID="result-rejected">
            <VStack gap="md">
              <Text variant="title3" accessibilityRole="header">
                Cards that could not be used
              </Text>
              {result.ineligible.map((candidate, index) => (
                <VStack key={candidate.card.userCardId} gap="sm">
                  {index > 0 ? <Divider /> : null}
                  <RejectedCard candidate={candidate} />
                </VStack>
              ))}
            </VStack>
          </Card>
        )}

        {/* Where the numbers came from, and what they assume. */}
        <Card testID="result-basis">
          <VStack gap="sm">
            <Text variant="title3" accessibilityRole="header">
              What this is based on
            </Text>
            <Text variant="callout" tone="secondary">
              {winner.breakdown.appliedRuleLabel === null
                ? 'This card’s standard earn rate.'
                : winner.breakdown.appliedRuleLabel}
            </Text>
            {ratesAsOf === null ? null : (
              <Text variant="footnote" tone="tertiary">
                That rate was read from the issuer’s own page on{' '}
                {formatDay(ratesAsOf) ?? ratesAsOf}. Issuers change terms without notice —
                confirm with your bank before relying on it.
              </Text>
            )}
            {isPointsCard ? (
              <Text variant="footnote" tone="tertiary">
                This card earns points, not cash. They are valued here at {CENTS_PER_POINT}¢
                each, which is a deliberately cautious floor — your own redemptions may be worth
                more, and never less.
              </Text>
            ) : null}
            <Text variant="footnote" tone="tertiary">
              Worked out on your device from the rates above. Nothing was sent anywhere, and no
              part of this figure was generated by an AI model.
            </Text>
          </VStack>
        </Card>

        <Button
          label="Start another purchase"
          size="large"
          fullWidth
          onPress={() => router.replace('/purchase')}
          accessibilityHint="Returns to the purchase screen"
          testID="result-again"
        />

        <DisclaimerNotice kind="financial" />
        <DisclaimerNotice kind="merchant_category" />
      </VStack>
    </Screen>
  );
}
