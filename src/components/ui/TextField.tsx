/**
 * Labelled text input.
 *
 * Accessibility notes that matter here:
 *  - The visible label is also the accessible name, so a screen reader and a
 *    sighted user hear and see the same thing.
 *  - An error is announced via `accessibilityLiveRegion` and referenced by the
 *    input's hint, rather than being a red border a screen reader cannot see.
 *  - Colour is never the only error signal: the message is always text.
 */
import { useId, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

import { Text } from './Text';
import { VStack } from './Stack';

export interface TextFieldProps extends Omit<
  TextInputProps,
  'style' | 'placeholderTextColor' | 'accessibilityLabel'
> {
  readonly label: string;
  readonly error?: string | undefined;
  /** Guidance shown under the field when there is no error. */
  readonly hint?: string;
  readonly required?: boolean;
  readonly testID?: string;
}

export function TextField({
  label,
  error,
  hint,
  required = false,
  testID,
  onFocus,
  onBlur,
  ...inputProps
}: TextFieldProps) {
  const theme = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const generatedId = useId();

  const hasError = error !== undefined && error.length > 0;
  const describedBy = hasError ? `${generatedId}-error` : undefined;

  const borderColor = hasError
    ? theme.colors.danger
    : isFocused
      ? theme.colors.focusRing
      : theme.colors.border;

  return (
    <VStack gap="xs">
      <Text variant="label" tone="secondary">
        {label}
        {required ? ' *' : ''}
      </Text>

      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hasError ? error : hint}
        // `invalid` is not part of RN's AccessibilityState, so the error text
        // below is what actually conveys the state to assistive technology.
        aria-invalid={hasError}
        aria-describedby={describedBy}
        testID={testID}
        placeholderTextColor={theme.colors.textTertiary}
        onFocus={(event) => {
          setIsFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setIsFocused(false);
          onBlur?.(event);
        }}
        style={{
          minHeight: MIN_TOUCH_TARGET,
          color: theme.colors.textPrimary,
          backgroundColor: theme.colors.surface,
          borderWidth: isFocused || hasError ? 2 : 1,
          borderColor,
          borderRadius: theme.radii.md,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          fontSize: theme.typography.body.fontSize,
        }}
        {...inputProps}
      />

      {hasError ? (
        <View accessibilityLiveRegion="polite" testID={`${testID ?? 'field'}-error`}>
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        </View>
      ) : hint !== undefined ? (
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      ) : null}
    </VStack>
  );
}
