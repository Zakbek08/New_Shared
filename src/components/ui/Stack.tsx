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
}

export function VStack({ children, gap = 'md', align, justify, style, testID }: StackProps) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
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
}: StackProps & { readonly wrap?: boolean }) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
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
