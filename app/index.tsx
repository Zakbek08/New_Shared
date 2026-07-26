/**
 * Screen 1 — Splash.
 *
 * Brand moment plus the two statements a first-time user most needs to see:
 * WalletWise never takes a payment, and never asks for card credentials.
 *
 * Phase 2 replaces the manual buttons with an automatic redirect based on the
 * Supabase session.
 */
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { NO_CREDENTIALS_DISCLAIMER, NO_PAYMENT_DISCLAIMER } from '@/components/Disclaimers';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';

export default function SplashScreen() {
  const router = useRouter();
  const theme = useTheme();

  return (
    <Screen accessibilityLabel="WalletWise welcome" testID="splash-screen">
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <VStack gap="xxl">
          <VStack gap="sm">
            {/* A wordmark, not a logo lifted from anyone else. */}
            <Text variant="display" accessibilityRole="header">
              WalletWise
            </Text>
            <Text variant="title3" tone="accent">
              Which card should you use?
            </Text>
            <Text variant="body" tone="secondary">
              Tell WalletWise what you are buying and it works out which card in your wallet
              earns you the most on that purchase.
            </Text>
          </VStack>

          <View
            accessible
            accessibilityRole="summary"
            accessibilityLabel={`${NO_PAYMENT_DISCLAIMER} ${NO_CREDENTIALS_DISCLAIMER}`}
            style={{
              backgroundColor: theme.colors.surfaceSunken,
              borderRadius: theme.radii.md,
              padding: theme.spacing.lg,
              gap: theme.spacing.sm,
            }}
          >
            <Text variant="callout" tone="secondary">
              {NO_PAYMENT_DISCLAIMER}
            </Text>
            <Text variant="callout" tone="secondary">
              {NO_CREDENTIALS_DISCLAIMER}
            </Text>
          </View>
        </VStack>
      </View>

      <VStack gap="md" style={{ paddingBottom: theme.spacing.xxl }}>
        <Button
          label="Create an account"
          size="large"
          fullWidth
          onPress={() => router.push('/(auth)/register')}
          accessibilityHint="Opens the registration form"
          testID="splash-register"
        />
        <Button
          label="I already have an account"
          variant="ghost"
          size="large"
          fullWidth
          onPress={() => router.push('/(auth)/sign-in')}
          accessibilityHint="Opens the sign in form"
          testID="splash-sign-in"
        />
      </VStack>
    </Screen>
  );
}
