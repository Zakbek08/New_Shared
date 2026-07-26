/**
 * Screen 7 — Add Custom Card.
 *
 * For a card the catalog does not know. The product row is created with
 * `is_user_defined = true` and `created_by = auth.uid()`, so RLS makes it visible
 * only to its owner and it never pollutes the shared catalog.
 *
 * Rates entered here are marked `user_reported`, which lowers the confidence of
 * any recommendation that depends on them. The engine still treats them as
 * database records and still computes deterministically — a user-entered rate is
 * a fact from an unverified source, not a guess.
 */
import { DisclaimerNotice } from '@/components/Disclaimers';
import { PlaceholderSection } from '@/components/PlaceholderSection';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';

export default function CustomCardScreen() {
  return (
    <Screen scroll accessibilityLabel="Add a custom card" testID="custom-card-screen">
      <VStack gap="xl">
        <VStack gap="sm">
          <Text variant="title1" accessibilityRole="header">
            Add a custom card
          </Text>
          <Text variant="body" tone="secondary">
            Tell WalletWise about a card that is not in the catalog. Only you will see it.
          </Text>
        </VStack>

        <PlaceholderSection
          phase="Phase 2"
          title="Card basics"
          description="Card name, issuer name, card type, network, annual fee and foreign transaction fee, validated with the Zod custom-card schema."
          testID="custom-card-basics"
        />

        <PlaceholderSection
          phase="Phase 2"
          title="Earn rates"
          description="A base rate for everything else, plus optional category bonuses with their own caps. Saved as reward rules with verification status 'reported by a cardholder'."
          testID="custom-card-rates"
        />

        <Card emphasis="uncertain">
          <VStack gap="sm">
            <Text variant="title3" accessibilityRole="header">
              Rates you enter are marked unverified
            </Text>
            <Text variant="callout" tone="secondary">
              WalletWise will use your numbers exactly as you typed them, and will label any
              recommendation that relies on them as lower confidence until someone checks them
              against the card&apos;s terms. Copy the rates from your own card agreement rather
              than from memory.
            </Text>
          </VStack>
        </Card>

        <DisclaimerNotice kind="financial" />
      </VStack>
    </Screen>
  );
}
