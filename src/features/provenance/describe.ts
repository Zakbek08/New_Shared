/**
 * Turns provenance records into sentences.
 *
 * Pure and exported separately from the screens, the same way `ruleFacts.ts` is, so
 * the exact wording can be asserted in a test without rendering React. Nothing here
 * derives a rate: every number it prints was read from a stored record.
 *
 * THE TONE IS DELIBERATE.
 * A provenance screen exists to let a sceptical user decide how much to trust a
 * figure, which it can only do by being blunt about weak evidence. "Invented
 * demonstration data" and "nobody has checked this against the issuer" are the
 * honest phrasings, and a softer one would defeat the purpose of showing the source
 * at all.
 */
import { SOURCE_DOCUMENT_TYPE_LABELS, VERIFICATION_STATUS_LABELS } from '@/domain/enums';
import { formatDay, formatRewardRate } from '@/lib/format';
import type { RewardType } from '@/types/database';

import type { SourceSummary, VerificationEvent } from './api/provenance';

/**
 * What the document is, who published it and when.
 *
 * Assembled from whichever fields are populated, in a fixed order, so two rules
 * citing the same document always read identically. `sources.publisher`,
 * `published_on` and `retrieved_on` are all nullable, and an unknown publisher is
 * stated as unknown rather than guessed from the label.
 */
export function describeSourceDocument(source: SourceSummary): string {
  const parts: string[] = [SOURCE_DOCUMENT_TYPE_LABELS[source.documentType]];

  parts.push(
    source.publisher === null ? 'Publisher not recorded' : `Published by ${source.publisher}`,
  );

  const published = formatDay(source.publishedOn);
  if (published !== null) parts.push(`dated ${published}`);

  const retrieved = formatDay(source.retrievedOn);
  // "Read on" rather than "retrieved": a person read this document. WalletWise
  // does not fetch issuer pages, and the wording should not suggest it does.
  if (retrieved !== null) parts.push(`read on ${retrieved}`);

  return `${parts.join(' · ')}.`;
}

/**
 * The caveat a document type carries, or `null` when it carries none.
 *
 * Exhaustive over `SourceDocumentType` with no `default`, so adding a document type
 * is a typecheck failure rather than a silently missing warning.
 */
export function describeSourceCaveat(source: SourceSummary): string | null {
  if (source.isFictional) {
    return 'This is invented demonstration data. It does not describe any real financial product, and no purchase decision should be made on it.';
  }

  switch (source.documentType) {
    case 'issuer_terms':
      return null;
    case 'issuer_marketing':
      return 'A marketing page is not the same as the terms it advertises. Where the two disagree, the terms are what binds the issuer.';
    case 'network_documentation':
      return 'The card network documents how a purchase is coded, not what your issuer pays for it.';
    case 'user_submission':
      return 'A cardholder typed this in. Nobody has checked it against the issuer, so treat it as a lead rather than a fact.';
    case 'fictional_demo_data':
      return 'This is invented demonstration data. It does not describe any real financial product.';
    case 'other':
      return 'The kind of document behind this rate was not recorded, so how much it is worth trusting is unclear.';
  }
}

/** Whether a source is strong enough that the UI should not flag it. */
export function isStrongSource(source: SourceSummary): boolean {
  return !source.isFictional && source.documentType === 'issuer_terms';
}

/**
 * One history entry as a sentence: what changed, and from what.
 *
 * The first entry on a rule has no `previousStatus`, which is a real distinction —
 * "loaded as verified" is not the same event as "changed from unverified to
 * verified" — so the two are phrased differently rather than folded together.
 */
export function describeVerificationEvent(event: VerificationEvent): string {
  const now = VERIFICATION_STATUS_LABELS[event.newStatus];

  if (event.previousStatus === null) {
    return `First recorded as: ${now.toLowerCase()}.`;
  }
  if (event.previousStatus === event.newStatus) {
    // A re-check that confirmed what was already there. Saying "changed from
    // verified to verified" would read like a bug.
    return `Checked again, still: ${now.toLowerCase()}.`;
  }

  const before = VERIFICATION_STATUS_LABELS[event.previousStatus];
  return `Changed from “${before}” to “${now}”.`;
}

/**
 * The rate as it stood at the time of an entry, or `null` when none was recorded.
 *
 * This is a *stored snapshot* being formatted, not a calculation: it is what makes
 * an old recommendation still explainable after the issuer changes a rate. The two
 * columns are added because a rule's earn is `base_rate + bonus_rate`, which is the
 * same sum the engine reads — not a new formula invented for this screen.
 */
export function describeRecordedRate(
  event: VerificationEvent,
  rewardType: RewardType | null,
): string | null {
  if (event.verifiedBaseRate === null && event.verifiedBonusRate === null) return null;
  if (rewardType === null) return null;

  const total = (event.verifiedBaseRate ?? 0) + (event.verifiedBonusRate ?? 0);
  return `Rate on file that day: ${formatRewardRate(total, rewardType)}`;
}
