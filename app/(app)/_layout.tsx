/**
 * Signed-in tab navigator.
 *
 * Five tabs, because the product's core loop is "what am I buying?" and the tab
 * bar should not bury it. `Purchase` sits in the middle as the primary action.
 */
import { Tabs } from 'expo-router';

import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

export default function AppTabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.textPrimary,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: theme.colors.background },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          minHeight: MIN_TOUCH_TARGET + theme.spacing.md,
        },
        // Labels are always visible: an unlabelled icon is a guessing game for
        // everyone, and unusable with a screen reader.
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', headerShown: false }} />
      <Tabs.Screen name="wallet" options={{ title: 'Wallet' }} />
      <Tabs.Screen name="assistant" options={{ title: 'Purchase' }} />
      <Tabs.Screen name="offers" options={{ title: 'Offers' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
