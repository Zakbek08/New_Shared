/**
 * Screen 11 — Card Details.
 *
 * Everything WalletWise knows about one card in the wallet: its rules, caps,
 * enrollment state, fees and where each rate came from.
 */
import { useLocalSearchParams } from 'expo-router';

import { DisclaimerNotice } from '@/components/Disclaimers';
import { PlaceholderSection } from '@/components/PlaceholderSection';
import { Screen } from '@/components/ui/Screen';
import { VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';

export default function CardDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Screen scroll accessibilityLabel="Card details" testID="card-details-screen">
      <VStack gap="xl">
        <VStack gap="sm">
          <Text variant="title1" accessibilityRole="header">
            Card details
          </Text>
          <Text variant="footnote" tone="tertiary">
            Wallet entry {id ?? 'unknown'}
          </Text>
        </VStack>

        <PlaceholderSection
          phase="Phase 2"
          title="Card summary"
          description="Issuer, product, nickname, annual fee, foreign transaction fee and the countries where the card earns."
          testID="card-details-summary"
        />

        <PlaceholderSection
          phase="Phase 3"
          title="Earn rates"
          description="Every active reward rule with its rate, category, cap, cap period and validity window — the same records the engine reads."
          testID="card-details-rules"
        />

        <PlaceholderSection
          phase="Phase 5"
          title="Cap progress"
          description="How much of each capped bonus you have used in the current window, and when it resets."
          testID="card-details-caps"
        />

        <PlaceholderSection
          phase="Phase 5"
          title="Activation"
          description="Rules that need activating, with a link to the issuer's enrollment page. You tell WalletWise when you have activated; we never sign in on your behalf."
          testID="card-details-enrollment"
        />

        <PlaceholderSection
          phase="Phase 6"
          title="Where these rates came from"
          description="The source behind each rule, when it was last verified, and its full verification history."
          testID="card-details-sources"
        />

        <DisclaimerNotice kind="financial" />
      </VStack>
    </Screen>
  );
}
