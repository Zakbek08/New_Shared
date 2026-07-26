/**
 * Screen 9 — Recommendation Results.
 *
 * The answer screen. Its job is to make the comparison unmistakable: the winner
 * in green, the runner-up beside it for reference, an amber warning when the
 * merchant's coding is uncertain, and red wherever a fee or an ineligible card
 * costs the user money.
 *
 * Phase 4 populates this from `RecommendationResult`. Every figure it shows will
 * come from the deterministic engine — there is no code path in which a model
 * produces a number here.
 */
import { DisclaimerNotice, MerchantCodingWarning } from '@/components/Disclaimers';
import { PlaceholderSection } from '@/components/PlaceholderSection';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';

export default function RecommendationResultsScreen() {
  return (
    <Screen scroll accessibilityLabel="Recommendation results" testID="results-screen">
      <VStack gap="xl">
        <VStack gap="sm">
          <Text variant="title1" accessibilityRole="header">
            Best card for this purchase
          </Text>
          <Text variant="body" tone="secondary">
            Every eligible card, ranked by what it earns you after fees.
          </Text>
        </VStack>

        {/* The three semantic states, shown as the real components so the colour
            language can be reviewed now rather than after the engine lands. */}
        <Card emphasis="best" testID="results-legend-best">
          <VStack gap="sm">
            <HStack gap="sm" wrap>
              <Badge label="Best value" tone="best" glyph="✓" />
            </HStack>
            <Text variant="callout" tone="secondary">
              Green marks the highest-value card. Phase 4 fills this with the recommended card,
              the estimated reward, its dollar value, the reward rate and the reason.
            </Text>
          </VStack>
        </Card>

        <MerchantCodingWarning />

        <Card emphasis="negative" testID="results-legend-negative">
          <VStack gap="sm">
            <HStack gap="sm" wrap>
              <Badge label="Fee applies" tone="negative" glyph="−" />
              <Badge label="Not eligible" tone="negative" glyph="×" />
            </HStack>
            <Text variant="callout" tone="secondary">
              Red marks a foreign transaction fee or a card that cannot be used for this
              purchase. Ineligible cards are always shown with the reason, never hidden.
            </Text>
          </VStack>
        </Card>

        <PlaceholderSection
          phase="Phase 4"
          title="Recommended card"
          description="Card name, estimated reward in its own units, estimated dollar value, reward rate, plain-language reason, relevant cap and remaining cap, any active offer, confidence level and the date the rate was last verified."
          testID="results-recommended"
        />

        <PlaceholderSection
          phase="Phase 4"
          title="Second-best option"
          description="The runner-up and how much less it earns, so the recommendation is checkable rather than something to take on faith."
          testID="results-runner-up"
        />

        <PlaceholderSection
          phase="Phase 4"
          title="Cards that do not qualify"
          description="Every excluded card with its specific reason: category mismatch, merchant excluded, cap exhausted, activation needed, expired rule or unsupported country."
          testID="results-ineligible"
        />

        <DisclaimerNotice kind="financial" />
        <DisclaimerNotice kind="estimate" />
      </VStack>
    </Screen>
  );
}
