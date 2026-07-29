/**
 * Screen 1 — Sign in.
 *
 * A name and an email address, and that is genuinely all. There is no password because
 * there is no account: nothing is uploaded, so there is nothing for a password to
 * protect. The screen says so rather than leaving the user to wonder why a sign-in form
 * has no password field — an unexplained omission reads as a bug or, worse, as
 * carelessness with their data.
 *
 * The two safety statements sit here, on the first screen a person ever sees, because
 * that is when they matter: WalletWise never takes a payment and never asks for a card
 * number, security code, PIN or banking password.
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { NO_CREDENTIALS_DISCLAIMER, NO_PAYMENT_DISCLAIMER } from '@/components/Disclaimers';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { useLocalStore } from '@/features/local/LocalStore';
import { profileSchema } from '@/features/local/storage';
import { useTheme } from '@/theme/ThemeProvider';

export default function SignInScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { saveProfile } = useLocalStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [isSaving, setIsSaving] = useState(false);

  const submit = () => {
    const parsed = profileSchema.safeParse({ name, email });

    if (!parsed.success) {
      // Field-level messages rather than one summary line, so a screen reader
      // announces the problem on the field it belongs to.
      const next: { name?: string; email?: string } = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'name') next.name = issue.message;
        if (field === 'email') next.email = issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    setIsSaving(true);
    void saveProfile(parsed.data).then(() => router.replace('/choose-cards'));
  };

  return (
    <Screen scroll accessibilityLabel="Sign in to WalletWise" testID="sign-in-screen">
      <VStack gap="xxl">
        <VStack gap="sm">
          <Text variant="display" accessibilityRole="header">
            WalletWise
          </Text>
          <Text variant="title3" tone="accent">
            Which card should you use?
          </Text>
          <Text variant="body" tone="secondary">
            Tell WalletWise what you are buying and it works out which of your cards earns you
            the most on that purchase.
          </Text>
        </VStack>

        <VStack gap="lg">
          <TextField
            label="Your name"
            value={name}
            onChangeText={setName}
            error={errors.name}
            required
            autoCapitalize="words"
            autoComplete="name"
            maxLength={80}
            testID="sign-in-name"
          />

          <TextField
            label="Email address"
            value={email}
            onChangeText={setEmail}
            error={errors.email}
            hint="Used only to label this wallet on your device. Nothing is sent to it."
            required
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            maxLength={254}
            testID="sign-in-email"
          />

          <Button
            label="Sign in"
            size="large"
            fullWidth
            loading={isSaving}
            onPress={submit}
            accessibilityHint="Saves your details on this device and opens the card chooser"
            testID="sign-in-submit"
          />
        </VStack>

        <View
          accessible
          accessibilityRole="summary"
          accessibilityLabel={`No password is needed. ${NO_PAYMENT_DISCLAIMER} ${NO_CREDENTIALS_DISCLAIMER}`}
          style={{
            backgroundColor: theme.colors.surfaceSunken,
            borderRadius: theme.radii.md,
            padding: theme.spacing.lg,
            gap: theme.spacing.sm,
          }}
        >
          <Text variant="bodyStrong">No password, and nothing leaves this device</Text>
          <Text variant="callout" tone="secondary">
            There is no account to create. Your name, email and card list are saved on this
            device only, so there is no password to lose and nothing of yours on a server.
          </Text>
          <Text variant="callout" tone="secondary">
            {NO_PAYMENT_DISCLAIMER}
          </Text>
          <Text variant="callout" tone="secondary">
            {NO_CREDENTIALS_DISCLAIMER}
          </Text>
        </View>
      </VStack>
    </Screen>
  );
}
