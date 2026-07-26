/**
 * Screen 16 — Administrative Card Catalog.
 *
 * Where reward rules get curated and verified. Reachable only by users whose
 * `users.role` is `catalog_editor` or `admin` — enforced by RLS in the database,
 * not merely by hiding the screen.
 *
 * Phase 6 builds the editor and the verification workflow.
 */
import { PlaceholderSection } from '@/components/PlaceholderSection';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { VERIFICATION_STATUS_LABELS, VERIFICATION_STATUSES } from '@/domain/enums';
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

export default function AdminCatalogScreen() {
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
          </VStack>
        </Card>

        <Card>
          <VStack gap="md">
            <Text variant="title3" accessibilityRole="header">
              Verification states
            </Text>
            <Text variant="callout" tone="secondary">
              Every rule carries a status and a source. Only `verified` requires both a source
              document and a verification date, and the database enforces that.
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

        <PlaceholderSection
          phase="Phase 6"
          title="Rule editor"
          description="Create and edit reward rules and their conditions: category, MCC ranges, included and excluded merchants, country, currency, channel, payment method, dates, activation requirement, caps, base and bonus rates."
          testID="admin-rule-editor"
        />

        <PlaceholderSection
          phase="Phase 6"
          title="Verification workflow"
          description="Record a source URL, mark a rule verified with today's date, and append to its verification history. Rules older than the freshness window are flagged stale automatically."
          testID="admin-verification"
        />

        <PlaceholderSection
          phase="Phase 6"
          title="Audit history"
          description="Which editor changed which fields and when. The trail records column names only, never values."
          testID="admin-audit"
        />
      </VStack>
    </Screen>
  );
}
