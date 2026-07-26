/**
 * Bulk import, with the validation report shown before anything is written.
 *
 * The whole design is "look before you leap": `validateRuleImport` is pure and runs on
 * the pasted text, the report lists every row that would fail and why, and only then
 * is an import button offered — for the valid rows only, with the count stated.
 *
 * A partially-applied import would leave the catalog in a state nobody chose, which in
 * a table every user's recommendation reads from is a correctness problem rather than
 * an inconvenience.
 */
import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Divider, HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import {
  parseImportText,
  summariseReport,
  validateRuleImport,
  type ImportReport,
} from '@/domain/catalog/bulkImport';
import type { RewardRuleInput } from '@/domain/schemas';

export function BulkImportPanel({
  onImport,
  isImporting = false,
  importedCount,
  testID,
}: {
  readonly onImport: (rules: readonly RewardRuleInput[]) => void;
  readonly isImporting?: boolean;
  /** Set after a successful import, so the panel can confirm what landed. */
  readonly importedCount?: number | null;
  readonly testID?: string;
}) {
  const [text, setText] = useState('');
  const [parseError, setParseError] = useState<string | undefined>(undefined);
  const [report, setReport] = useState<ImportReport | null>(null);

  const check = () => {
    const parsed = parseImportText(text);

    if ('error' in parsed) {
      setParseError(parsed.error);
      setReport(null);
      return;
    }

    setParseError(undefined);
    setReport(validateRuleImport(parsed.rows));
  };

  return (
    <Card testID={testID}>
      <VStack gap="lg">
        <VStack gap="xxs">
          <Text variant="title3" accessibilityRole="header">
            Bulk import
          </Text>
          <Text variant="callout" tone="secondary">
            Paste rules as JSON. Nothing is written until you have seen the report and chosen to
            import.
          </Text>
        </VStack>

        <TextField
          label="Rules as JSON"
          hint="An array of rule objects, using the same field names as the editor"
          value={text}
          onChangeText={(next) => {
            setText(next);
            // A stale report next to edited text would describe rows that no longer
            // exist, which is worse than no report.
            setReport(null);
            setParseError(undefined);
          }}
          multiline
          numberOfLines={6}
          autoCapitalize="none"
          autoCorrect={false}
          error={parseError}
          testID="import-text"
        />

        <Button
          label="Check the rules"
          variant="secondary"
          onPress={check}
          disabled={text.trim().length === 0}
          accessibilityHint="Validates every row and shows what would be imported. Writes nothing."
          testID="import-check"
        />

        {report === null ? null : (
          <VStack gap="md" testID="import-report">
            <Divider />
            <Text variant="bodyStrong" accessibilityLiveRegion="polite">
              {summariseReport(report)}
            </Text>

            <HStack gap="sm" wrap align="flex-start">
              <Badge
                label={`${report.validCount} ready`}
                tone={report.validCount > 0 ? 'best' : 'neutral'}
              />
              {report.invalidCount > 0 ? (
                <Badge label={`${report.invalidCount} rejected`} tone="negative" glyph="×" />
              ) : null}
            </HStack>

            {/* Rejected rows first: they are the ones needing action. */}
            {report.rows
              .filter((row) => !row.isValid)
              .map((row) => (
                <VStack
                  key={row.index}
                  gap="xxs"
                  accessible
                  accessibilityLabel={`Row ${row.index + 1} rejected. ${
                    row.label ?? 'No label'
                  }. ${row.issues.map((issue) => issue.message).join(' ')}`}
                  testID={`import-row-${row.index}`}
                >
                  <Text variant="callout" tone="danger">
                    Row {row.index + 1}: {row.label ?? 'no label'}
                  </Text>
                  {row.issues.map((issue) => (
                    <Text
                      key={`${issue.field}-${issue.message}`}
                      variant="caption"
                      tone="secondary"
                    >
                      {issue.field.length === 0 ? '' : `${issue.field}: `}
                      {issue.message}
                    </Text>
                  ))}
                </VStack>
              ))}

            {report.validCount > 0 ? (
              <VStack gap="xs">
                <Text variant="label" tone="secondary">
                  Would import
                </Text>
                {report.rows
                  .filter((row) => row.isValid)
                  .map((row) => (
                    <Text
                      key={row.index}
                      variant="caption"
                      tone="secondary"
                      testID={`import-valid-${row.index}`}
                    >
                      Row {row.index + 1}: {row.label}
                    </Text>
                  ))}
              </VStack>
            ) : null}

            <Button
              label={
                report.validCount === 1 ? 'Import 1 rule' : `Import ${report.validCount} rules`
              }
              loading={isImporting}
              disabled={report.isEmpty}
              onPress={() => onImport(report.validRows)}
              accessibilityHint={
                report.isEmpty
                  ? 'Nothing can be imported until the rows above are fixed'
                  : 'Writes the valid rows to the catalog. Rejected rows are left alone.'
              }
              testID="import-submit"
            />

            {report.invalidCount > 0 && report.validCount > 0 ? (
              <Text variant="footnote" tone="tertiary">
                Importing writes the {report.validCount} valid{' '}
                {report.validCount === 1 ? 'row' : 'rows'} only. The rejected{' '}
                {report.invalidCount === 1 ? 'row' : 'rows'} are not written and not changed —
                fix and paste again.
              </Text>
            ) : null}
          </VStack>
        )}

        {importedCount === null || importedCount === undefined ? null : (
          <Text variant="callout" tone="success" accessibilityLiveRegion="polite">
            Imported {importedCount} {importedCount === 1 ? 'rule' : 'rules'}. Each is
            unverified until someone checks it against a source.
          </Text>
        )}
      </VStack>
    </Card>
  );
}
