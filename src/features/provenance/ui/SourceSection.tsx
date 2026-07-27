/**
 * "Where these rates came from" — the card-details provenance region.
 *
 * One entry per earn rate on the card, each naming the document behind it and how
 * fresh that verification is. This is the answer to the question a careful user asks
 * after reading a rate: *says who?*
 *
 * FRESHNESS IS DERIVED, NOT STORED.
 * A rule's `verification_status` column says what a curator last decided; whether
 * that decision is still good is a function of how long ago it was, which
 * `ruleFreshness` works out from the `asOf` the screen passes in. So a rate can read
 * "Verified" in the catalog and "Out of date" here, and here is the honest one.
 */
import { ErrorNotice, LoadingState } from '@/components/StateViews';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Divider, HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import {
  FRESHNESS_BAND_LABELS,
  FRESHNESS_WINDOW_DAYS,
  ruleFreshness,
} from '@/domain/catalog/staleness';
import { VERIFICATION_STATUS_STRENGTH } from '@/domain/catalog/summary';
import type { VerificationStatus } from '@/types/database';

import type { RuleProvenance, SourceSummary } from '../api/provenance';
import { useRuleProvenance } from '../hooks';
import { SourceDetails } from './SourceDetails';

export interface SourceSectionProps {
  /** The card's active rule ids, in the order the screen lists them. */
  readonly ruleIds: readonly string[];
  readonly asOf: Date;
  readonly testID?: string;
}

function freshnessTone(band: ReturnType<typeof ruleFreshness>['band']) {
  switch (band) {
    case 'fresh':
      return 'best' as const;
    case 'due_soon':
      return 'uncertain' as const;
    case 'stale':
      return 'negative' as const;
    case 'never_verified':
      return 'uncertain' as const;
  }
}

/**
 * The rule's own line: its label and how fresh its verification is.
 *
 * Rendered with or without a document beside it, because whether the document is shown
 * here or once at the top of the section, the freshness belongs to the rule — two rules
 * can cite the same terms and have been checked against them months apart.
 */
function RuleFreshness({
  entry,
  asOf,
  children,
}: {
  readonly entry: RuleProvenance;
  readonly asOf: Date;
  readonly children?: React.ReactNode;
}) {
  const freshness = ruleFreshness(
    {
      lastVerifiedAt: entry.lastVerifiedAt === null ? null : new Date(entry.lastVerifiedAt),
      verificationStatus: entry.verificationStatus,
    },
    asOf,
  );

  return (
    <VStack gap="sm" testID={`source-entry-${entry.ruleId}`}>
      <Text variant="bodyStrong">{entry.ruleLabel}</Text>

      <HStack gap="sm" wrap align="flex-start">
        <Badge
          label={FRESHNESS_BAND_LABELS[freshness.band]}
          tone={freshnessTone(freshness.band)}
        />
        {freshness.daysSinceVerified === null ? null : (
          <Badge
            label={`${freshness.daysSinceVerified} days ago`}
            tone="neutral"
            accessibilityLabel={`Verified ${freshness.daysSinceVerified} days before now`}
          />
        )}
      </HStack>

      {freshness.isDowngradedByAge ? (
        <Text variant="callout" tone="warning">
          This was verified more than {FRESHNESS_WINDOW_DAYS} days ago, so we treat it as out of
          date even though it is recorded as verified. Check the issuer&apos;s terms before
          relying on it.
        </Text>
      ) : null}

      {children}
    </VStack>
  );
}

/**
 * The one document every rule on this card cites, or `null` when they differ.
 *
 * Most cards' rates come out of a single terms document, and describing it once per rule
 * would repeat the same paragraph — including the same warning — three or four times in a
 * row. Repetition that long stops being read, which is the opposite of what a caveat is
 * for. A single rule is left on the per-rule path: there is nothing to deduplicate, and
 * hoisting it would put the document above a heading it belongs under.
 */
function sharedSource(entries: readonly RuleProvenance[]): SourceSummary | null {
  const first = entries[0]?.source ?? null;
  if (first === null || entries.length < 2) return null;
  return entries.every((entry) => entry.source?.id === first.id) ? first : null;
}

/**
 * The weakest verification across the rules citing one document.
 *
 * Shown against the shared document, because a document is only as good as the
 * least-checked rate read out of it. Ordered by the same strength table the catalog
 * summary uses, so the two cannot disagree.
 */
function weakestAcross(entries: readonly RuleProvenance[]): {
  readonly verificationStatus: VerificationStatus;
  readonly lastVerifiedAt: string | null;
} {
  let weakest = entries[0];
  for (const entry of entries) {
    if (
      weakest === undefined ||
      VERIFICATION_STATUS_STRENGTH[entry.verificationStatus] <
        VERIFICATION_STATUS_STRENGTH[weakest.verificationStatus]
    ) {
      weakest = entry;
    }
  }
  return {
    // `entries` is never empty at the only call site, which is guarded by
    // `sharedSource` returning non-null.
    verificationStatus: weakest?.verificationStatus ?? 'unverified',
    lastVerifiedAt: weakest?.lastVerifiedAt ?? null,
  };
}

export function SourceSection({ ruleIds, asOf, testID }: SourceSectionProps) {
  const provenance = useRuleProvenance(ruleIds);
  const entries = provenance.data ?? [];
  const shared = sharedSource(entries);

  return (
    <Card testID={testID}>
      <VStack gap="md">
        <Text variant="title3" accessibilityRole="header">
          Where these rates came from
        </Text>

        {ruleIds.length === 0 ? (
          <Text variant="callout" tone="secondary">
            This card has no earn rates recorded, so there is nothing to cite.
          </Text>
        ) : provenance.isPending ? (
          <LoadingState label="Loading sources" testID="source-section-loading" />
        ) : provenance.isError ? (
          <ErrorNotice
            error={provenance.error}
            onRetry={() => void provenance.refetch()}
            testID="source-section-error"
          />
        ) : entries.length === 0 ? (
          <Text variant="callout" tone="secondary">
            No source documents are recorded for this card&apos;s rates yet.
          </Text>
        ) : shared !== null ? (
          <VStack gap="lg" testID="source-section-shared">
            <SourceDetails
              source={shared}
              {...weakestAcross(entries)}
              testID="source-detail-shared"
            />

            <VStack gap="md">
              <Divider />
              <Text variant="label" tone="secondary">
                Rates read from this document, and when each was last checked
              </Text>
              {entries.map((entry) => (
                <RuleFreshness key={entry.ruleId} entry={entry} asOf={asOf} />
              ))}
            </VStack>
          </VStack>
        ) : (
          <VStack gap="lg">
            {entries.map((entry, index) => (
              <VStack key={entry.ruleId} gap="sm">
                {index > 0 ? <Divider /> : null}
                <RuleFreshness entry={entry} asOf={asOf}>
                  <SourceDetails
                    source={entry.source}
                    verificationStatus={entry.verificationStatus}
                    lastVerifiedAt={entry.lastVerifiedAt}
                    testID={`source-detail-${entry.ruleId}`}
                  />
                </RuleFreshness>
              </VStack>
            ))}
          </VStack>
        )}

        <Text variant="footnote" tone="tertiary">
          WalletWise reads these documents by hand and records what they say. It never signs in
          to your bank, and it never fetches or scrapes an issuer&apos;s website. A rate we
          cannot cite is one we say we do not know.
        </Text>
      </VStack>
    </Card>
  );
}
