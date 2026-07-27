/**
 * "Source document and change history" — the recommendation-details provenance region.
 *
 * The last question the audit trail has to answer. The screen above it shows the
 * arithmetic; this shows where the rate that arithmetic used came from, and every
 * change recorded against it since.
 *
 * WHY THE HISTORY MATTERS ON THIS SCREEN
 * `verification_history` is append-only and snapshots the rate at each verification.
 * That is what keeps a recommendation explainable after an issuer changes the terms:
 * without it, a user looking back at an old answer would see today's rate and
 * conclude the app had got the arithmetic wrong.
 */
import { ErrorNotice, LoadingState } from '@/components/StateViews';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Divider, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { formatDay } from '@/lib/format';
import type { RewardType } from '@/types/database';

import type { VerificationEvent } from '../api/provenance';
import { describeRecordedRate, describeVerificationEvent } from '../describe';
import { useRuleProvenance } from '../hooks';
import { SourceDetails } from './SourceDetails';

export interface RuleHistorySectionProps {
  /** The rule the engine actually applied. `null` when no rule matched. */
  readonly ruleId: string | null;
  /** Used to format the rate a history entry recorded. */
  readonly rewardType: RewardType | null;
  readonly testID?: string;
}

function HistoryEntry({
  event,
  rewardType,
}: {
  readonly event: VerificationEvent;
  readonly rewardType: RewardType | null;
}) {
  const day = formatDay(event.verifiedAt);
  const rate = describeRecordedRate(event, rewardType);

  return (
    <VStack gap="xxs" testID={`history-entry-${event.id}`}>
      {day === null ? null : (
        <Text variant="label" tone="secondary" tabularNumbers>
          {day}
        </Text>
      )}
      <Text variant="callout">{describeVerificationEvent(event)}</Text>
      {rate === null ? null : (
        <Text variant="footnote" tone="tertiary" tabularNumbers>
          {rate}
        </Text>
      )}
      {event.note === null ? null : (
        <Text variant="footnote" tone="tertiary">
          {event.note}
        </Text>
      )}
      {event.sourceLabel === null ? null : (
        <Text variant="footnote" tone="tertiary">
          Checked against: {event.sourceLabel}
        </Text>
      )}
    </VStack>
  );
}

export function RuleHistorySection({ ruleId, rewardType, testID }: RuleHistorySectionProps) {
  // An empty list disables the query, so a null rule id costs no request.
  const provenance = useRuleProvenance(ruleId === null ? [] : [ruleId]);
  const entry = provenance.data?.[0] ?? null;

  return (
    <Card testID={testID}>
      <VStack gap="md">
        <Text variant="title3" accessibilityRole="header">
          Source document and change history
        </Text>

        {ruleId === null ? (
          <Text variant="callout" tone="secondary">
            No bonus rule was applied to this purchase, so there is no single document to cite.
            The card&apos;s own earn rates and their sources are on its card page.
          </Text>
        ) : provenance.isPending ? (
          <LoadingState label="Loading the source" testID="history-loading" />
        ) : provenance.isError ? (
          <ErrorNotice
            error={provenance.error}
            onRetry={() => void provenance.refetch()}
            testID="history-error"
          />
        ) : entry === null ? (
          <Text variant="callout" tone="secondary">
            This rule is no longer in the catalog, so its source cannot be shown. The figures
            above are still the ones that were used at the time.
          </Text>
        ) : (
          <VStack gap="lg">
            <SourceDetails
              source={entry.source}
              verificationStatus={entry.verificationStatus}
              lastVerifiedAt={entry.lastVerifiedAt}
              testID="history-source"
            />

            <VStack gap="sm">
              <Divider />
              <Text variant="label" tone="secondary">
                Changes recorded against this rule
              </Text>

              {entry.history.length === 0 ? (
                <Text variant="callout" tone="secondary">
                  Nothing has been recorded against this rule since it was first loaded.
                </Text>
              ) : (
                <VStack gap="md">
                  {entry.history.map((event) => (
                    <HistoryEntry key={event.id} event={event} rewardType={rewardType} />
                  ))}
                </VStack>
              )}

              <Badge label="Newest first" tone="neutral" />
              <Text variant="footnote" tone="tertiary">
                This log is append-only: a correction is a new entry, never an edit to an old
                one. That is what lets an old recommendation still be checked.
              </Text>
            </VStack>
          </VStack>
        )}
      </VStack>
    </Card>
  );
}
