/**
 * Root layout and the whole navigation stack.
 *
 * Five screens, and that is the app:
 *
 *   index         the gate — decides where a person lands, renders nothing
 *   sign-in       name and email, once
 *   choose-cards  search the catalog and pick what you hold
 *   purchase      the home screen for anyone returning
 *   result        the answer
 *   about         what this is, what it stores, what it will never do
 *
 * There is no route guard. The gate at `index` is the only routing decision, and it is a
 * convenience rather than a control: nothing here protects data, because nothing leaves
 * the device for a control to protect.
 */
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppProviders } from '@/providers/AppProviders';
import { initialiseTelemetry, track } from '@/services/analytics';
import { useTheme } from '@/theme/ThemeProvider';

function RootNavigator() {
  const theme = useTheme();

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.textPrimary,
          headerTitleStyle: { color: theme.colors.textPrimary },
          contentStyle: { backgroundColor: theme.colors.background },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="choose-cards" options={{ title: 'Your cards' }} />
        <Stack.Screen name="purchase" options={{ headerShown: false }} />
        <Stack.Screen name="result" options={{ title: 'Best card' }} />
        <Stack.Screen name="about" options={{ title: 'About' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    initialiseTelemetry();
    track('app_opened');
  }, []);

  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}
