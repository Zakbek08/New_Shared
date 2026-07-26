/**
 * Password reset request.
 *
 * The confirmation message is identical whether or not the address has an
 * account. Saying "no account found" would turn this screen into an
 * account-enumeration oracle.
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { ErrorNotice } from '@/components/StateViews';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { emailSchema } from '@/domain/schemas';
import { usePasswordReset } from '@/features/auth/hooks';

const resetSchema = z.object({ email: emailSchema });
type ResetInput = z.infer<typeof resetSchema>;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const reset = usePasswordReset();
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<ResetInput>({
    resolver: zodResolver(resetSchema),
    defaultValues: { email: '' },
    mode: 'onBlur',
  });

  const onSubmit = form.handleSubmit((values) => {
    reset.mutate(values.email, { onSuccess: () => setSubmitted(true) });
  });

  if (submitted) {
    return (
      <Screen scroll accessibilityLabel="Reset link sent" testID="reset-sent">
        <VStack gap="xl">
          <Text variant="title1" accessibilityRole="header">
            Check your email
          </Text>
          <Card>
            <Text variant="body">
              If that address has a WalletWise account, we have sent it a link to set a new
              password.
            </Text>
          </Card>
          <Button
            label="Back to sign in"
            fullWidth
            onPress={() => router.replace('/(auth)/sign-in')}
            testID="reset-back"
          />
        </VStack>
      </Screen>
    );
  }

  return (
    <Screen scroll accessibilityLabel="Reset your password">
      <VStack gap="xl">
        <VStack gap="sm">
          <Text variant="title1" accessibilityRole="header">
            Reset your password
          </Text>
          <Text variant="body" tone="secondary">
            Enter your email address and we will send you a link to set a new one.
          </Text>
        </VStack>

        {reset.isError ? <ErrorNotice error={reset.error} testID="reset-error" /> : null}

        <Controller
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <TextField
              label="Email address"
              required
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              testID="reset-email"
            />
          )}
        />

        <VStack gap="md">
          <Button
            label="Send reset link"
            size="large"
            fullWidth
            loading={reset.isPending}
            onPress={() => void onSubmit()}
            testID="reset-submit"
          />
          <Button
            label="Back to sign in"
            variant="ghost"
            fullWidth
            onPress={() => router.back()}
          />
        </VStack>
      </VStack>
    </Screen>
  );
}
