/**
 * Assembles the "everything we hold about you" export document.
 *
 * WHY THIS IS IN THE DOMAIN LAYER
 * An export is a promise: *this* is all of it. Whether that promise is kept is a
 * question about a data structure, not about the network, so it belongs
 * somewhere a test can interrogate it exhaustively. Fetching stays in
 * `src/features/account/api`; this module turns rows into the document, and
 * `SECTION_KEYS` below is the list a reviewer checks against the schema.
 *
 * WHAT THE DOCUMENT DELIBERATELY OMITS
 * Nothing the user owns — but two things are worth stating in the file itself
 * rather than only here:
 *
 *   * `last_four_cipher` is exported as an opaque marker, not as digits. The
 *     ciphertext is meaningless without the device key, and writing decrypted
 *     digits into a file that leaves the device would undo the entire reason the
 *     column is encrypted. The user already knows their own last four; an export
 *     is not where they need to learn it.
 *   * `role` is included but read-only, because it explains what the account can
 *     do. It is not a field the client can write (see users_update_self).
 *
 * There is no card number, CVV, PIN or bank credential to omit, because no such
 * value exists anywhere in this system.
 */
import type {
  AuditLogRow,
  CardProductRow,
  PurchaseQueryRow,
  RecommendationCandidateRow,
  RecommendationRow,
  RewardRuleConditionRow,
  RewardRuleRow,
  RewardUsageRow,
  UserCardRow,
  UserOfferRow,
  UserRewardPreferenceRow,
  UserRow,
  UserRuleEnrollmentRow,
} from '@/types/database';

/** Bumped when the document's shape changes, so an old file is still readable. */
export const EXPORT_FORMAT_VERSION = '1';

/**
 * What replaces the encrypted last four in the export.
 *
 * A marker rather than an omission: "we hold something here, and it is not
 * readable in this file" is more honest than a silently absent field.
 */
export const CIPHERTEXT_PLACEHOLDER = '[encrypted on your device; not included]';

/**
 * Every section the export contains, in order.
 *
 * Exported so `exportDocument.test.ts` can assert that each user-owned table has
 * a section. That test is the thing that makes the completeness claim checkable
 * instead of aspirational — if a migration adds a user-owned table and nobody
 * adds it here, the test names the gap.
 */
export const SECTION_KEYS = [
  'profile',
  'cards',
  'valuations',
  'enrollments',
  'offers',
  'rewardUsage',
  'purchaseQueries',
  'recommendations',
  'recommendationCandidates',
  'customCardProducts',
  'customRewardRules',
  'customRuleConditions',
  'auditTrail',
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

/** A card as exported: every stored field, with the ciphertext replaced. */
export type ExportedCard = Omit<UserCardRow, 'last_four_cipher' | 'last_four_key_id'> & {
  readonly last_four_cipher: string | null;
  readonly last_four_key_id: string | null;
};

export interface AccountExportInput {
  readonly profile: UserRow;
  readonly cards: readonly UserCardRow[];
  readonly valuations: readonly UserRewardPreferenceRow[];
  readonly enrollments: readonly UserRuleEnrollmentRow[];
  readonly offers: readonly UserOfferRow[];
  readonly rewardUsage: readonly RewardUsageRow[];
  readonly purchaseQueries: readonly PurchaseQueryRow[];
  readonly recommendations: readonly RecommendationRow[];
  /**
   * The per-card breakdown behind each recommendation. Owned transitively rather
   * than by a `user_id` column, which is exactly why it is easy to forget and why
   * the test enumerates tables from the migrations instead of from this list.
   */
  readonly recommendationCandidates: readonly RecommendationCandidateRow[];
  /**
   * Card products the user defined themselves, and the rules they wrote on them.
   *
   * These live in the catalog tables alongside shared rows, separated by
   * `is_user_defined` and `created_by`. They are the user's own work — a rate they
   * typed in for a card the catalog does not know — so an export that left them
   * out would be missing the data the user actually authored.
   */
  readonly customCardProducts: readonly CardProductRow[];
  readonly customRewardRules: readonly RewardRuleRow[];
  readonly customRuleConditions: readonly RewardRuleConditionRow[];
  /** Audit rows the user is party to. Usually empty for a member. */
  readonly auditTrail: readonly AuditLogRow[];
}

export interface AccountExportDocument {
  readonly formatVersion: string;
  /** When the export was taken. Supplied by the caller — the domain has no clock. */
  readonly exportedAt: string;
  readonly application: 'WalletWise';
  /**
   * Stated in the file because a file outlives the screen that produced it. Someone
   * reading this JSON in a year should not have to guess what the numbers meant.
   */
  readonly notes: readonly string[];
  readonly profile: UserRow;
  readonly cards: readonly ExportedCard[];
  readonly valuations: readonly UserRewardPreferenceRow[];
  readonly enrollments: readonly UserRuleEnrollmentRow[];
  readonly offers: readonly UserOfferRow[];
  readonly rewardUsage: readonly RewardUsageRow[];
  readonly purchaseQueries: readonly PurchaseQueryRow[];
  readonly recommendations: readonly RecommendationRow[];
  readonly recommendationCandidates: readonly RecommendationCandidateRow[];
  readonly customCardProducts: readonly CardProductRow[];
  readonly customRewardRules: readonly RewardRuleRow[];
  readonly customRuleConditions: readonly RewardRuleConditionRow[];
  readonly auditTrail: readonly AuditLogRow[];
  readonly counts: Readonly<Record<SectionKey, number>>;
}

const NOTES: readonly string[] = [
  'This file contains everything WalletWise stores about your account.',
  `Stored card digits appear as "${CIPHERTEXT_PLACEHOLDER}". They are encrypted with a key that never leaves your device, so they cannot be included in readable form here.`,
  'WalletWise never stores a full card number, security code, PIN or bank password, so none appear in this file.',
  'Reward figures reflect the rates recorded in the catalog at the time each recommendation was made. They are informational and are not an offer from any issuer.',
  'Amounts are in US dollars. Timestamps are ISO 8601 in UTC.',
];

/**
 * Replaces the stored ciphertext with a marker.
 *
 * The key id goes too: on its own it is only a pointer to a key, but it is a
 * fact about the device rather than about the card, and it has no meaning to the
 * person reading the file.
 */
function exportCard(card: UserCardRow): ExportedCard {
  return {
    ...card,
    last_four_cipher: card.last_four_cipher === null ? null : CIPHERTEXT_PLACEHOLDER,
    last_four_key_id: card.last_four_key_id === null ? null : CIPHERTEXT_PLACEHOLDER,
  };
}

/**
 * Builds the export document.
 *
 * `exportedAt` is a parameter for the same reason `asOf` is everywhere else in
 * the domain: a function that reads the clock cannot be tested for the value it
 * produces.
 */
export function buildAccountExport(
  input: AccountExportInput,
  exportedAt: Date,
): AccountExportDocument {
  const cards = input.cards.map(exportCard);

  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: exportedAt.toISOString(),
    application: 'WalletWise',
    notes: NOTES,
    profile: input.profile,
    cards,
    valuations: input.valuations,
    enrollments: input.enrollments,
    offers: input.offers,
    rewardUsage: input.rewardUsage,
    purchaseQueries: input.purchaseQueries,
    recommendations: input.recommendations,
    recommendationCandidates: input.recommendationCandidates,
    customCardProducts: input.customCardProducts,
    customRewardRules: input.customRewardRules,
    customRuleConditions: input.customRuleConditions,
    auditTrail: input.auditTrail,
    counts: {
      profile: 1,
      cards: cards.length,
      valuations: input.valuations.length,
      enrollments: input.enrollments.length,
      offers: input.offers.length,
      rewardUsage: input.rewardUsage.length,
      purchaseQueries: input.purchaseQueries.length,
      recommendations: input.recommendations.length,
      recommendationCandidates: input.recommendationCandidates.length,
      customCardProducts: input.customCardProducts.length,
      customRewardRules: input.customRewardRules.length,
      customRuleConditions: input.customRuleConditions.length,
      auditTrail: input.auditTrail.length,
    },
  };
}

/** Total rows in the document, for the "you are downloading N records" line. */
export function totalRecords(document: AccountExportDocument): number {
  return SECTION_KEYS.reduce((total, key) => total + document.counts[key], 0);
}

/**
 * Serialises the document for writing to a file.
 *
 * Indented, because the point of an export is that a person can read it.
 */
export function serialiseAccountExport(document: AccountExportDocument): string {
  return JSON.stringify(document, null, 2);
}

/** A stable, sortable filename. Colons are stripped for filesystems that dislike them. */
export function exportFileName(exportedAt: Date): string {
  const stamp = exportedAt.toISOString().replace(/[:.]/g, '-');
  return `walletwise-export-${stamp}.json`;
}
