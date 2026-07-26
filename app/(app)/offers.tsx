/**
 * Screen 12 — User Offers.
 *
 * Targeted offers are entered by hand by the user from their issuer's app.
 * WalletWise does not scrape issuer sites and does not log in to any bank, so
 * hand entry is the only mechanism there will ever be.
 */
import { DisclaimerNotice } from '@/components/Disclaimers';
import { PlaceholderSection } from '@/components/PlaceholderSection';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';

export default function OffersScreen() {
  return (
    <Screen scroll accessibilityLabel="Your offers" testID="offers-screen">
      <VStack gap="xl">
        <VStack gap="sm">
          <Text variant="title1" accessibilityRole="header">
            Your offers
          </Text>
          <Text variant="body" tone="secondary">
            Merchant offers and statement credits you have added, and how they change the
            recommendation.
          </Text>
        </VStack>

        <Card>
          <VStack gap="sm">
            <Text variant="title3" accessibilityRole="header">
              Why you add these yourself
            </Text>
            <Text variant="callout" tone="secondary">
              Targeted offers are specific to your account, and only your issuer knows which
              ones you have. WalletWise never signs in to your bank or scrapes an issuer
              website, so you copy the offers across yourself. It takes a moment and keeps your
              credentials where they belong.
            </Text>
          </VStack>
        </Card>

        <PlaceholderSection
          phase="Phase 5"
          title="Active offers"
          description="Offers grouped by card, with merchant, reward, minimum spend, maximum benefit, activation state and expiry."
          testID="offers-active"
        />

        <PlaceholderSection
          phase="Phase 5"
          title="Add an offer"
          description="A form validated with the Zod offer schema, covering percentage offers, fixed statement credits, minimum spend and benefit caps."
          testID="offers-add"
        />

        <DisclaimerNotice kind="financial" />
      </VStack>
    </Screen>
  );
}
