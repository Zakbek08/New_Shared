/**
 * The dashboard's expiring-offer alert.
 *
 * An offer the user entered and then forgot is money left on the table, so this
 * appears within a fortnight of the end date and states the days remaining rather
 * than only the date — "3 days left" is actionable in a way that "ends 29 July" is
 * not.
 */
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { EXPIRY_WARNING_DAYS, type OfferExpiry } from '@/domain/rewards';
import { useWalletAlerts } from '@/features/caps/hooks';
import { formatUsd } from '@/lib/format';

function daysLabel(days: number): string {
  if (days <= 1) return 'Ends today';
  return `${days} days left`;
}

export function ExpiringOfferRow({ expiry }: { readonly expiry: OfferExpiry }) {
  return (
    <VStack
      gap="xs"
      accessible
      accessibilityLabel={[
        `${expiry.title}.`,
        expiry.merchantLabel === null ? null : `At ${expiry.merchantLabel}.`,
        `On your ${expiry.cardName}.`,
        `${daysLabel(expiry.daysUntilExpiry)}.`,
        expiry.minimumSpendUsd > 0
          ? `Needs ${formatUsd(expiry.minimumSpendUsd)} of spend.`
          : null,
        expiry.isEnrolled ? 'Activated.' : 'Not activated yet.',
      ]
        .filter((part): part is string => part !== null)
        .join(' ')}
      testID={`expiring-offer-${expiry.offerId}`}
    >
      <Text variant="callout">{expiry.title}</Text>
      <Text variant="caption" tone="secondary">
        {expiry.merchantLabel ?? 'Merchant not named'} · {expiry.cardName}
      </Text>
      <HStack gap="sm" wrap align="flex-start">
        <Badge
          label={daysLabel(expiry.daysUntilExpiry)}
          tone={expiry.daysUntilExpiry <= 3 ? 'negative' : 'uncertain'}
          glyph="!"
        />
        {expiry.isEnrolled ? null : <Badge label="Not activated" tone="uncertain" glyph="!" />}
        {expiry.minimumSpendUsd > 0 ? (
          <Badge label={`${formatUsd(expiry.minimumSpendUsd)} minimum`} tone="neutral" />
        ) : null}
      </HStack>
    </VStack>
  );
}

export function ExpiringOffersSection({
  asOf,
  testID,
}: {
  readonly asOf: Date;
  readonly testID?: string;
}) {
  const { alerts, isPending, isError } = useWalletAlerts(asOf);

  // Nothing expiring is not news, so the section disappears rather than announcing
  // its own emptiness on a dashboard whose job is to surface exceptions.
  if (isPending || isError || alerts.expiringOffers.length === 0) return null;

  return (
    <Card emphasis="uncertain" testID={testID}>
      <VStack gap="md">
        <VStack gap="xxs">
          <Text variant="title3" accessibilityRole="header">
            Offers about to expire
          </Text>
          <Text variant="caption" tone="secondary">
            Ending within {EXPIRY_WARNING_DAYS} days, soonest first.
          </Text>
        </VStack>

        <VStack gap="lg">
          {alerts.expiringOffers.map((expiry) => (
            <ExpiringOfferRow key={expiry.offerId} expiry={expiry} />
          ))}
        </VStack>
      </VStack>
    </Card>
  );
}
