/**
 * Screen 13 — Reward Preferences.
 *
 * Where the user decides what a point or a mile is worth. This is the single
 * biggest lever on the recommendation, and the reason two people with identical
 * wallets can correctly get different answers.
 */
import { DisclaimerNotice } from '@/components/Disclaimers';
import { PlaceholderSection } from '@/components/PlaceholderSection';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';

export default function RewardPreferencesScreen() {
  return (
    <Screen scroll accessibilityLabel="Reward preferences" testID="preferences-screen">
      <VStack gap="xl">
        <VStack gap="sm">
          <Text variant="title1" accessibilityRole="header">
            Reward preferences
          </Text>
          <Text variant="body" tone="secondary">
            What is a point worth to you? WalletWise uses your answer, not an industry average.
          </Text>
        </VStack>

        <Card>
          <VStack gap="sm">
            <Text variant="title3" accessibilityRole="header">
              Why this matters
            </Text>
            <Text variant="callout" tone="secondary">
              A card earning 10x on a currency you value at 0.6¢ per point returns 6% — while 3x
              on a currency you value at 1.3¢ returns 3.9%. Whether the first card wins depends
              entirely on how you redeem, which is something only you know. Set the numbers here
              and every comparison in the app follows them.
            </Text>
          </VStack>
        </Card>

        <PlaceholderSection
          phase="Phase 5"
          title="Your valuations"
          description="A cents-per-point value for each reward program in your wallet, with a default per currency type. Zero is allowed and means 'I do not value these'."
          testID="preferences-valuations"
        />

        <PlaceholderSection
          phase="Phase 5"
          title="Cash back only"
          description="Ignore points and miles entirely and rank on cash back alone."
          testID="preferences-cash-only"
        />

        <PlaceholderSection
          phase="Phase 5"
          title="Minimum switch benefit"
          description="How much extra a card must earn before WalletWise suggests reaching for it instead of your preferred card. Stops three-cent recommendations."
          testID="preferences-switch-threshold"
        />

        <DisclaimerNotice kind="estimate" />
      </VStack>
    </Screen>
  );
}
