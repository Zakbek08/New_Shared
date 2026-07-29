/**
 * Screen 2 — Choose your cards.
 *
 * Search the catalog, tap to add. Every card shows what it earns, its annual fee, its
 * foreign transaction fee, and the date its rates were read off the issuer's own page —
 * with a link to that page, so a figure can be checked in one tap rather than trusted.
 *
 * WHY THE DATE IS ON EVERY CARD AND NOT IN A FOOTNOTE
 * These are real rates for real products, and issuers change them without notice. A
 * rate with no date attached is a claim about today that nobody has checked. A rate with
 * a date is a transcription the user can verify. The difference is the whole reason this
 * screen is trustworthy, so it is not tucked away.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Linking } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Divider, HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Toggle } from '@/components/ui/Toggle';
import { searchMarketCards, type MarketCard } from '@/data/marketCards';
import { useLocalStore } from '@/features/local/LocalStore';
import { formatDay, formatUsdCompact } from '@/lib/format';

/** True when any of a card's rates need switching on with the issuer. */
function needsActivation(card: MarketCard): boolean {
  return card.bonuses.some((bonus) => bonus.requiresEnrollment === true);
}

function CardRow({ card }: { readonly card: MarketCard }) {
  const { wallet, addCard, removeCard, setActivated } = useLocalStore();
  const isInWallet = wallet.cardIds.includes(card.id);
  const isActivated = wallet.activated[card.id] === true;

  return (
    <VStack gap="sm" testID={`card-option-${card.id}`}>
      <VStack gap="xxs">
        <Text variant="bodyStrong">{card.productName}</Text>
        <Text variant="caption" tone="secondary">
          {card.issuerName}
        </Text>
      </VStack>

      <Text variant="callout" tone="secondary">
        {card.summary}
      </Text>

      <HStack gap="sm" wrap align="flex-start">
        {card.annualFeeUsd === 0 ? (
          <Badge label="No annual fee" tone="best" glyph="✓" />
        ) : (
          <Badge label={`${formatUsdCompact(card.annualFeeUsd)} a year`} tone="neutral" />
        )}
        {card.foreignTransactionFeePercent === 0 ? (
          <Badge label="No FX fee" tone="best" glyph="✓" />
        ) : (
          <Badge
            label={`${card.foreignTransactionFeePercent}% FX fee`}
            tone="uncertain"
            accessibilityLabel={`${card.foreignTransactionFeePercent} percent foreign transaction fee`}
          />
        )}
        {needsActivation(card) ? (
          <Badge label="Needs activation" tone="uncertain" glyph="!" />
        ) : null}
      </HStack>

      {/* Every earn rate, in the issuer's own words. */}
      <VStack gap="xxs">
        {card.bonuses.map((bonus) => (
          <Text key={bonus.label} variant="footnote" tone="secondary">
            • {bonus.label}
          </Text>
        ))}
        <Text variant="footnote" tone="secondary">
          • {card.baseLabel}
        </Text>
      </VStack>

      <Text variant="footnote" tone="tertiary">
        Rates published by {card.issuerName}, read on{' '}
        {formatDay(card.ratesAsOf) ?? card.ratesAsOf}. Confirm with your bank before relying on
        them.
      </Text>

      <HStack gap="sm" wrap>
        <Button
          label={isInWallet ? 'Remove from my wallet' : 'Add to my wallet'}
          variant={isInWallet ? 'ghost' : 'primary'}
          onPress={() => void (isInWallet ? removeCard(card.id) : addCard(card.id))}
          accessibilityHint={
            isInWallet
              ? `Removes the ${card.productName} from your wallet`
              : `Adds the ${card.productName} to your wallet so it is compared on every purchase`
          }
          testID={`card-toggle-${card.id}`}
        />
        <Button
          label="Issuer’s page"
          variant="secondary"
          onPress={() => {
            // Handed to the browser so the user can read the terms. WalletWise never
            // fetches these pages itself — no scraping, ever. See SECURITY.md.
            void Linking.openURL(card.sourceUrl).catch(() => undefined);
          }}
          accessibilityHint={`Opens the ${card.issuerName} page for this card in your browser`}
          testID={`card-source-${card.id}`}
        />
      </HStack>

      {isInWallet && needsActivation(card) ? (
        <Toggle
          label="I have activated this card’s bonus categories"
          description="Some bonuses only pay if you switch them on with your issuer. Until you confirm you have, WalletWise uses this card’s base rate instead — recommending a 5% bonus you never activated would cost you money."
          value={isActivated}
          onValueChange={(value) => void setActivated(card.id, value)}
          testID={`card-activated-${card.id}`}
        />
      ) : null}
    </VStack>
  );
}

export default function ChooseCardsScreen() {
  const router = useRouter();
  const { wallet, profile } = useLocalStore();
  const [query, setQuery] = useState('');

  const results = useMemo(() => searchMarketCards(query), [query]);
  const chosenCount = wallet.cardIds.length;

  return (
    <Screen scroll accessibilityLabel="Choose your cards" testID="choose-cards-screen">
      <VStack gap="xl">
        <VStack gap="sm">
          <Text variant="title1" accessibilityRole="header">
            {profile === null ? 'Your cards' : `Your cards, ${profile.name.split(' ')[0]}`}
          </Text>
          <Text variant="body" tone="secondary">
            Search for the cards you already hold and add them. WalletWise compares only the
            cards in your wallet, so the more accurate this list, the better the answer.
          </Text>
        </VStack>

        <TextField
          label="Search cards"
          value={query}
          onChangeText={setQuery}
          hint="Try an issuer, a card name, or a nickname — “chase”, “double cash”, “amex gold”."
          autoCapitalize="none"
          autoCorrect={false}
          testID="choose-cards-search"
        />

        <Text variant="callout" tone="secondary" accessibilityRole="summary">
          {chosenCount === 0
            ? 'No cards in your wallet yet.'
            : `${chosenCount} ${chosenCount === 1 ? 'card' : 'cards'} in your wallet.`}
        </Text>

        {/* Chosen cards first, so a long catalog does not bury what the user has done. */}
        {chosenCount > 0 ? (
          <Card testID="choose-cards-chosen">
            <VStack gap="sm">
              <Text variant="title3" accessibilityRole="header">
                In your wallet
              </Text>
              {wallet.cardIds.map((id) => {
                const card = results.find((candidate) => candidate.id === id);
                return (
                  <Text key={id} variant="callout">
                    ✓ {card?.productName ?? id}
                  </Text>
                );
              })}
            </VStack>
          </Card>
        ) : null}

        <Card testID="choose-cards-results">
          <VStack gap="lg">
            <Text variant="title3" accessibilityRole="header">
              {query.trim() === ''
                ? `All ${results.length} cards`
                : `${results.length} ${results.length === 1 ? 'match' : 'matches'}`}
            </Text>

            {results.length === 0 ? (
              <VStack gap="xs">
                <Text variant="callout" tone="secondary">
                  Nothing in the catalog matches “{query.trim()}”.
                </Text>
                <Text variant="footnote" tone="tertiary">
                  The catalog covers the major US issuers’ mainstream cards, not every card in
                  existence. If yours is missing, WalletWise would rather say so than guess at
                  its rates.
                </Text>
              </VStack>
            ) : (
              results.map((card, index) => (
                <VStack key={card.id} gap="sm">
                  {index > 0 ? <Divider /> : null}
                  <CardRow card={card} />
                </VStack>
              ))
            )}
          </VStack>
        </Card>

        <Button
          label={chosenCount === 0 ? 'Add at least one card to continue' : 'Continue'}
          size="large"
          fullWidth
          disabled={chosenCount === 0}
          onPress={() => router.replace('/purchase')}
          accessibilityHint="Opens the purchase screen"
          testID="choose-cards-continue"
        />
      </VStack>
    </Screen>
  );
}
