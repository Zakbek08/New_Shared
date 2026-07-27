/**
 * One source document, described.
 *
 * Shared by the card-details and recommendation-details screens so a document reads
 * identically wherever it appears — a user who has learned what "Invented
 * demonstration data" means on one screen should not meet different wording for the
 * same thing on the other.
 *
 * THE LINK OPENS A BROWSER. IT DOES NOT FETCH ANYTHING.
 * WalletWise never requests an issuer's page itself: no scraping, no crawling, no
 * background refresh. The URL is handed to the operating system so the *user* can
 * read the terms and check the rate for themselves, which is the whole point of
 * showing a source. See SECURITY.md.
 */
import { Linking } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { VStack, HStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { formatVerifiedOn } from '@/lib/format';
import type { VerificationStatus } from '@/types/database';
import { VERIFICATION_STATUS_LABELS } from '@/domain/enums';

import type { SourceSummary } from '../api/provenance';
import { describeSourceCaveat, describeSourceDocument, isStrongSource } from '../describe';

export interface SourceDetailsProps {
  readonly source: SourceSummary | null;
  readonly verificationStatus: VerificationStatus;
  readonly lastVerifiedAt: string | null;
  readonly testID?: string;
}

/**
 * What to show when a rule cites nothing.
 *
 * This is a real state, not an error: a user-entered card has no issuer document
 * behind it, and `reward_rules.source_id` is nullable for exactly that case. Saying
 * so plainly is better than an empty region the user reads as a loading failure.
 */
function NoSource({ testID }: { readonly testID?: string }) {
  return (
    <VStack gap="xs" testID={testID}>
      <Badge label="No source on file" tone="uncertain" glyph="!" />
      <Text variant="callout" tone="secondary">
        No document is recorded behind this rate. That usually means it was entered by hand
        rather than read off an issuer&apos;s terms, so nothing here confirms it.
      </Text>
    </VStack>
  );
}

export function SourceDetails({
  source,
  verificationStatus,
  lastVerifiedAt,
  testID,
}: SourceDetailsProps) {
  if (source === null) {
    return <NoSource testID={testID} />;
  }

  const caveat = describeSourceCaveat(source);
  // Bound to a const so the null check below narrows it inside the press handler.
  // Reading `source.url` in the closure would not narrow, and narrowing it with a
  // cast is exactly what this codebase forbids.
  const { url } = source;

  return (
    <VStack gap="sm" testID={testID}>
      <Text variant="bodyStrong">{source.label}</Text>

      <HStack gap="sm" wrap align="flex-start">
        <Badge
          label={VERIFICATION_STATUS_LABELS[verificationStatus]}
          tone={verificationStatus === 'verified' ? 'best' : 'uncertain'}
          glyph={verificationStatus === 'verified' ? '✓' : '!'}
        />
        <Badge label={formatVerifiedOn(lastVerifiedAt)} tone="neutral" />
        {source.isFictional ? <Badge label="Demo data" tone="accent" glyph="i" /> : null}
        {isStrongSource(source) ? null : <Badge label="Weaker evidence" tone="uncertain" />}
      </HStack>

      <Text variant="callout" tone="secondary">
        {describeSourceDocument(source)}
      </Text>

      {source.notes === null ? null : (
        <Text variant="footnote" tone="tertiary">
          {source.notes}
        </Text>
      )}

      {caveat === null ? null : (
        <Text variant="callout" tone="warning">
          {caveat}
        </Text>
      )}

      {url === null ? (
        <Text variant="footnote" tone="tertiary">
          No public link is recorded for this document.
        </Text>
      ) : (
        <VStack gap="xs">
          <Button
            label="Open the source document"
            variant="secondary"
            onPress={() => {
              // Fire-and-forget on purpose. If the platform refuses the URL there is
              // nothing useful to tell the user beyond what their browser will say,
              // and a rejected promise here must not take the screen down.
              void Linking.openURL(url).catch(() => undefined);
            }}
            accessibilityHint="Opens the issuer’s page in your browser. WalletWise does not read it for you."
            testID={testID === undefined ? undefined : `${testID}-open`}
          />
          <Text variant="footnote" tone="tertiary">
            {url}
          </Text>
        </VStack>
      )}
    </VStack>
  );
}
