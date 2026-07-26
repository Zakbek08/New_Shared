/**
 * Root layout, provider stack and route guard.
 *
 * The guard is a convenience, not a security control: it decides which screen to
 * show, while row-level security decides what data anyone can read. A user who
 * defeated this redirect would see empty screens.
 */
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { LoadingState } from '@/components/StateViews';
import { useAuth } from '@/features/auth/AuthProvider';
import { AppProviders } from '@/providers/AppProviders';
import { initialiseTelemetry, track } from '@/services/analytics';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Sends the user to the right side of the auth boundary.
 *
 * Runs in an effect rather than returning `<Redirect>` so it cannot fire during
 * the first render, before the persisted session has been read — that would
 * bounce a signed-in user to the splash screen on every cold start.
 */
function useAuthRedirect(): void {
  const { isSignedIn, isInitialising } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isInitialising) return;

    const group = segments[0];
    const isInAuthFlow = group === '(auth)';
    const isOnSplash = group === undefined;
    const isInApp = group === '(app)';

    if (isSignedIn && (isInAuthFlow || isOnSplash)) {
      router.replace('/(app)');
      return;
    }

    // Signed out: the splash screen and the auth flow are both fine to stay on.
    // Only an attempt to reach the signed-in area gets redirected.
    if (!isSignedIn && isInApp) {
      router.replace('/');
    }
  }, [isSignedIn, isInitialising, segments, router]);
}

function RootNavigator() {
  const theme = useTheme();
  const { isInitialising } = useAuth();

  useAuthRedirect();

  if (isInitialising) {
    // Reading the session from the keystore is fast but not instant. Showing a
    // neutral surface avoids a flash of the wrong screen.
    return (
      <View
        style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center' }}
      >
        <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
        <LoadingState label="Starting WalletWise" testID="root-loading" />
      </View>
    );
  }

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
