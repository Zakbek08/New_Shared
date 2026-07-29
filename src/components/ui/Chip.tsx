/**
 * A selectable pill, used wherever the user picks one option from a short list.
 *
 * Selection is carried three ways at once, deliberately: a border weight, a background
 * change, and `accessibilityState.selected`. Colour alone would exclude a colour-blind
 * user, and a visual-only cue would exclude a screen-reader user entirely — they would
 * hear a list of categories with no indication which one is chosen.
 */
import { Pressable } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

import { Text } from './Text';

export interface ChipProps {
  readonly label: string;
  readonly hint?: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly testID?: string;
}

export function Chip({ label, hint, selected, onPress, testID }: ChipProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ selected }}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radii.pill,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.colors.primary : theme.colors.border,
        backgroundColor: selected
          ? theme.colors.primarySubtle
          : pressed
            ? theme.colors.surfaceSunken
            : theme.colors.surface,
      })}
    >
      <Text
        variant="label"
        style={{ color: selected ? theme.colors.onPrimarySubtle : theme.colors.textPrimary }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
