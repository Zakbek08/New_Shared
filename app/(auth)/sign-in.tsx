/**
 * Screen 3 — Sign in.
 *
 * The session is persisted in the device keystore by the Supabase client, and the
 * root layout's guard moves the user into the app once it exists.
 */
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { DisclaimerNotice } from '@/components/Disclaimers';
import { ErrorNotice } from '@/components/StateViews';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { signInSchema, type SignInInput } from '@/domain/schemas';
import { useSignIn } from '@/features/auth/hooks';

export default function SignInScreen() {
  const router = useRouter();
  const signIn = useSignIn();

  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onBlur',
  });

  const onSubmit = form.handleSubmit((values) => {
    signIn.mutate(values);
  });

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

        {signIn.isError ? <ErrorNotice error={signIn.error} testID="sign-in-error" /> : null}

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
                testID="sign-in-email"
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
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                onSubmitEditing={() => void onSubmit()}
                returnKeyType="go"
                testID="sign-in-password"
              />
            )}
          />
        </VStack>

        <VStack gap="md">
          <Button
            label="Sign in"
            size="large"
            fullWidth
            loading={signIn.isPending}
            onPress={() => void onSubmit()}
            testID="sign-in-submit"
          />
          <Button
            label="Forgot your password?"
            variant="ghost"
            fullWidth
            onPress={() => router.push('/(auth)/reset-password')}
            testID="sign-in-forgot"
          />
          <Button
            label="Create an account"
            variant="ghost"
            fullWidth
            onPress={() => router.replace('/(auth)/register')}
          />
        </VStack>

        <DisclaimerNotice kind="no_credentials" />
      </VStack>
    </Screen>
  );
}
