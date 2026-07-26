/**
 * Screen 3 — Sign in.
 *
 * Phase 2 wires Supabase password sign-in and the session redirect.
 */
import { useRouter } from 'expo-router';

import { DisclaimerNotice } from '@/components/Disclaimers';
import { PlaceholderSection } from '@/components/PlaceholderSection';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';

export default function SignInScreen() {
  const router = useRouter();

  return (
    <Screen scroll accessibilityLabel="Sign in to WalletWise">
      <VStack gap="xl">
        <VStack gap="sm">
          <Text variant="title1" accessibilityRole="header">
            Welcome back
          </Text>
          <Text variant="body" tone="secondary">
            Sign in to see your wallet and get a recommendation.
          </Text>
        </VStack>

        <PlaceholderSection
          phase="Phase 2"
          title="Email and password"
          description="Supabase password sign-in with the session persisted in the device keystore, plus password reset by email."
          testID="sign-in-form-placeholder"
        />

        <DisclaimerNotice kind="no_credentials" />

        <Button
          label="Skip to the dashboard (development)"
          variant="secondary"
          fullWidth
          onPress={() => router.push('/(app)')}
          accessibilityHint="Opens the home dashboard without signing in. Development only."
          testID="sign-in-skip"
        />
      </VStack>
    </Screen>
  );
}
