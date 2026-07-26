/**
 * Screen 5 — My Wallet.
 *
 * Lists the cards the user has added. A wallet entry is a product reference, a
 * nickname and preferences — that is all it can be, by database design.
 */
import { useRouter } from 'expo-router';

import { DisclaimerNotice } from '@/components/Disclaimers';
import { PlaceholderSection } from '@/components/PlaceholderSection';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';

export default function WalletScreen() {
  const router = useRouter();

  return (
    <Screen scroll accessibilityLabel="My wallet" testID="wallet-screen">
      <VStack gap="xl">
        <VStack gap="sm">
          <Text variant="title1" accessibilityRole="header">
            My wallet
          </Text>
          <Text variant="body" tone="secondary">
            The cards WalletWise compares for you. We store the card product, your nickname and
            your preferences — never a card number, security code or PIN.
          </Text>
        </VStack>

        <HStack gap="md" wrap>
          <Button
            label="Search the catalog"
            onPress={() => router.push('/cards/search')}
            accessibilityHint="Search for a card to add to your wallet"
            testID="wallet-search-card"
          />
          <Button
            label="Add a custom card"
            variant="secondary"
            onPress={() => router.push('/cards/custom')}
            accessibilityHint="Describe a card that is not in the catalog"
            testID="wallet-custom-card"
          />
        </HStack>

        <PlaceholderSection
          phase="Phase 2"
          title="Your cards"
          description="Each card with its issuer, nickname, headline earn rates and cap progress. Reorder, archive, or exclude a card from recommendations."
          testID="wallet-card-list"
        />

        <DisclaimerNotice kind="no_credentials" />
      </VStack>
    </Screen>
  );
}
