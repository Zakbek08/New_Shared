/**
 * Screen 2 — Registration.
 *
 * Phase 1 lays out the form and the disclaimer acceptance. Supabase sign-up,
 * validation wiring and error handling land in Phase 2.
 *
 * Note what this form does NOT ask for: no card number, no security code, no
 * bank credentials. There is no phase in which it will.
 */
import { useRouter } from 'expo-router';

import { DisclaimerNotice, DISCLAIMER_VERSION } from '@/components/Disclaimers';
import { PlaceholderSection } from '@/components/PlaceholderSection';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';

export default function RegisterScreen() {
  const router = useRouter();

  return (
    <Screen scroll accessibilityLabel="Create your WalletWise account">
      <VStack gap="xl">
        <VStack gap="sm">
          <Text variant="title1" accessibilityRole="header">
            Create your account
          </Text>
          <Text variant="body" tone="secondary">
            All WalletWise needs is an email address and a password. Your wallet holds card
            products and nicknames — never account numbers.
          </Text>
        </VStack>

        <PlaceholderSection
          phase="Phase 2"
          title="Email and password"
          description="React Hook Form fields validated with the Zod registration schema, then Supabase email sign-up with confirmation."
          testID="register-form-placeholder"
        />

        <VStack gap="md">
          <Text variant="title3" accessibilityRole="header">
            Before you start
          </Text>
          <DisclaimerNotice kind="financial" />
          <DisclaimerNotice kind="no_payment" />
          <DisclaimerNotice kind="no_credentials" />
          <Text variant="footnote" tone="tertiary">
            Disclaimer version {DISCLAIMER_VERSION}. Accepting is recorded against your account
            so we can tell you when the wording changes.
          </Text>
        </VStack>

        <Button
          label="Read the full privacy notes"
          variant="ghost"
          fullWidth
          onPress={() => router.push('/legal/disclosures')}
          accessibilityHint="Opens privacy and disclosures"
        />
      </VStack>
    </Screen>
  );
}
