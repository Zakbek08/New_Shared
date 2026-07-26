/**
 * One entered offer.
 *
 * Shows exactly what the user typed, with no rate inference and no "estimated
 * value": what an offer is worth depends on the purchase, and the engine works that
 * out at comparison time. Printing a number here would be a figure nobody computed.
 */
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { PURCHASE_CHANNEL_LABELS } from '@/domain/enums';
import type { WalletOffer } from '@/features/offers/api/offers';
import { formatRewardRate, formatUsd } from '@/lib/format';

const STATUS_LABELS: Readonly<Record<WalletOffer['status'], string>> = {
  available: 'Not activated',
  enrolled: 'Activated',
  redeemed: 'Used',
  expired: 'Expired',
  declined: 'Dismissed',
};

/** How the reward is stated, using only what the user entered. */
export function offerRewardLabel(offer: WalletOffer): string {
  if (offer.fixedAmountUsd !== null && offer.fixedAmountUsd > 0) {
    return `${formatUsd(offer.fixedAmountUsd)} back`;
  }
  if (offer.rate > 0) {
    return `${formatRewardRate(offer.rate, offer.rewardType)} back`;
  }
  // Both zero is rejected by `userOfferSchema`, so this is a row written before that
  // validation existed or edited outside the app. Say so rather than print "0%".
  return 'Reward not recorded';
}

function endsLabel(endsAt: string | null): string | null {
  if (endsAt === null) return null;
  const parsed = new Date(endsAt);
  if (Number.isNaN(parsed.getTime())) return null;

  return `Ends ${new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed)}`;
}

export function OfferRow({
  offer,
  onActivate,
  onMarkUsed,
  onDelete,
  isSaving = false,
  testID,
}: {
  readonly offer: WalletOffer;
  readonly onActivate: (offer: WalletOffer) => void;
  readonly onMarkUsed: (offer: WalletOffer) => void;
  readonly onDelete: (offer: WalletOffer) => void;
  readonly isSaving?: boolean;
  readonly testID?: string;
}) {
  const isSpent = offer.status === 'redeemed' || offer.status === 'expired';
  const ends = endsLabel(offer.endsAt);

  return (
    <Card
      emphasis={isSpent ? 'neutral' : offer.isEnrolled ? 'best' : 'uncertain'}
      accessibilityLabel={[
        `${offer.title}.`,
        `${offerRewardLabel(offer)}.`,
        offer.merchantLabel === null ? null : `At ${offer.merchantLabel}.`,
        `On your ${offer.cardName}.`,
        `${STATUS_LABELS[offer.status]}.`,
        offer.minimumSpendUsd > 0 ? `Minimum spend ${formatUsd(offer.minimumSpendUsd)}.` : null,
        ends,
      ]
        .filter((part): part is string => part !== null)
        .join(' ')}
      testID={testID}
    >
      <VStack gap="md">
        <VStack gap="xxs">
          <Text variant="title3">{offer.title}</Text>
          <Text variant="caption" tone="secondary">
            {offer.merchantLabel ?? 'Merchant not named'} · {offer.cardName}
          </Text>
        </VStack>

        <Text variant="bodyStrong" tone="accent">
          {offerRewardLabel(offer)}
        </Text>

        <HStack gap="sm" wrap align="flex-start">
          <Badge
            label={STATUS_LABELS[offer.status]}
            tone={
              offer.status === 'enrolled'
                ? 'best'
                : offer.status === 'available'
                  ? 'uncertain'
                  : 'neutral'
            }
            glyph={offer.status === 'available' ? '!' : undefined}
          />
          {offer.minimumSpendUsd > 0 ? (
            <Badge label={`${formatUsd(offer.minimumSpendUsd)} minimum`} tone="neutral" />
          ) : null}
          {offer.maxBenefitUsd === null ? null : (
            <Badge label={`Up to ${formatUsd(offer.maxBenefitUsd)}`} tone="neutral" />
          )}
          {offer.channel === 'either' ? null : (
            <Badge label={PURCHASE_CHANNEL_LABELS[offer.channel]} tone="neutral" />
          )}
        </HStack>

        {offer.description === null ? null : (
          <Text variant="callout" tone="secondary">
            {offer.description}
          </Text>
        )}

        {ends === null ? null : (
          <Text variant="footnote" tone="tertiary">
            {ends}
          </Text>
        )}

        {isSpent ? null : (
          <HStack gap="sm" wrap>
            {offer.isEnrolled ? null : (
              <Button
                label="I activated it"
                variant="secondary"
                loading={isSaving}
                onPress={() => onActivate(offer)}
                accessibilityHint="Records that you activated this offer with your issuer. Only an activated offer counts towards a recommendation."
                testID={`offer-activate-${offer.id}`}
              />
            )}
            <Button
              label="I used it"
              variant="secondary"
              onPress={() => onMarkUsed(offer)}
              accessibilityHint="Marks the offer as redeemed so it stops affecting recommendations"
              testID={`offer-redeem-${offer.id}`}
            />
            <Button
              label="Remove"
              variant="ghost"
              onPress={() => onDelete(offer)}
              accessibilityHint="Deletes this offer from WalletWise"
              testID={`offer-delete-${offer.id}`}
            />
          </HStack>
        )}

        {offer.isUserEntered ? (
          <Text variant="footnote" tone="tertiary">
            You entered this offer. WalletWise cannot check it against your issuer.
          </Text>
        ) : null}
      </VStack>
    </Card>
  );
}
