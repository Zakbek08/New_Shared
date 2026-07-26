/**
 * Screen 2 — Registration.
 *
 * Note what this form does not ask for: no card number, no security code, no
 * bank credentials. There is no phase in which it will.
 *
 * Disclaimer acceptance is required here and recorded against the account with
 * its version, so changing the wording later can ask again.
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import {
  DISCLAIMER_VERSION,
  DisclaimerNotice,
  FINANCIAL_INFORMATION_DISCLAIMER,
  NO_CREDENTIALS_DISCLAIMER,
  NO_PAYMENT_DISCLAIMER,
} from '@/components/Disclaimers';
import { ErrorNotice } from '@/components/StateViews';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Toggle } from '@/components/ui/Toggle';
import {
  registrationSchema,
  type RegistrationFormValues,
  type RegistrationInput,
} from '@/domain/schemas';
import { useSignUp } from '@/features/auth/hooks';

export default function RegisterScreen() {
  const router = useRouter();
  const signUp = useSignUp();
  const [confirmationSent, setConfirmationSent] = useState(false);

  // Three generics: field values are the schema's *input* type, the submit
  // handler receives its *output* type.
  const form = useForm<RegistrationFormValues, unknown, RegistrationInput>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      displayName: '',
      acceptedDisclaimers: false,
    },
    mode: 'onBlur',
  });

  const onSubmit = form.handleSubmit((values) => {
    signUp.mutate(values, {
      onSuccess: (result) => {
        if (result.needsEmailConfirmation) {
          setConfirmationSent(true);
        }
        // When confirmation is not required a session already exists, and the
        // root layout's guard moves the user into the app.
      },
    });
  });

  if (confirmationSent) {
    return (
      <Screen scroll accessibilityLabel="Check your email" testID="register-confirm">
        <VStack gap="xl">
          <Text variant="title1" accessibilityRole="header">
            Check your email
          </Text>
          <Card>
            <VStack gap="sm">
              <Text variant="body">
                We have sent a confirmation link to{' '}
                <Text variant="bodyStrong">{form.getValues('email')}</Text>. Open it to finish
                setting up your account.
              </Text>
              <Text variant="callout" tone="secondary">
                The link expires after a while. If it does, sign in and we will send a fresh
                one.
              </Text>
            </VStack>
          </Card>
          <Button
            label="Go to sign in"
            fullWidth
            onPress={() => router.replace('/(auth)/sign-in')}
            testID="register-goto-signin"
          />
        </VStack>
      </Screen>
    );
  }

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

        {signUp.isError ? <ErrorNotice error={signUp.error} testID="register-error" /> : null}

        <VStack gap="lg">
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
                textContentType="emailAddress"
                testID="register-email"
              />
            )}
          />

          <Controller
            control={form.control}
            name="displayName"
            render={({ field, fieldState }) => (
              <TextField
                label="Your name"
                hint="Optional. Used only to greet you."
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                autoComplete="name"
                testID="register-name"
              />
            )}
          />

          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <TextField
                label="Password"
                required
                hint="At least 10 characters, with an upper-case letter, a lower-case letter and a number."
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                testID="register-password"
              />
            )}
          />

          <Controller
            control={form.control}
            name="confirmPassword"
            render={({ field, fieldState }) => (
              <TextField
                label="Confirm password"
                required
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                testID="register-confirm-password"
              />
            )}
          />
        </VStack>

        <Card>
          <VStack gap="md">
            <Text variant="title3" accessibilityRole="header">
              Before you start
            </Text>
            <DisclaimerNotice kind="financial" />
            <DisclaimerNotice kind="no_payment" />
            <DisclaimerNotice kind="no_credentials" />

            <Controller
              control={form.control}
              name="acceptedDisclaimers"
              render={({ field, fieldState }) => (
                <VStack gap="xs">
                  <Toggle
                    label="I understand"
                    description={`${FINANCIAL_INFORMATION_DISCLAIMER} ${NO_PAYMENT_DISCLAIMER} ${NO_CREDENTIALS_DISCLAIMER}`}
                    value={field.value === true}
                    onValueChange={field.onChange}
                    testID="register-accept"
                  />
                  {fieldState.error?.message !== undefined ? (
                    <Text variant="caption" tone="danger">
                      {fieldState.error.message}
                    </Text>
                  ) : null}
                </VStack>
              )}
            />

            <Text variant="footnote" tone="tertiary">
              Disclaimer version {DISCLAIMER_VERSION}. We record which version you accepted so
              we can tell you when the wording changes.
            </Text>
          </VStack>
        </Card>

        <VStack gap="md">
          <Button
            label="Create account"
            size="large"
            fullWidth
            loading={signUp.isPending}
            onPress={() => void onSubmit()}
            accessibilityHint="Creates your account and sends a confirmation email"
            testID="register-submit"
          />
          <Button
            label="I already have an account"
            variant="ghost"
            fullWidth
            onPress={() => router.replace('/(auth)/sign-in')}
          />
          <Button
            label="Read the full privacy notes"
            variant="ghost"
            fullWidth
            onPress={() => router.push('/legal/disclosures')}
          />
        </VStack>
      </VStack>
    </Screen>
  );
}
