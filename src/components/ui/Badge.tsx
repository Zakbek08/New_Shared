/**
 * Small status pill.
 *
 * Every badge renders a text label, so it carries its meaning without relying on
 * colour. The optional `glyph` is a redundant, non-colour cue for the three
 * semantic tones the product calls out.
 */
import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

export type BadgeTone = 'neutral' | 'best' | 'uncertain' | 'negative' | 'accent' | 'info';

export interface BadgeProps {
  readonly label: string;
  readonly tone?: BadgeTone;
  /** A short non-colour cue, e.g. `!` for uncertainty. */
  readonly glyph?: string;
  readonly style?: ViewStyle;
  readonly testID?: string;
  /** Overrides the label for screen readers when the label is abbreviated. */
  readonly accessibilityLabel?: string;
}

export function Badge({
  label,
  tone = 'neutral',
  glyph,
  style,
  testID,
  accessibilityLabel,
}: BadgeProps) {
  const theme = useTheme();

  const { background, foreground } = {
    neutral: { background: theme.colors.surfaceSunken, foreground: theme.colors.textSecondary },
    best: { background: theme.colors.successSubtle, foreground: theme.colors.onSuccessSubtle },
    uncertain: {
      background: theme.colors.warningSubtle,
      foreground: theme.colors.onWarningSubtle,
    },
    negative: {
      background: theme.colors.dangerSubtle,
      foreground: theme.colors.onDangerSubtle,
    },
    accent: {
      background: theme.colors.primarySubtle,
      foreground: theme.colors.onPrimarySubtle,
    },
    info: { background: theme.colors.infoSubtle, foreground: theme.colors.onInfoSubtle },
  }[tone];

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      style={[
        {
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xs,
          backgroundColor: background,
          borderRadius: theme.radii.pill,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.xs,
        },
        style,
      ]}
    >
      {glyph !== undefined ? (
        <Text variant="label" style={{ color: foreground }} accessibilityElementsHidden>
          {glyph}
        </Text>
      ) : null}
      <Text variant="label" style={{ color: foreground }}>
        {label}
      </Text>
    </View>
  );
}
