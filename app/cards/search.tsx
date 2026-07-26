/**
 * Screen 6 — Search and Add Card.
 *
 * Search the shared catalog and add a product to the wallet. The form collects
 * a nickname and, optionally, the last four digits — which are encrypted on the
 * device before they are sent anywhere.
 */
import { useRouter } from 'expo-router';

import { DisclaimerNotice } from '@/components/Disclaimers';
import { PlaceholderSection } from '@/components/PlaceholderSection';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';

export default function SearchCardScreen() {
  const router = useRouter();

  return (
    <Screen scroll accessibilityLabel="Search and add a card" testID="card-search-screen">
      <VStack gap="xl">
        <VStack gap="sm">
          <Text variant="title1" accessibilityRole="header">
            Add a card
          </Text>
          <Text variant="body" tone="secondary">
            Find your card in the catalog. Its reward rules come with it, so WalletWise can
            start comparing straight away.
          </Text>
        </VStack>

        <PlaceholderSection
          phase="Phase 2"
          title="Catalog search"
          description="Search by issuer or product name against the card catalog, with each result showing its headline earn rates and when they were last verified."
          testID="card-search-results"
        />

        <Card>
          <VStack gap="sm">
            <Text variant="title3" accessibilityRole="header">
              About the last four digits
            </Text>
            <Text variant="callout" tone="secondary">
              Adding the last four digits is optional, and only there to help you tell two
              similar cards apart. They are encrypted on your device before they are sent, so
              nobody on our side can read them. WalletWise cannot accept a full card number: the
              field rejects anything longer than four digits, and there is no column in the
              database that could hold one.
            </Text>
          </VStack>
        </Card>

        <PlaceholderSection
          phase="Phase 2"
          title="Add to wallet"
          description="Nickname, optional encrypted last four, account open date for cardmember-year caps, and whether this is your preferred card for tie-breaks."
          testID="card-search-add-form"
        />

        <Button
          label="Cannot find it? Add a custom card"
          variant="ghost"
          fullWidth
          onPress={() => router.push('/cards/custom')}
          accessibilityHint="Opens the custom card form"
        />

        <DisclaimerNotice kind="no_credentials" />
      </VStack>
    </Screen>
  );
}
