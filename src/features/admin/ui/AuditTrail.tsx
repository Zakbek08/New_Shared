/**
 * The audit trail.
 *
 * Rows come from `walletwise_private.audit_catalog_change()`, a SECURITY DEFINER
 * trigger — there is no INSERT policy, so nothing can write here from a client, and no
 * UPDATE or DELETE policy, so nothing can tidy it up afterwards.
 *
 * WHAT IT DELIBERATELY DOES NOT CONTAIN
 * Column **names** only, never values. Knowing that `base_rate` changed is what an
 * auditor needs; storing the old and new rate would put financial data into a table
 * whose whole purpose is being widely readable and never deleted. The screen says this
 * out loud so nobody mistakes the absence for an oversight.
 */
import { EmptyState, ErrorNotice, LoadingState } from '@/components/StateViews';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import type { AuditEntry } from '@/features/admin/api/catalog';
import { useAuditLog } from '@/features/admin/hooks';

const ACTION_LABELS: Readonly<Record<AuditEntry['action'], string>> = {
  insert: 'Created',
  update: 'Changed',
  delete: 'Deleted',
  verify: 'Verified',
  enroll: 'Activated',
  unenroll: 'Deactivated',
  export: 'Exported',
  admin_override: 'Admin override',
};

const ACTION_TONE: Readonly<
  Record<AuditEntry['action'], 'neutral' | 'best' | 'uncertain' | 'negative'>
> = {
  insert: 'best',
  update: 'neutral',
  delete: 'negative',
  verify: 'best',
  enroll: 'neutral',
  unenroll: 'neutral',
  export: 'uncertain',
  admin_override: 'negative',
};

function formatWhen(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'unknown time';
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(parsed);
}

/** `reward_rules` reads as "reward rules" without a second lookup table. */
function humaniseTable(tableName: string): string {
  return tableName.replace(/_/gu, ' ');
}

export function AuditEntryRow({ entry }: { readonly entry: AuditEntry }) {
  const columns =
    entry.changedColumns.length === 0 ? 'no columns recorded' : entry.changedColumns.join(', ');

  return (
    <VStack
      gap="xxs"
      accessible
      accessibilityLabel={[
        `${ACTION_LABELS[entry.action]} ${humaniseTable(entry.tableName)}.`,
        `${formatWhen(entry.occurredAt)}.`,
        entry.actorRole === null ? null : `By a ${entry.actorRole.replace(/_/gu, ' ')}.`,
        `Columns: ${columns}.`,
      ]
        .filter((part): part is string => part !== null)
        .join(' ')}
      testID={`audit-entry-${entry.id}`}
    >
      <HStack gap="sm" wrap align="flex-start">
        <Badge label={ACTION_LABELS[entry.action]} tone={ACTION_TONE[entry.action]} />
        <Text variant="callout">{humaniseTable(entry.tableName)}</Text>
      </HStack>
      <Text variant="caption" tone="secondary">
        {formatWhen(entry.occurredAt)}
        {entry.actorRole === null ? '' : ` · ${entry.actorRole.replace(/_/gu, ' ')}`}
      </Text>
      <Text variant="caption" tone="tertiary">
        {columns}
      </Text>
    </VStack>
  );
}

export function AuditTrail({
  tableName,
  testID,
}: {
  /** Filter to one table, or omit for everything the viewer is allowed to see. */
  readonly tableName?: string;
  readonly testID?: string;
}) {
  const audit = useAuditLog(tableName === undefined ? {} : { tableName });

  if (audit.isPending) return <LoadingState label="Loading the audit trail" />;

  if (audit.isError) {
    return (
      <ErrorNotice
        error={audit.error}
        onRetry={() => void audit.refetch()}
        testID="audit-error"
      />
    );
  }

  if (audit.data === undefined || audit.data.length === 0) {
    return (
      <EmptyState
        title="Nothing recorded yet"
        description="Catalog changes appear here as they happen. An empty trail means nothing has been changed, not that changes went unrecorded."
        testID="audit-empty"
      />
    );
  }

  return (
    <Card testID={testID}>
      <VStack gap="md">
        <VStack gap="xxs">
          <Text variant="title3" accessibilityRole="header">
            Audit history
          </Text>
          <Text variant="caption" tone="secondary">
            Newest first. What you can see is decided by the database: an admin sees every row,
            anyone else sees only their own.
          </Text>
        </VStack>

        <VStack gap="md">
          {audit.data.map((entry) => (
            <AuditEntryRow key={entry.id} entry={entry} />
          ))}
        </VStack>

        <Text variant="footnote" tone="tertiary">
          The trail records which columns changed, never the values. Storing the old and new
          figures would put financial data into a table designed to be widely readable and never
          deleted.
        </Text>
      </VStack>
    </Card>
  );
}
