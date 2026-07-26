/**
 * Root layout.
 *
 * Mounts the provider stack and declares the top-level navigator. Auth gating
 * arrives in Phase 2; for now every route is reachable so the navigation shape
 * can be reviewed.
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
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
        <Stack.Screen name="cards/search" options={{ title: 'Add a card' }} />
        <Stack.Screen name="cards/custom" options={{ title: 'Add a custom card' }} />
        <Stack.Screen name="cards/[id]" options={{ title: 'Card details' }} />
        <Stack.Screen name="recommendations/results" options={{ title: 'Best card' }} />
        <Stack.Screen
          name="recommendations/[id]"
          options={{ title: 'How we worked this out' }}
        />
        <Stack.Screen name="preferences/rewards" options={{ title: 'Reward preferences' }} />
        <Stack.Screen name="legal/disclosures" options={{ title: 'Privacy and disclosures' }} />
        <Stack.Screen name="admin/catalog" options={{ title: 'Card catalog' }} />
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
