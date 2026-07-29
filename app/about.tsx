/**
 * About, and the honest small print.
 *
 * Reachable from the purchase screen. It exists because a financial-information app owes
 * the user four plain statements — what this is, what it will never do, where the numbers
 * come from, and what it keeps — and burying those in a link nobody taps is the same as
 * not making them.
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';

import {
  DisclaimerNotice,
  NO_CREDENTIALS_DISCLAIMER,
  NO_PAYMENT_DISCLAIMER,
} from '@/components/Disclaimers';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { MARKET_CARDS, MARKET_ISSUERS } from '@/data/marketCards';
import { useLocalStore } from '@/features/local/LocalStore';
import { CENTS_PER_POINT } from '@/features/local/recommend';

export default function AboutScreen() {
  const router = useRouter();
  const { profile, startOver } = useLocalStore();
  const [isConfirming, setIsConfirming] = useState(false);

  return (
    <Screen scroll accessibilityLabel="About WalletWise" testID="about-screen">
      <VStack gap="xl">
        <VStack gap="xs">
          <Text variant="title1" accessibilityRole="header">
            About WalletWise
          </Text>
          <Text variant="body" tone="secondary">
            WalletWise tells you which card in your wallet earns the most on a purchase you are
            about to make. That is all it does.
          </Text>
        </VStack>

        <Card>
          <VStack gap="sm">
            <Text variant="title3" accessibilityRole="header">
              What it will never do
            </Text>
            <Text variant="callout" tone="secondary">
              {NO_PAYMENT_DISCLAIMER}
            </Text>
            <Text variant="callout" tone="secondary">
              {NO_CREDENTIALS_DISCLAIMER}
            </Text>
            <Text variant="callout" tone="secondary">
              It never signs in to your bank, never imports your transactions, and never fetches
              or scrapes an issuer’s website.
            </Text>
            <Text variant="callout" tone="secondary">
              It earns nothing from any card it recommends. There are no referral links and no
              affiliate fees — the moment a recommendation paid us, it would be worthless to
              you.
            </Text>
          </VStack>
        </Card>

        <Card>
          <VStack gap="sm">
            <Text variant="title3" accessibilityRole="header">
              Where the rates come from
            </Text>
            <Text variant="callout" tone="secondary">
              {MARKET_CARDS.length} cards from {MARKET_ISSUERS.length} issuers:{' '}
              {MARKET_ISSUERS.join(', ')}.
            </Text>
            <Text variant="callout" tone="secondary">
              Each card’s rates were read by hand from that issuer’s own product page, and every
              card shows the date it was read along with a link to the page. Issuers change
              rates without notice, so treat these as a starting point and confirm with your
              bank.
            </Text>
            <Text variant="callout" tone="secondary">
              Cards that earn points rather than cash are valued at {CENTS_PER_POINT}¢ per
              point. That is an assumption, not a rate — a cautious floor, so a points card that
              wins here would also win at a higher valuation.
            </Text>
            <Text variant="footnote" tone="tertiary">
              The catalog covers the major issuers’ mainstream cards, not every card on the
              market. If yours is missing, WalletWise says so rather than guessing its rates.
            </Text>
          </VStack>
        </Card>

        <Card>
          <VStack gap="sm">
            <Text variant="title3" accessibilityRole="header">
              What is stored, and where
            </Text>
            <Text variant="callout" tone="secondary">
              Your name, your email address and the list of cards you picked. They are saved on
              this device only. There is no account, no server and no password, so there is
              nothing of yours anywhere else to be lost or breached.
            </Text>
            <Text variant="footnote" tone="tertiary">
              The flip side, stated plainly: clearing your browser data or reinstalling the app
              loses them, because there is no copy.
            </Text>
            {profile === null ? null : (
              <Text variant="footnote" tone="tertiary">
                Signed in as {profile.name} ({profile.email}).
              </Text>
            )}
          </VStack>
        </Card>

        <Card>
          <VStack gap="sm">
            <Text variant="title3" accessibilityRole="header">
              How the answer is worked out
            </Text>
            <Text variant="callout" tone="secondary">
              Every figure is calculated on your device by plain arithmetic over the rates above
              — the same input always gives the same answer. No part of any reward figure is
              produced by an AI model, and if a rate is not in the catalog the app says it does
              not know rather than estimating.
            </Text>
          </VStack>
        </Card>

        <Card emphasis="negative">
          <VStack gap="sm">
            <Text variant="title3" accessibilityRole="header">
              Start over
            </Text>
            <Text variant="callout" tone="secondary">
              Forgets your name, email and cards, and returns to the sign-in screen. It cannot
              be undone, because nothing is backed up.
            </Text>
            {isConfirming ? (
              <VStack gap="sm">
                <Text variant="bodyStrong">Erase everything on this device?</Text>
                <Button
                  label="Yes, erase it"
                  variant="danger"
                  fullWidth
                  onPress={() => void startOver().then(() => router.replace('/'))}
                  testID="about-start-over-confirm"
                />
                <Button
                  label="Cancel"
                  variant="ghost"
                  fullWidth
                  onPress={() => setIsConfirming(false)}
                  testID="about-start-over-cancel"
                />
              </VStack>
            ) : (
              <Button
                label="Start over"
                variant="danger"
                fullWidth
                onPress={() => setIsConfirming(true)}
                accessibilityHint="Asks you to confirm before erasing your details"
                testID="about-start-over"
              />
            )}
          </VStack>
        </Card>

        <Button
          label="Back"
          variant="ghost"
          fullWidth
          onPress={() => router.back()}
          testID="about-back"
        />

        <DisclaimerNotice kind="financial" />
      </VStack>
    </Screen>
  );
}
