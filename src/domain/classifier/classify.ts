/**
 * The merchant-category classifier.
 *
 * Pure and deterministic: same inputs, same answer. It reads a merchant catalog
 * passed in as an argument and performs no I/O — the caller fetches.
 *
 * PRECEDENCE, strongest evidence first:
 *   1. `exact_merchant` — we know this merchant and how it is usually coded
 *   2. `known_mcc`      — an MCC was supplied
 *   3. `user_selected`  — the user picked a category themselves
 *   4. `inferred`       — a partial name match against the catalog
 *   5. `unknown`        — no category could be determined
 *
 * A known merchant outranks the user's own selection deliberately. The issuer
 * applies its bonus based on how the merchant is *coded*, not on what the user
 * believes they are buying, so the merchant record is the better predictor. When
 * the two disagree the classifier says so rather than quietly picking one.
 */
import { categoriesForMcc } from '@/domain/categories';

import type { Classification, ClassifiableMerchant, ClassifierInput } from './types';

/**
 * Normalises a merchant name for comparison.
 *
 * Strips the seed data's `DEMO —` prefix, punctuation and duplicate whitespace, so
 * "DEMO — Greenleaf Market" and "greenleaf market" compare equal.
 */
export function normaliseMerchantName(value: string): string {
  return value
    .toLowerCase()
    .replace(/^demo\s*[—–-]\s*/u, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Tokens long enough to be worth matching on. */
function significantTokens(value: string): string[] {
  return normaliseMerchantName(value)
    .split(' ')
    .filter((token) => token.length >= 3);
}

/** Every name a merchant answers to, normalised. */
function namesOf(merchant: ClassifiableMerchant): string[] {
  return [merchant.displayName, ...merchant.aliases].map(normaliseMerchantName);
}

/**
 * An exact match on the merchant's name or any of its aliases.
 *
 * Deliberately strict: an exact match is the strongest evidence the classifier
 * has, and loosening it here would silently downgrade the quality of every
 * recommendation that depends on it.
 */
function findExactMerchant(
  merchants: readonly ClassifiableMerchant[],
  input: string,
): ClassifiableMerchant | null {
  const normalised = normaliseMerchantName(input);
  if (normalised.length === 0) return null;

  return merchants.find((merchant) => namesOf(merchant).includes(normalised)) ?? null;
}

/**
 * A partial match, used only as `inferred` evidence.
 *
 * Requires a shared token of at least three characters in one direction or the
 * other, so "greenleaf" finds "Greenleaf Market" but "a" finds nothing. Ties are
 * broken by the longest matched token, then by name, so the result is stable.
 */
function findPartialMerchant(
  merchants: readonly ClassifiableMerchant[],
  input: string,
): { merchant: ClassifiableMerchant; matchedLength: number } | null {
  const inputTokens = significantTokens(input);
  if (inputTokens.length === 0) return null;

  let best: { merchant: ClassifiableMerchant; matchedLength: number } | null = null;

  for (const merchant of merchants) {
    for (const name of namesOf(merchant)) {
      const nameTokens = name.split(' ').filter((token) => token.length >= 3);

      // Longest token the two share, in either direction.
      let matchedLength = 0;
      for (const token of inputTokens) {
        for (const nameToken of nameTokens) {
          if (
            (token === nameToken ||
              nameToken.startsWith(token) ||
              token.startsWith(nameToken)) &&
            Math.min(token.length, nameToken.length) > matchedLength
          ) {
            matchedLength = Math.min(token.length, nameToken.length);
          }
        }
      }

      if (matchedLength === 0) continue;

      if (
        best === null ||
        matchedLength > best.matchedLength ||
        (matchedLength === best.matchedLength &&
          merchant.displayName.localeCompare(best.merchant.displayName, 'en') < 0)
      ) {
        best = { merchant, matchedLength };
      }
    }
  }

  return best;
}

const UNKNOWN: Classification = {
  merchantId: null,
  resolvedMerchantName: null,
  categoryId: null,
  mcc: null,
  matchKind: 'unknown',
  confidence: 'low',
  hasAmbiguousCoding: false,
  alternativeCategoryIds: [],
  disagreesWithUserSelection: false,
};

/**
 * Classifies a purchase.
 *
 * Never throws, and never guesses a category it cannot support: `unknown` is a
 * real, expected outcome that the engine handles by falling back to
 * unconditional rules.
 */
export function classifyPurchase(
  input: ClassifierInput,
  merchants: readonly ClassifiableMerchant[],
): Classification {
  // Only consider merchants that could plausibly be this purchase. An
  // online-only merchant cannot be an in-store one, and a merchant in another
  // country is a different business with the same name.
  const plausible = merchants.filter((merchant) => {
    if (merchant.isOnlineOnly && input.channel === 'in_store') return false;
    return merchant.countryCode.toUpperCase() === input.countryCode.toUpperCase();
  });

  // --- 1. Exact merchant match --------------------------------------------
  const exact = findExactMerchant(plausible, input.merchantInput);
  if (exact !== null) {
    return fromMerchant(exact, input, 'exact_merchant');
  }

  // --- 2. A supplied MCC ---------------------------------------------------
  if (input.mcc !== null) {
    const candidates = categoriesForMcc(input.mcc);
    if (candidates.length > 0) {
      const [primary, ...alternatives] = candidates;
      return {
        merchantId: null,
        resolvedMerchantName: null,
        categoryId: primary?.id ?? null,
        mcc: input.mcc,
        matchKind: 'known_mcc',
        // More than one category for the same MCC is genuine ambiguity, not a
        // detail to paper over.
        confidence: alternatives.length > 0 ? 'medium' : 'high',
        hasAmbiguousCoding: alternatives.length > 0,
        alternativeCategoryIds: alternatives.map((category) => category.id),
        disagreesWithUserSelection:
          input.userSelectedCategoryId !== null && input.userSelectedCategoryId !== primary?.id,
      };
    }
  }

  // --- 3. The user's own selection ----------------------------------------
  if (input.userSelectedCategoryId !== null) {
    return {
      merchantId: null,
      resolvedMerchantName: null,
      categoryId: input.userSelectedCategoryId,
      mcc: null,
      matchKind: 'user_selected',
      // The most reliable option available to a user: it removes our guesswork,
      // though the issuer still decides the real coding.
      confidence: 'high',
      hasAmbiguousCoding: false,
      alternativeCategoryIds: [],
      disagreesWithUserSelection: false,
    };
  }

  // --- 4. A partial name match -------------------------------------------
  const partial = findPartialMerchant(plausible, input.merchantInput);
  if (partial !== null) {
    return fromMerchant(partial.merchant, input, 'inferred');
  }

  // --- 5. Nothing ---------------------------------------------------------
  return UNKNOWN;
}

/** Builds a classification from a matched merchant record. */
function fromMerchant(
  merchant: ClassifiableMerchant,
  input: ClassifierInput,
  matchKind: 'exact_merchant' | 'inferred',
): Classification {
  const disagrees =
    input.userSelectedCategoryId !== null &&
    merchant.primaryCategoryId !== null &&
    input.userSelectedCategoryId !== merchant.primaryCategoryId;

  // Confidence starts from how much we trust this merchant's coding, is capped at
  // medium for a merely partial name match, and drops to low whenever the
  // merchant is known to code unpredictably or contradicts what the user picked.
  let confidence = merchant.mccConfidence;
  if (matchKind === 'inferred' && confidence === 'high') confidence = 'medium';
  if (merchant.hasAmbiguousCoding) confidence = 'low';
  if (disagrees) confidence = 'low';

  return {
    merchantId: merchant.id,
    resolvedMerchantName: merchant.displayName,
    categoryId: merchant.primaryCategoryId,
    mcc: merchant.knownMcc ?? input.mcc,
    matchKind,
    confidence,
    // A user/merchant disagreement is exactly the amber-warning case.
    hasAmbiguousCoding: merchant.hasAmbiguousCoding || disagrees,
    alternativeCategoryIds:
      input.userSelectedCategoryId !== null && disagrees ? [input.userSelectedCategoryId] : [],
    disagreesWithUserSelection: disagrees,
  };
}
