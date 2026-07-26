/**
 * Screen 16 — Administrative Card Catalog.
 *
 * Where reward rules get curated and verified.
 *
 * THE ROLE CHECK ON THIS SCREEN IS A COURTESY, NOT A CONTROL.
 * Write access is decided by `can_edit_catalog()` inside the RLS policies on
 * `reward_rules`, `reward_rule_conditions` and `sources`. A member who reaches this
 * screen — by a deep link, a stale build, or a rebuilt client — can press every button
 * here and the database will refuse each write with SQLSTATE 42501, which surfaces as a
 * plain "you do not have permission" rather than a silent failure. The screen checks
 * the role so an editor is not shown tools they cannot use, and says which side is
 * really enforcing.
 *
 * Every write is also audited by a SECURITY DEFINER trigger: actor, action and the
 * column *names* that changed, never the values.
 */
import { useMemo, useState } from 'react';

import { DisclaimerNotice } from '@/components/Disclaimers';
import { EmptyState, ErrorNotice, LoadingState } from '@/components/StateViews';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { VERIFICATION_STATUS_LABELS, VERIFICATION_STATUSES } from '@/domain/enums';
import { FRESHNESS_WINDOW_DAYS } from '@/domain/catalog/staleness';
import type { CatalogRule } from '@/features/admin/api/catalog';
import {
  useBulkImport,
  useCatalogAccess,
  useCatalogRules,
  useRecordVerification,
  useRetireRule,
  useSaveCondition,
  useSaveRule,
  useSources,
  useVerificationHistory,
} from '@/features/admin/hooks';
import { AuditTrail } from '@/features/admin/ui/AuditTrail';
import { BulkImportPanel } from '@/features/admin/ui/BulkImportPanel';
import { ConditionBuilder } from '@/features/admin/ui/ConditionBuilder';
import { RuleEditor } from '@/features/admin/ui/RuleEditor';
import { RuleQueue } from '@/features/admin/ui/RuleQueue';
import { VerificationPanel } from '@/features/admin/ui/VerificationPanel';
import type { VerificationStatus } from '@/types/database';

/** How each verification status is presented. Colour plus a label, never colour alone. */
const STATUS_TONE: Record<VerificationStatus, 'best' | 'uncertain' | 'negative' | 'neutral'> = {
  verified: 'best',
  user_reported: 'uncertain',
  stale: 'uncertain',
  unverified: 'neutral',
  disputed: 'negative',
  retired: 'neutral',
};

type Panel =
  | { readonly kind: 'none' }
  | { readonly kind: 'editing'; readonly rule: CatalogRule | null }
  | { readonly kind: 'verifying'; readonly rule: CatalogRule }
  | { readonly kind: 'conditions'; readonly rule: CatalogRule };

export default function AdminCatalogScreen() {
  // The clock is read here, at the screen's edge, and handed to the staleness
  // derivation — which is pure and takes `asOf`, like the rewards engine.
  const asOf = useMemo(() => new Date(), []);

  const access = useCatalogAccess();
  const [search, setSearch] = useState('');
  const [panel, setPanel] = useState<Panel>({ kind: 'none' });

  const rules = useCatalogRules({ asOf, search });
  const sources = useSources();
  const saveRule = useSaveRule();
  const retire = useRetireRule();
  const saveCondition = useSaveCondition();
  const verify = useRecordVerification();
  const bulkImport = useBulkImport();

  const activeRuleId = panel.kind === 'verifying' ? panel.rule.id : null;
  const history = useVerificationHistory(activeRuleId);

  /** Distinct products from the rules already loaded, for the editor's chips. */
  const products = useMemo(() => {
    const seen = new Map<string, string>();
    for (const rule of rules.data ?? []) {
      if (!seen.has(rule.cardProductId)) seen.set(rule.cardProductId, rule.productName);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [rules.data]);

  return (
    <Screen
      scroll
      accessibilityLabel="Administrative card catalog"
      testID="admin-catalog-screen"
    >
      <VStack gap="xl">
        <VStack gap="sm">
          <Text variant="title1" accessibilityRole="header">
            Card catalog
          </Text>
          <Text variant="body" tone="secondary">
            Curate the reward rules every user&apos;s recommendation depends on.
          </Text>
        </VStack>

        <Card emphasis="accent">
          <VStack gap="sm">
            <Text variant="title3" accessibilityRole="header">
              Access is enforced in the database
            </Text>
            <Text variant="callout" tone="secondary">
              Write access needs the catalog editor or admin role. That check lives in the
              row-level security policies on the catalog tables, so hiding this screen is a
              convenience — the database refuses the write regardless. A member cannot promote
              themselves, either: the update policy pins their own role to its current value.
            </Text>
            {access.isPending ? null : (
              <HStack gap="sm" wrap align="flex-start">
                <Badge
                  label={
                    access.role === null
                      ? 'Role unknown'
                      : `Your role: ${access.role.replace(/_/gu, ' ')}`
                  }
                  tone={access.canEdit ? 'best' : 'neutral'}
                />
                <Badge
                  label={access.canEdit ? 'May edit the catalog' : 'Read-only'}
                  tone={access.canEdit ? 'best' : 'uncertain'}
                  glyph={access.canEdit ? '✓' : '!'}
                />
              </HStack>
            )}
          </VStack>
        </Card>

        {/* A member sees the catalog and is told plainly why they cannot change it. */}
        {!access.isPending && !access.canEdit ? (
          <Card emphasis="uncertain" testID="admin-read-only-notice">
            <VStack gap="sm">
              <Text variant="title3" accessibilityRole="header">
                You can look, but not change
              </Text>
              <Text variant="callout" tone="secondary">
                Editing needs the catalog editor or admin role. The editing tools are hidden
                because they would not work: every write is refused by the database, not by this
                screen. Ask an admin if you need the role.
              </Text>
            </VStack>
          </Card>
        ) : null}

        <Card>
          <VStack gap="md">
            <Text variant="title3" accessibilityRole="header">
              Verification states
            </Text>
            <Text variant="callout" tone="secondary">
              Every rule carries a status and a source. Only `verified` requires both a source
              document and a verification date, and the database enforces that. A verification
              lasts {FRESHNESS_WINDOW_DAYS} days: past that the rule is treated as out of date
              automatically, with no write and no scheduled job.
            </Text>
            <HStack gap="sm" wrap align="flex-start">
              {VERIFICATION_STATUSES.map((status) => (
                <Badge
                  key={status}
                  label={VERIFICATION_STATUS_LABELS[status]}
                  tone={STATUS_TONE[status]}
                  testID={`verification-${status}`}
                />
              ))}
            </HStack>
          </VStack>
        </Card>

        {saveRule.isError ? (
          <ErrorNotice error={saveRule.error} testID="admin-save-error" />
        ) : null}
        {retire.isError ? (
          <ErrorNotice error={retire.error} testID="admin-retire-error" />
        ) : null}
        {verify.isError ? (
          <ErrorNotice error={verify.error} testID="admin-verify-error" />
        ) : null}
        {saveCondition.isError ? (
          <ErrorNotice error={saveCondition.error} testID="admin-condition-error" />
        ) : null}
        {bulkImport.isError ? (
          <ErrorNotice error={bulkImport.error} testID="admin-import-error" />
        ) : null}

        {/* ---- The open panel, if any ---- */}
        {panel.kind === 'editing' ? (
          <RuleEditor
            ruleId={panel.rule?.id ?? null}
            products={products}
            defaultValues={
              panel.rule === null
                ? undefined
                : {
                    cardProductId: panel.rule.cardProductId,
                    label: panel.rule.label,
                    kind: panel.rule.kind,
                    rewardType: panel.rule.rewardType,
                    rewardUnit: panel.rule.rewardUnit,
                    baseRate: String(panel.rule.baseRate),
                    bonusRate: String(panel.rule.bonusRate),
                    priority: String(panel.rule.priority),
                    stackGroup: panel.rule.stackGroup,
                    isStackable: panel.rule.isStackable,
                    capPeriod: panel.rule.capPeriod,
                    capAppliesTo: panel.rule.capAppliesTo,
                    requiresEnrollment: panel.rule.requiresEnrollment,
                    verificationStatus: panel.rule.verificationStatus,
                    notes: panel.rule.notes ?? '',
                  }
            }
            isSaving={saveRule.isPending}
            onCancel={() => setPanel({ kind: 'none' })}
            onSubmit={(input) =>
              saveRule.mutate(
                { id: panel.rule?.id ?? null, input },
                { onSuccess: () => setPanel({ kind: 'none' }) },
              )
            }
            testID="admin-rule-editor"
          />
        ) : null}

        {panel.kind === 'verifying' ? (
          <VerificationPanel
            rule={panel.rule}
            sources={sources.data ?? []}
            history={history.data ?? []}
            isSaving={verify.isPending}
            onSubmit={(input) =>
              verify.mutate({ input, asOf }, { onSuccess: () => setPanel({ kind: 'none' }) })
            }
            testID="admin-verification"
          />
        ) : null}

        {panel.kind === 'conditions' ? (
          <ConditionBuilder
            rewardRuleId={panel.rule.id}
            conditionId={null}
            merchants={[]}
            isSaving={saveCondition.isPending}
            onCancel={() => setPanel({ kind: 'none' })}
            onSubmit={(input) =>
              saveCondition.mutate(
                { id: null, input },
                { onSuccess: () => setPanel({ kind: 'none' }) },
              )
            }
            testID="admin-condition-builder"
          />
        ) : null}

        {/* ---- The queue ---- */}
        <VStack gap="md">
          <TextField
            label="Find a rule"
            hint="Searches the label"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            testID="admin-search"
          />

          {access.canEdit ? (
            <Button
              label="New rule"
              onPress={() => setPanel({ kind: 'editing', rule: null })}
              disabled={products.length === 0}
              accessibilityHint={
                products.length === 0
                  ? 'Loading the products a rule can belong to'
                  : 'Opens the rule editor'
              }
              testID="admin-new-rule"
            />
          ) : null}
        </VStack>

        {rules.isPending ? (
          <LoadingState label="Loading the catalog" />
        ) : rules.isError ? (
          <ErrorNotice
            error={rules.error}
            onRetry={() => void rules.refetch()}
            testID="admin-rules-error"
          />
        ) : (rules.data ?? []).length === 0 ? (
          <EmptyState
            title="No rules match"
            description="Nothing in the catalog matches that search. Clear it to see everything."
            testID="admin-rules-empty"
          />
        ) : (
          <RuleQueue
            rules={rules.data}
            onEdit={(rule) => setPanel({ kind: 'editing', rule })}
            onVerify={(rule) => setPanel({ kind: 'verifying', rule })}
            onRetire={(rule) => retire.mutate({ id: rule.id, reinstate: !rule.isActive })}
            testID="admin-rule-queue"
          />
        )}

        {access.canEdit ? (
          <BulkImportPanel
            isImporting={bulkImport.isPending}
            importedCount={bulkImport.data?.insertedCount ?? null}
            onImport={(imported) => bulkImport.mutate(imported)}
            testID="admin-bulk-import"
          />
        ) : null}

        <AuditTrail testID="admin-audit" />

        <DisclaimerNotice kind="financial" />
      </VStack>
    </Screen>
  );
}
