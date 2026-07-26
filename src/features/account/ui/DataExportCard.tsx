/**
 * "Download everything we hold about you."
 *
 * The copy states what the file contains *and* what it does not, because an
 * export is the one place a user checks whether we kept something we said we
 * would not. Saying "no card number is in this file, because we never had one" is
 * more reassuring than silence, and it is true.
 */
import { StyleSheet } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { ErrorNotice } from '@/components/StateViews';
import { useExportAccountData } from '@/features/account/hooks';

export function DataExportCard() {
  const exportData = useExportAccountData();
  const result = exportData.data ?? null;

  return (
    <Card>
      <VStack gap="md">
        <Text variant="title3" accessibilityRole="header">
          Export your data
        </Text>

        <Text variant="body" tone="secondary">
          Downloads a JSON file containing your profile, your cards, your reward valuations,
          your offers, your recorded spending against caps, and every purchase you have asked
          about along with the recommendation we gave.
        </Text>

        <Text variant="footnote" tone="tertiary">
          Any card digits you stored are encrypted with a key that stays on this device, so the
          file marks them as encrypted rather than showing them. There is no card number,
          security code or PIN in the file, because WalletWise never stores one.
        </Text>

        {exportData.isError ? (
          <ErrorNotice error={exportData.error} testID="account-export-error" />
        ) : null}

        {result !== null ? (
          <Text
            variant="footnote"
            tone="secondary"
            style={styles.result}
            testID="account-export-result"
          >
            {result.wasShared
              ? `Exported ${result.recordCount} records as ${result.fileName}.`
              : `Saved ${result.recordCount} records to ${result.fileName} on this device. Sharing is not available here, so the file has not been sent anywhere.`}
          </Text>
        ) : null}

        <Button
          label="Export my data"
          variant="secondary"
          fullWidth
          loading={exportData.isPending}
          onPress={() => exportData.mutate()}
          accessibilityHint="Builds a JSON file of everything WalletWise holds about you and opens the share sheet"
          testID="account-export"
        />
      </VStack>
    </Card>
  );
}

const styles = StyleSheet.create({
  result: {
    // Reads as a status line rather than as body copy.
    fontStyle: 'italic',
  },
});
