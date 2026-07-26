/**
 * Screen 10 — Recommendation Details.
 *
 * The audit trail for one recommendation: every step of the arithmetic, in order,
 * with the source of each number.
 *
 * This screen is why the engine is deterministic. A user can follow the
 * calculation from purchase amount to final dollar value and reproduce it on
 * paper. The explanation layer phrases those steps; it does not compute them.
 *
 * The figures come from the in-memory result, not from a re-fetch. See
 * `RecommendationProvider` for why: the engine's input snapshot is deliberately
 * not persisted, and rebuilding it from the stored candidates would mean
 * inventing the parts we chose not to store.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';

import { DisclaimerNotice } from '@/components/Disclaimers';
import { PlaceholderSection } from '@/components/PlaceholderSection';
import { EmptyState } from '@/components/StateViews';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Divider, HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { getCategoryById } from '@/domain/categories';
import { CATEGORY_MATCH_KIND_LABELS, CONFIDENCE_LABELS } from '@/domain/enums';
import { useLatestRecommendation } from '@/features/recommendations/RecommendationProvider';
import {
  describeCategoryDecision,
  describeRuleRequirements,
  describeSource,
  otherRulesOnCard,
} from '@/features/recommendations/ruleFacts';
import { BreakdownTable } from '@/features/recommendations/ui/BreakdownTable';
import { formatRewardRate, formatUsd, formatVerifiedOn } from '@/lib/format';

/** The order the engine applies its steps in. Documented in REWARDS_ENGINE.md. */
const CALCULATION_STEPS: readonly string[] = [
  'Collect every active reward rule for the card',
  'Check whether this purchase satisfies each rule',
  'Apply merchant and category exclusions',
  'Check activation, where the rule needs it',
  'Work out how much of the cap is left',
  'Apply the base and bonus rates',
  'Apply any active merchant offer',
  'Subtract the foreign transaction fee, if one applies',
  'Convert points or miles using your own valuation',
  'Assign a confidence level',
];

export default function RecommendationDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { latest } = useLatestRecommendation();

  // A deep link, a restart, or a link to an older recommendation. Rather than
  // render the wrong calculation under the right id, say there is nothing to show.
  const isCurrent = latest !== null && (id === undefined || latest.recommendationId === id);
  const candidate = latest?.result.recommended ?? null;

  if (latest === null || !isCurrent || candidate === null) {
    return (
      <Screen accessibilityLabel="Recommendation details" testID="recommendation-details">
        <EmptyState
          title="This calculation is no longer in memory"
          description="Workings are held only for the recommendation you are looking at now, because they are computed on your device rather than stored. Run the purchase again to see the full breakdown."
          actionLabel="Start a purchase"
          onAction={() => router.replace('/(app)/assistant')}
          testID="details-empty"
        />
      </Screen>
    );
  }

  const { result, classification } = latest;
  const { intent } = result;
  const { breakdown } = candidate;

  const category =
    intent.categoryId === null ? null : (getCategoryById(intent.categoryId) ?? null);
  const appliedRule =
    candidate.card.rules.find((rule) => rule.id === breakdown.appliedRuleId) ?? null;
  const requirements = appliedRule === null ? [] : describeRuleRequirements(appliedRule);
  const alsoConsidered = otherRulesOnCard(candidate.card, breakdown.appliedRuleId).filter(
    (comparison) => !comparison.isApplied,
  );

  return (
    <Screen scroll accessibilityLabel="Recommendation details" testID="recommendation-details">
      <VStack gap="xl">
        <VStack gap="sm">
          <Text variant="title1" accessibilityRole="header">
            How we worked this out
          </Text>
          <Text variant="body" tone="secondary">
            {formatUsd(intent.amountUsd)} at {intent.merchantInput}
            {category === null ? '' : ` · ${category.displayName}`}
          </Text>
          <Text variant="footnote" tone="tertiary">
            Engine {result.engineVersion} · evaluated{' '}
            {result.computedAt.toISOString().slice(0, 10)}
          </Text>
        </VStack>

        {/* ---- The arithmetic itself ---- */}
        <BreakdownTable
          candidate={candidate}
          amountUsd={intent.amountUsd}
          testID="details-breakdown"
        />

        {/* ---- Why this rule, and not another on the same card ---- */}
        <Card testID="details-rule">
          <VStack gap="md">
            <Text variant="title3" accessibilityRole="header">
              Why this rule applied
            </Text>

            {appliedRule === null ? (
              <Text variant="callout" tone="secondary">
                No bonus rule matched this purchase, so the card&apos;s base rate was used.
              </Text>
            ) : (
              <VStack gap="sm">
                <Text variant="bodyStrong">{appliedRule.label}</Text>
                {breakdown.effectiveRate !== null && breakdown.rewardType !== null ? (
                  <Text variant="callout" tone="accent" tabularNumbers>
                    {formatRewardRate(breakdown.effectiveRate, breakdown.rewardType)}
                  </Text>
                ) : null}

                {requirements.length > 0 ? (
                  <VStack gap="xs">
                    <Text variant="label" tone="secondary">
                      What it required, all of which this purchase met
                    </Text>
                    {requirements.map((requirement) => (
                      <Text
                        key={requirement}
                        variant="callout"
                        tone="secondary"
                        accessibilityLabel={`Requirement met. ${requirement}.`}
                      >
                        ✓ {requirement}
                      </Text>
                    ))}
                  </VStack>
                ) : (
                  <Text variant="callout" tone="secondary">
                    This rule applies to every purchase on the card, with no extra conditions.
                  </Text>
                )}
              </VStack>
            )}

            {alsoConsidered.length > 0 ? (
              <VStack gap="xs">
                <Divider />
                <Text variant="label" tone="secondary">
                  Also considered on this card
                </Text>
                {alsoConsidered.map(({ rule }) => (
                  <Text
                    key={rule.id}
                    variant="callout"
                    tone="tertiary"
                    accessibilityLabel={`Also considered. ${rule.label}. Did not win.`}
                  >
                    {rule.label}
                  </Text>
                ))}
                <Text variant="footnote" tone="tertiary">
                  Each of these was evaluated against the same purchase. The rule above produced
                  the higher value.
                </Text>
              </VStack>
            ) : null}
          </VStack>
        </Card>

        {/* ---- How the category was decided ---- */}
        <Card
          emphasis={intent.hasAmbiguousCoding ? 'uncertain' : 'neutral'}
          testID="details-category"
        >
          <VStack gap="sm">
            <Text variant="title3" accessibilityRole="header">
              How the category was decided
            </Text>
            <HStack gap="sm" wrap align="flex-start">
              <Badge
                label={CATEGORY_MATCH_KIND_LABELS[intent.categoryMatchKind]}
                tone={
                  intent.categoryMatchKind === 'exact_merchant' ||
                  intent.categoryMatchKind === 'known_mcc'
                    ? 'best'
                    : intent.categoryMatchKind === 'unknown'
                      ? 'negative'
                      : 'uncertain'
                }
              />
              <Badge
                label={CONFIDENCE_LABELS[intent.categoryConfidence]}
                tone={
                  intent.categoryConfidence === 'high'
                    ? 'best'
                    : intent.categoryConfidence === 'medium'
                      ? 'uncertain'
                      : 'negative'
                }
              />
            </HStack>
            <Text variant="callout" tone="secondary">
              {describeCategoryDecision(classification)}
            </Text>
            {intent.mcc === null ? null : (
              <Text variant="footnote" tone="tertiary" tabularNumbers>
                Merchant category code used: {intent.mcc}
              </Text>
            )}
          </VStack>
        </Card>

        {/* ---- Confidence and source ---- */}
        <Card testID="details-confidence">
          <VStack gap="sm">
            <Text variant="title3" accessibilityRole="header">
              How much to trust this figure
            </Text>
            <Text variant="callout" tone="secondary">
              Overall confidence: {CONFIDENCE_LABELS[result.confidence]}
            </Text>
            <Text variant="callout" tone="secondary">
              {describeSource(candidate)}
            </Text>
            <Text variant="footnote" tone="tertiary">
              {formatVerifiedOn(candidate.sourceVerifiedAt)}
            </Text>
            <Text variant="footnote" tone="tertiary">
              Confidence is the weakest link in the chain: a rate we are sure of, applied to a
              merchant category we are not, is still a low-confidence answer.
            </Text>
          </VStack>
        </Card>

        {/* ---- The engine's order of operations ---- */}
        <Card>
          <VStack gap="md">
            <Text variant="title3" accessibilityRole="header">
              The steps, in order
            </Text>
            <VStack gap="sm">
              {CALCULATION_STEPS.map((step, index) => (
                <Text
                  key={step}
                  variant="callout"
                  tone="secondary"
                  accessibilityLabel={`Step ${index + 1}. ${step}`}
                >
                  {index + 1}. {step}
                </Text>
              ))}
            </VStack>
            <Text variant="footnote" tone="tertiary">
              Every one of these steps is a plain TypeScript function reading validated database
              records. Nothing on this screen is generated by a model.
            </Text>
          </VStack>
        </Card>

        <PlaceholderSection
          phase="Phase 6"
          title="Source document and change history"
          description="The source document behind the rate, who last verified it, and the full history of changes to the rule."
          testID="details-source"
        />

        <Button
          label="Back to the comparison"
          variant="ghost"
          fullWidth
          onPress={() => router.back()}
        />

        <DisclaimerNotice kind="financial" />
        <DisclaimerNotice kind="merchant_category" />
      </VStack>
    </Screen>
  );
}
