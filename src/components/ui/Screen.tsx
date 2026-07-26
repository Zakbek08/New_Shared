/**
 * Screen scaffold: safe-area padding, themed background, optional scrolling.
 */
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';

export interface ScreenProps {
  readonly children: ReactNode;
  readonly scroll?: boolean;
  readonly padded?: boolean;
  readonly style?: ViewStyle;
  /** Announced by screen readers when the screen gains focus. */
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

export function Screen({
  children,
  scroll = false,
  padded = true,
  style,
  accessibilityLabel,
  testID,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: insets.top,
    paddingLeft: Math.max(insets.left, padded ? theme.spacing.lg : 0),
    paddingRight: Math.max(insets.right, padded ? theme.spacing.lg : 0),
  };

  if (!scroll) {
    return (
      <View
        style={[containerStyle, { paddingBottom: insets.bottom }, style]}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      >
        {children}
      </View>
    );
  }

  return (
    <View style={containerStyle} accessibilityLabel={accessibilityLabel} testID={testID}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[{ paddingBottom: insets.bottom + theme.spacing.xxxl }, style]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
});
