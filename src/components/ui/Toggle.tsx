/**
 * Labelled switch row.
 *
 * The whole row is one accessible element with the `switch` role, so a screen
 * reader announces the label, the description and the on/off state together
 * rather than as three unrelated nodes.
 */
import { Pressable, Switch, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

import { Text } from './Text';

export interface ToggleProps {
  readonly label: string;
  readonly description?: string;
  readonly value: boolean;
  readonly onValueChange: (value: boolean) => void;
  readonly disabled?: boolean;
  readonly testID?: string;
}

export function Toggle({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
  testID,
}: ToggleProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      testID={testID}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <Text variant="bodyStrong">{label}</Text>
        {description !== undefined ? (
          <Text variant="caption" tone="secondary">
            {description}
          </Text>
        ) : null}
      </View>

      {/* The row owns the interaction, so the switch itself is decorative. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
          thumbColor={theme.colors.surface}
        />
      </View>
    </Pressable>
  );
}
