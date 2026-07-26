/**
 * Screen 5 — My Wallet.
 *
 * A wallet entry is a product reference, a nickname and preferences. That is all
 * it can be: the database has no column for anything more sensitive.
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';

import { DisclaimerNotice } from '@/components/Disclaimers';
import { EmptyState, ErrorNotice, LoadingState } from '@/components/StateViews';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { useWalletCards } from '@/features/wallet/hooks';
import { WalletCardRow } from '@/features/wallet/ui/WalletCardRow';

export default function WalletScreen() {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const cards = useWalletCards({ includeArchived: showArchived });

  const visible = cards.data ?? [];
  const activeCount = visible.filter((card) => !card.isArchived).length;

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

        {cards.isPending ? (
          <LoadingState label="Loading your wallet" testID="wallet-loading" />
        ) : cards.isError ? (
          <ErrorNotice
            error={cards.error}
            onRetry={() => void cards.refetch()}
            testID="wallet-error"
          />
        ) : visible.length === 0 ? (
          <EmptyState
            title="Your wallet is empty"
            description="Add the cards you actually carry and WalletWise will tell you which one to use for each purchase."
            actionLabel="Add your first card"
            onAction={() => router.push('/cards/search')}
            testID="wallet-empty"
          />
        ) : (
          <VStack gap="md">
            <Text variant="label" tone="secondary">
              {activeCount} {activeCount === 1 ? 'card' : 'cards'} being compared
            </Text>
            {visible.map((card) => (
              <WalletCardRow
                key={card.id}
                card={card}
                onPress={() => router.push(`/cards/${card.id}`)}
                testID={`wallet-card-${card.id}`}
              />
            ))}
          </VStack>
        )}

        <Toggle
          label="Show archived cards"
          description="Archived cards stay in your history but are never recommended."
          value={showArchived}
          onValueChange={setShowArchived}
          testID="wallet-show-archived"
        />

        <DisclaimerNotice kind="no_credentials" />
      </VStack>
    </Screen>
  );
}
