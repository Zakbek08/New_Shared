/**
 * Loading, empty and error states.
 *
 * Every async surface in the app needs all three, and doing them inconsistently
 * is how "nothing happened" bugs reach users. `ErrorNotice` deliberately renders
 * `DataError.userMessage` and never a raw exception message — a Postgres error
 * can echo the input that caused it.
 */
import { ActivityIndicator, View } from 'react-native';

import { DataError, toDataError } from '@/lib/errors';
import { useTheme } from '@/theme/ThemeProvider';

import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Text } from './ui/Text';
import { VStack } from './ui/Stack';

export function LoadingState({
  label = 'Loading',
  testID,
}: {
  readonly label?: string;
  readonly testID?: string;
}) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      testID={testID}
      style={{
        paddingVertical: theme.spacing.xxl,
        alignItems: 'center',
        gap: theme.spacing.md,
      }}
    >
      <ActivityIndicator color={theme.colors.primary} />
      <Text variant="callout" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  testID,
}: {
  readonly title: string;
  readonly description: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly testID?: string;
}) {
  return (
    <Card testID={testID} accessibilityLabel={`${title}. ${description}`}>
      <VStack gap="md">
        <Text variant="title3">{title}</Text>
        <Text variant="callout" tone="secondary">
          {description}
        </Text>
        {actionLabel !== undefined && onAction !== undefined ? (
          <Button label={actionLabel} onPress={onAction} fullWidth />
        ) : null}
      </VStack>
    </Card>
  );
}

/**
 * Renders a failure.
 *
 * Only offers a retry when retrying could plausibly help: an RLS refusal or a
 * validation error will fail identically every time, and a retry button that
 * never works is worse than no button.
 */
export function ErrorNotice({
  error,
  onRetry,
  testID,
}: {
  readonly error: unknown;
  readonly onRetry?: () => void;
  readonly testID?: string;
}) {
  const dataError: DataError = error instanceof DataError ? error : toDataError(error);
  const canRetry = onRetry !== undefined && dataError.isRetryable;

  return (
    <Card
      emphasis="negative"
      testID={testID}
      accessibilityLabel={`Error. ${dataError.userMessage}`}
    >
      <VStack gap="md">
        <Text variant="bodyStrong" tone="danger">
          Something went wrong
        </Text>
        <Text variant="callout" tone="secondary">
          {dataError.userMessage}
        </Text>
        {canRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} /> : null}
      </VStack>
    </Card>
  );
}
