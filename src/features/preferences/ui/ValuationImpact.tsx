/**
 * What the current valuations do to the ranking.
 *
 * This is the honest way to present a preference that changes financial advice: run
 * the real engine on a reference purchase and show the order it produces. Edit a
 * valuation and this list re-ranks, because saving invalidates the wallet snapshot
 * the engine reads.
 *
 * Nothing here is illustrative. Every figure comes from `evaluateWallet` over the
 * user's actual wallet, at the reference amount stated on screen.
 */
import { useMemo } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { getCategoryBySlug } from '@/domain/categories';
import { evaluateWallet, type RecommendationCandidate } from '@/domain/rewards';
import { useWalletSnapshot } from '@/features/recommendations/hooks';
import { formatRewardRate, formatUsd } from '@/lib/format';

/** The reference purchase. Round, legible, and stated on screen. */
export const IMPACT_AMOUNT_USD = 100;

export function ValuationImpact({
  asOf,
  testID,
}: {
  readonly asOf: Date;
  readonly testID?: string;
}) {
  const snapshot = useWalletSnapshot();

  const ranked = useMemo<readonly RecommendationCandidate[]>(() => {
    if (snapshot.data === undefined) return [];

    const dining = getCategoryBySlug('dining');

    // Dining is the reference category because it is where cash-back and
    // points-earning cards most often compete, so a change in valuation shows up.
    const result = evaluateWallet(
      {
        merchantInput: 'Dining',
        amountUsd: IMPACT_AMOUNT_USD,
        currencyCode: 'USD',
        countryCode: 'US',
        channel: 'in_store',
        paymentMethod: 'physical_card',
        categoryId: dining.id,
        merchantId: null,
        mcc: null,
        categoryMatchKind: 'user_selected',
        categoryConfidence: 'high',
        hasAmbiguousCoding: false,
      },
      snapshot.data.cards,
      {
        asOf,
        homeCurrencyCode: 'USD',
        valuation: snapshot.data.valuation,
      },
    );

    return result.eligible.slice(0, 3);
  }, [snapshot.data, asOf]);

  if (snapshot.isPending || snapshot.isError || ranked.length === 0) return null;

  return (
    <Card testID={testID}>
      <VStack gap="md">
        <VStack gap="xxs">
          <Text variant="title3" accessibilityRole="header">
            What your settings do right now
          </Text>
          <Text variant="caption" tone="secondary">
            Your best cards for a {formatUsd(IMPACT_AMOUNT_USD)} restaurant purchase, using the
            values above. Change a value and this order changes with it.
          </Text>
        </VStack>

        <VStack gap="sm">
          {ranked.map((candidate, index) => (
            <HStack
              key={candidate.card.userCardId}
              gap="md"
              justify="space-between"
              align="center"
              accessible
              accessibilityLabel={`${index === 0 ? 'Best. ' : `Number ${index + 1}. `}${
                candidate.card.displayName
              }. ${formatUsd(candidate.breakdown.netValueUsd)} on ${formatUsd(
                IMPACT_AMOUNT_USD,
              )}.`}
              testID={`valuation-impact-${candidate.card.userCardId}`}
            >
              <VStack gap="xxs" style={{ flex: 1 }}>
                <Text variant="callout">{candidate.card.displayName}</Text>
                {candidate.breakdown.effectiveRate === null ||
                candidate.breakdown.rewardType === null ? null : (
                  <Text variant="caption" tone="secondary" tabularNumbers>
                    {formatRewardRate(
                      candidate.breakdown.effectiveRate,
                      candidate.breakdown.rewardType,
                    )}
                  </Text>
                )}
              </VStack>

              {index === 0 ? <Badge label="Best" tone="best" glyph="✓" /> : null}

              <Text
                variant="bodyStrong"
                tone={index === 0 ? 'success' : 'primary'}
                tabularNumbers
                accessibilityElementsHidden
              >
                {formatUsd(candidate.breakdown.netValueUsd)}
              </Text>
            </HStack>
          ))}
        </VStack>

        <Text variant="footnote" tone="tertiary">
          Worked out by the same engine that answers a real purchase, from the rules on your own
          cards. Not an illustration.
        </Text>
      </VStack>
    </Card>
  );
}
