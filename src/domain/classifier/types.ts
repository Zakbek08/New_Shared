/**
 * Contracts for the merchant-category classifier.
 *
 * The classifier's job is to decide *what kind of purchase this is*, and — just as
 * importantly — to report how sure it is. Category uncertainty is modelled here
 * rather than hidden, because the issuer, not WalletWise, decides the category a
 * merchant is coded under, and it routinely surprises people.
 */
import type { CategoryMatchKind, ConfidenceLevel } from '@/types/database';

/** A merchant from the catalog, in the shape the classifier needs. */
export interface ClassifiableMerchant {
  readonly id: string;
  readonly displayName: string;
  readonly aliases: readonly string[];
  readonly primaryCategoryId: string | null;
  readonly knownMcc: number | null;
  readonly mccConfidence: ConfidenceLevel;
  readonly hasAmbiguousCoding: boolean;
  readonly countryCode: string;
  readonly isOnlineOnly: boolean;
}

export interface ClassifierInput {
  /** Exactly what the user typed. Never normalised before it reaches here. */
  readonly merchantInput: string;
  /** A category the user picked from the quick buttons, if any. */
  readonly userSelectedCategoryId: string | null;
  /** An MCC, when the caller happens to know one. Usually null. */
  readonly mcc: number | null;
  readonly countryCode: string;
  readonly channel: 'online' | 'in_store';
}

export interface Classification {
  readonly merchantId: string | null;
  /** The catalog's name for the matched merchant, for display. */
  readonly resolvedMerchantName: string | null;
  readonly categoryId: string | null;
  readonly mcc: number | null;
  readonly matchKind: CategoryMatchKind;
  readonly confidence: ConfidenceLevel;
  /** Forces the amber warning: the engine attaches it to every candidate. */
  readonly hasAmbiguousCoding: boolean;
  /**
   * Other categories the evidence also supports.
   *
   * Populated when an MCC maps to more than one category — 4111 sits in both
   * general travel and transit. Callers must treat these as candidates, not as an
   * answer.
   */
  readonly alternativeCategoryIds: readonly string[];
  /**
   * True when the user picked a category the merchant's own coding contradicts.
   *
   * The classic case: a user taps "Grocery" at a warehouse club that codes as
   * general merchandise. Their intent is reasonable and the bonus still will not
   * apply, so this is exactly what the amber warning is for.
   */
  readonly disagreesWithUserSelection: boolean;
}
