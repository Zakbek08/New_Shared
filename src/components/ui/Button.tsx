/**
 * Button primitive.
 *
 * Enforces the 44pt minimum touch target, exposes the correct accessibility role
 * and state, and never relies on colour alone to signal that it is disabled — a
 * disabled button also reports `accessibilityState.disabled` and stops
 * responding to touch.
 */
import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'medium' | 'large';

export interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly fullWidth?: boolean;
  /** Extra context for screen readers, e.g. what happens next. */
  readonly accessibilityHint?: string;
  readonly style?: ViewStyle;
  readonly testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  fullWidth = false,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const isInert = disabled || loading;

  const surface = {
    primary: theme.colors.primary,
    secondary: theme.colors.surfaceSunken,
    ghost: 'transparent',
    danger: theme.colors.danger,
  }[variant];

  const pressedSurface = {
    primary: theme.colors.primaryPressed,
    secondary: theme.colors.border,
    ghost: theme.colors.surfaceSunken,
    danger: theme.colors.danger,
  }[variant];

  const foreground = {
    primary: theme.colors.onPrimary,
    secondary: theme.colors.textPrimary,
    ghost: theme.colors.primary,
    danger: theme.colors.textInverse,
  }[variant];

  const verticalPadding = size === 'large' ? theme.spacing.lg : theme.spacing.md;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isInert, busy: loading }}
      disabled={isInert}
      onPress={onPress}
      testID={testID}
      hitSlop={theme.spacing.sm}
      style={({ pressed }) => [
        {
          minHeight: MIN_TOUCH_TARGET,
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'row',
          gap: theme.spacing.sm,
          backgroundColor: pressed ? pressedSurface : surface,
          borderRadius: theme.radii.md,
          borderWidth: variant === 'ghost' ? 1 : 0,
          borderColor: theme.colors.border,
          paddingVertical: verticalPadding,
          paddingHorizontal: theme.spacing.xl,
          opacity: isInert ? 0.5 : 1,
          ...(fullWidth ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' }),
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={foreground} accessibilityElementsHidden /> : null}
      <View>
        <Text
          variant={size === 'large' ? 'title3' : 'bodyStrong'}
          style={{ color: foreground }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
