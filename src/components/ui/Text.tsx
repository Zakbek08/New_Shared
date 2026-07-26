/**
 * Typed text primitive.
 *
 * `allowFontScaling` is on by default so the OS "larger text" setting is
 * respected — a dynamic-font requirement, and one that only works if nothing in
 * the app hard-codes a pixel line height. Line heights here are derived from a
 * ratio, so they grow with the font.
 */
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import type { TypographyVariant } from '@/theme/tokens';

export type TextTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'inverse'
  | 'success'
  | 'warning'
  | 'danger'
  | 'accent';

export interface TextProps extends RNTextProps {
  readonly variant?: TypographyVariant;
  readonly tone?: TextTone;
  readonly align?: TextStyle['textAlign'];
  /** Renders digits at a uniform width so reward columns line up. */
  readonly tabularNumbers?: boolean;
}

export function Text({
  variant = 'body',
  tone = 'primary',
  align,
  tabularNumbers = false,
  style,
  allowFontScaling = true,
  ...rest
}: TextProps) {
  const theme = useTheme();
  const scale = theme.typography[variant];

  const color = {
    primary: theme.colors.textPrimary,
    secondary: theme.colors.textSecondary,
    tertiary: theme.colors.textTertiary,
    inverse: theme.colors.textInverse,
    success: theme.colors.success,
    warning: theme.colors.warning,
    danger: theme.colors.danger,
    accent: theme.colors.primary,
  }[tone];

  return (
    <RNText
      allowFontScaling={allowFontScaling}
      style={[
        {
          color,
          fontSize: scale.fontSize,
          lineHeight: Math.round(scale.fontSize * scale.lineHeightRatio),
          fontWeight: scale.fontWeight,
          ...(align !== undefined ? { textAlign: align } : {}),
          ...(tabularNumbers ? { fontVariant: ['tabular-nums' as const] } : {}),
        },
        style,
      ]}
      {...rest}
    />
  );
}
