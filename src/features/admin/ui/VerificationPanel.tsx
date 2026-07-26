/**
 * Verification: recording that a human checked a rate against a document.
 *
 * This is the act the whole catalog rests on, so the panel is explicit about three
 * things:
 *
 *   * **A source is required to mark something verified.** The schema enforces it and
 *     the button stays disabled without one. "Verified" with no document is a claim
 *     with nothing behind it.
 *   * **Only `verified` stamps the date.** Marking a rule disputed does not mean
 *     someone checked it today, and stamping the date would reset its staleness clock.
 *   * **The history is append-only.** Every outcome is added, never edited, so a
 *     mistaken verification stays visible alongside its correction.
 */
import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Divider, HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { VERIFICATION_STATUS_LABELS } from '@/domain/enums';
import { FRESHNESS_WINDOW_DAYS } from '@/domain/catalog/staleness';
import { verificationSchema, type VerificationInput } from '@/domain/schemas';
import type { CatalogRule, VerificationHistoryEntry } from '@/features/admin/api/catalog';
import type { SourceRow } from '@/types/database';

import { AdminChip } from './AdminChip';

/** The outcomes an editor records by hand. `stale` is derived, never chosen. */
const RECORDABLE_STATUSES = ['verified', 'disputed', 'unverified', 'retired'] as const;

function formatDate(value: string | null): string {
  if (value === null) return 'never';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'unknown';
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

export function VerificationPanel({
  rule,
  sources,
  history,
  onSubmit,
  isSaving = false,
  testID,
}: {
  readonly rule: CatalogRule;
  readonly sources: readonly SourceRow[];
  readonly history: readonly VerificationHistoryEntry[];
  readonly onSubmit: (input: VerificationInput) => void;
  readonly isSaving?: boolean;
  readonly testID?: string;
}) {
  const [sourceId, setSourceId] = useState<string | null>(rule.sourceId);
  const [newStatus, setNewStatus] = useState<(typeof RECORDABLE_STATUSES)[number]>('verified');
  const [baseRate, setBaseRate] = useState(String(rule.baseRate));
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<readonly string[]>([]);

  const needsSource = newStatus === 'verified';
  const canSubmit = !needsSource || sourceId !== null;

  const submit = () => {
    const parsed = verificationSchema.safeParse({
      rewardRuleId: rule.id,
      sourceId,
      newStatus,
      verifiedBaseRate: baseRate.length === 0 ? null : baseRate,
      verifiedBonusRate: null,
      note: note.length === 0 ? undefined : note,
    });

    if (!parsed.success) {
      setErrors(parsed.error.issues.map((issue) => issue.message));
      return;
    }

    setErrors([]);
    onSubmit(parsed.data);
  };

  return (
    <Card testID={testID}>
      <VStack gap="lg">
        <VStack gap="xxs">
          <Text variant="title3" accessibilityRole="header">
            Verification
          </Text>
          <Text variant="callout" tone="secondary">
            Record what you checked and where you checked it. A verification lasts{' '}
            {FRESHNESS_WINDOW_DAYS} days, after which the rule is treated as out of date without
            anyone having to remember.
          </Text>
        </VStack>

        <HStack gap="sm" wrap align="flex-start">
          <Badge
            label={`Now: ${VERIFICATION_STATUS_LABELS[rule.verificationStatus]}`}
            tone="neutral"
          />
          <Badge label={`Last verified ${formatDate(rule.lastVerifiedAt)}`} tone="neutral" />
          {rule.freshness.isDowngradedByAge ? (
            <Badge label="Treated as out of date" tone="uncertain" glyph="!" />
          ) : null}
        </HStack>

        {errors.length > 0 ? (
          <VStack gap="xs" testID="verification-errors">
            {errors.map((message) => (
              <Text
                key={message}
                variant="caption"
                tone="danger"
                accessibilityLiveRegion="polite"
              >
                {message}
              </Text>
            ))}
          </VStack>
        ) : null}

        {/* ---- Outcome ---- */}
        <VStack gap="sm">
          <Text variant="label" tone="secondary">
            What did you find?
          </Text>
          <HStack gap="sm" wrap align="flex-start">
            {RECORDABLE_STATUSES.map((status) => (
              <AdminChip
                key={status}
                label={VERIFICATION_STATUS_LABELS[status]}
                selected={newStatus === status}
                tone={status === 'disputed' || status === 'retired' ? 'danger' : 'neutral'}
                onPress={() => setNewStatus(status)}
                testID={`verification-status-${status}`}
              />
            ))}
          </HStack>
          <Text variant="caption" tone="tertiary">
            &quot;Out of date&quot; is not an option here: it is worked out from the
            verification date rather than chosen.
          </Text>
        </VStack>

        {/* ---- Source ---- */}
        <VStack gap="sm">
          <Text variant="label" tone="secondary">
            Source document {needsSource ? '(required)' : '(optional)'}
          </Text>
          {sources.length === 0 ? (
            <Text variant="callout" tone="secondary">
              No sources recorded yet. Add one before marking a rule verified.
            </Text>
          ) : (
            <HStack gap="sm" wrap align="flex-start">
              {sources.map((source) => (
                <AdminChip
                  key={source.id}
                  label={source.is_fictional ? `${source.label} (demo)` : source.label}
                  selected={sourceId === source.id}
                  onPress={() => setSourceId(sourceId === source.id ? null : source.id)}
                  testID={`verification-source-${source.id}`}
                />
              ))}
            </HStack>
          )}
        </VStack>

        <TextField
          label="Rate you read on the source"
          hint="Recorded alongside the outcome, so a later reviewer can see what the document said at the time"
          value={baseRate}
          onChangeText={(text) => setBaseRate(text.replace(/[^0-9.]/gu, ''))}
          keyboardType="decimal-pad"
          testID="verification-base-rate"
        />

        <TextField
          label="Note"
          hint="Optional. What you checked, and anything ambiguous about it."
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={2}
          maxLength={500}
          testID="verification-note"
        />

        <Button
          label="Record verification"
          loading={isSaving}
          disabled={!canSubmit}
          onPress={submit}
          accessibilityHint={
            canSubmit
              ? 'Appends to this rule’s verification history and updates its status'
              : 'Choose a source document first'
          }
          testID="verification-submit"
        />

        {/* ---- History ---- */}
        <Divider />
        <VStack gap="sm">
          <Text variant="label" tone="secondary">
            History
          </Text>
          {history.length === 0 ? (
            <Text variant="callout" tone="secondary">
              Nothing recorded yet for this rule.
            </Text>
          ) : (
            history.map((entry) => (
              <VStack
                key={entry.id}
                gap="xxs"
                accessible
                accessibilityLabel={[
                  `${formatDate(entry.verifiedAt)}.`,
                  entry.previousStatus === null
                    ? `Set to ${VERIFICATION_STATUS_LABELS[entry.newStatus]}.`
                    : `Changed from ${VERIFICATION_STATUS_LABELS[entry.previousStatus]} to ${
                        VERIFICATION_STATUS_LABELS[entry.newStatus]
                      }.`,
                  entry.sourceLabel === null ? null : `Source: ${entry.sourceLabel}.`,
                  entry.verifiedBaseRate === null
                    ? null
                    : `Rate read: ${entry.verifiedBaseRate}.`,
                  entry.note,
                ]
                  .filter((part): part is string => part !== null && part.length > 0)
                  .join(' ')}
                testID={`verification-history-${entry.id}`}
              >
                <Text variant="callout">
                  {VERIFICATION_STATUS_LABELS[entry.newStatus]} · {formatDate(entry.verifiedAt)}
                </Text>
                <Text variant="caption" tone="secondary">
                  {entry.sourceLabel ?? 'No source recorded'}
                  {entry.verifiedBaseRate === null
                    ? ''
                    : ` · read as ${entry.verifiedBaseRate}`}
                </Text>
                {entry.note === null ? null : (
                  <Text variant="caption" tone="tertiary">
                    {entry.note}
                  </Text>
                )}
              </VStack>
            ))
          )}
          <Text variant="footnote" tone="tertiary">
            This history is append-only — there is no policy that permits editing or deleting a
            row, so a mistaken verification stays visible next to its correction.
          </Text>
        </VStack>
      </VStack>
    </Card>
  );
}
