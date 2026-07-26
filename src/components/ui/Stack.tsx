/** Layout helpers, so screens do not accumulate one-off StyleSheets. */
import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import type { spacing as spacingTokens } from '@/theme/tokens';

type SpacingKey = keyof typeof spacingTokens;

export interface StackProps {
  readonly children: ReactNode;
  readonly gap?: SpacingKey;
  readonly align?: ViewStyle['alignItems'];
  readonly justify?: ViewStyle['justifyContent'];
  readonly style?: ViewStyle;
  readonly testID?: string;
  /**
   * Collapses the stack into a single accessible element.
   *
   * A label-and-value row reads as one thought to a sighted user and should read
   * that way to a screen reader too, rather than as two fragments the user has to
   * reassemble. Pass `accessibilityLabel` with it, or the collapse hides the
   * content instead of naming it.
   */
  readonly accessible?: boolean;
  readonly accessibilityLabel?: string;
}

export function VStack({
  children,
  gap = 'md',
  align,
  justify,
  style,
  testID,
  accessible,
  accessibilityLabel,
}: StackProps) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          flexDirection: 'column',
          gap: theme.spacing[gap],
          ...(align !== undefined ? { alignItems: align } : {}),
          ...(justify !== undefined ? { justifyContent: justify } : {}),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function HStack({
  children,
  gap = 'md',
  align = 'center',
  justify,
  wrap = false,
  style,
  testID,
  accessible,
  accessibilityLabel,
}: StackProps & { readonly wrap?: boolean }) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          flexDirection: 'row',
          gap: theme.spacing[gap],
          alignItems: align,
          ...(justify !== undefined ? { justifyContent: justify } : {}),
          ...(wrap ? { flexWrap: 'wrap' as const } : {}),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Divider() {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height: 1, backgroundColor: theme.colors.border }}
    />
  );
}

export function Spacer({ size = 'md' }: { readonly size?: SpacingKey }) {
  const theme = useTheme();
  return <View style={{ height: theme.spacing[size] }} />;
}
