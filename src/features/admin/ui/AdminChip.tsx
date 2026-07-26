/**
 * A selectable chip for the admin forms.
 *
 * Its own component rather than a copy of the purchase-form chip because the admin
 * screens select from long, technical lists (nine payment methods, eight cap periods)
 * and need a `selected` state a screen reader announces. Same 44pt target as
 * everywhere else.
 */
import { Pressable } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

export function AdminChip({
  label,
  selected,
  onPress,
  hint,
  tone = 'neutral',
  testID,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly hint?: string;
  /** `danger` marks a chip that removes something, e.g. an exclusion. */
  readonly tone?: 'neutral' | 'danger';
  readonly testID?: string;
}) {
  const theme = useTheme();

  const borderColor = selected
    ? tone === 'danger'
      ? theme.colors.danger
      : theme.colors.primary
    : theme.colors.border;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ selected }}
      onPress={onPress}
      testID={testID}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radii.pill,
        borderWidth: selected ? 2 : 1,
        borderColor,
        backgroundColor: selected
          ? tone === 'danger'
            ? theme.colors.dangerSubtle
            : theme.colors.primarySubtle
          : theme.colors.surface,
      }}
    >
      <Text
        variant="label"
        style={{
          color: selected
            ? tone === 'danger'
              ? theme.colors.onDangerSubtle
              : theme.colors.onPrimarySubtle
            : theme.colors.textPrimary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
