/**
 * Rounded surface used for every grouped block in the app.
 *
 * `emphasis` maps to the product's semantic colour language:
 *   `best`      green  — the highest-value option
 *   `uncertain` amber  — merchant coding is uncertain
 *   `negative`  red    — a fee applies, or the card is ineligible
 *
 * The emphasis is expressed as a left border and a tinted surface, never as
 * colour alone: callers pair it with a `Badge`, so the meaning survives
 * greyscale and colour-blindness.
 */
import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export type CardEmphasis = 'neutral' | 'best' | 'uncertain' | 'negative' | 'accent';

export interface CardProps {
  readonly children: ReactNode;
  readonly emphasis?: CardEmphasis;
  readonly padded?: boolean;
  readonly style?: ViewStyle;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

export function Card({
  children,
  emphasis = 'neutral',
  padded = true,
  style,
  accessibilityLabel,
  testID,
}: CardProps) {
  const theme = useTheme();

  const accent = {
    neutral: null,
    best: theme.colors.success,
    uncertain: theme.colors.warning,
    negative: theme.colors.danger,
    accent: theme.colors.primary,
  }[emphasis];

  const tint = {
    neutral: theme.colors.surface,
    best: theme.colors.successSubtle,
    uncertain: theme.colors.warningSubtle,
    negative: theme.colors.dangerSubtle,
    accent: theme.colors.primarySubtle,
  }[emphasis];

  return (
    <View
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[
        {
          backgroundColor: tint,
          borderRadius: theme.radii.lg,
          borderWidth: 1,
          borderColor: accent ?? theme.colors.border,
          ...(accent !== null ? { borderLeftWidth: 4, borderLeftColor: accent } : {}),
          padding: padded ? theme.spacing.lg : 0,
          ...theme.shadows.card,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
