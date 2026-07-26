/**
 * A determinate progress bar.
 *
 * Two accessibility requirements shape this component:
 *
 *   * It carries `accessibilityValue`, so a screen reader announces "62 percent"
 *     rather than describing a decorative rectangle.
 *   * The fill colour is never the only signal. Callers pass a `valueLabel` such as
 *     "$4,500 of $6,000 left", which is rendered as text beside the bar — an amber
 *     bar means nothing in greyscale.
 */
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { HStack } from './Stack';
import { Text } from './Text';

export type ProgressTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface ProgressBarProps {
  /** 0-1. Values outside the range are clamped rather than overflowing the track. */
  readonly value: number;
  readonly label: string;
  /** The figure in words, e.g. "$4,500 of $6,000 left". Always rendered. */
  readonly valueLabel: string;
  readonly tone?: ProgressTone;
  /** Extra context announced after the value, e.g. "resets in 12 days". */
  readonly hint?: string;
  readonly testID?: string;
}

const TRACK_HEIGHT = 8;

export function ProgressBar({
  value,
  label,
  valueLabel,
  tone = 'neutral',
  hint,
  testID,
}: ProgressBarProps) {
  const theme = useTheme();

  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const percent = Math.round(clamped * 100);

  const fill = {
    neutral: theme.colors.primary,
    success: theme.colors.success,
    warning: theme.colors.warning,
    danger: theme.colors.danger,
  }[tone];

  return (
    // One accessible node for the whole component, carrying the progressbar role and
    // the value. The inner track is decorative once the value is announced here, and
    // exposing it separately would make a screen reader read the row twice.
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent, text: `${percent}%` }}
      accessibilityLabel={[label, valueLabel, hint].filter(Boolean).join('. ')}
      testID={testID}
      style={{ gap: 4 }}
    >
      <HStack gap="md" justify="space-between" align="flex-start">
        <Text variant="callout" style={{ flex: 1 }}>
          {label}
        </Text>
        <Text variant="callout" tone="secondary" tabularNumbers>
          {valueLabel}
        </Text>
      </HStack>

      <View
        // Decorative: the value is announced by the accessible wrapper above.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          height: TRACK_HEIGHT,
          borderRadius: TRACK_HEIGHT / 2,
          backgroundColor: theme.colors.surfaceSunken,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            // `${percent}%` rather than a measured width: no layout pass needed, and
            // it scales correctly when the OS font size grows the row.
            width: `${percent}%`,
            height: '100%',
            borderRadius: TRACK_HEIGHT / 2,
            backgroundColor: fill,
          }}
        />
      </View>

      {hint === undefined ? null : (
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      )}
    </View>
  );
}
