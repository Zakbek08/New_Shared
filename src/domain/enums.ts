/**
 * Runtime companions to the compile-time enums in `src/types/database.ts`.
 *
 * Zod schemas and UI pickers need arrays of values, which types alone cannot
 * provide. Every array below is built through `enumValues`, which fails to
 * compile unless the tuple covers the union exactly — so adding a value to a
 * database enum without updating this file is a typecheck error rather than a
 * runtime surprise.
 */
import type {
  AppRole,
  CapPeriod,
  CardKind,
  CardNetwork,
  CategoryMatchKind,
  ConfidenceLevel,
  EnrollmentStatus,
  OfferStatus,
  PaymentMethod,
  PurchaseChannel,
  RewardType,
  RewardUnit,
  RuleKind,
  SourceDocumentType,
  VerificationStatus,
} from '@/types/database';

/**
 * Builds an exhaustive tuple of a string union.
 *
 * `[Union] extends [Values[number]]` is wrapped in a tuple deliberately: a bare
 * `Union extends ...` would distribute over the union and check each member
 * independently, which passes for any non-empty tuple and defeats the point.
 */
function enumValues<Union extends string>() {
  return <const Values extends readonly [Union, ...Union[]]>(
    values: Values & ([Union] extends [Values[number]] ? unknown : never),
  ): Values => values;
}

export const APP_ROLES = enumValues<AppRole>()(['member', 'catalog_editor', 'admin']);

export const CARD_NETWORKS = enumValues<CardNetwork>()([
  'visa',
  'mastercard',
  'amex',
  'discover',
  'other',
]);

export const CARD_KINDS = enumValues<CardKind>()([
  'personal_credit',
  'business_credit',
  'charge',
  'store_credit',
  'debit',
]);

export const REWARD_UNITS = enumValues<RewardUnit>()(['usd', 'points', 'miles']);

export const REWARD_TYPES = enumValues<RewardType>()([
  'cash_back_percent',
  'points_per_dollar',
  'miles_per_dollar',
  'statement_credit',
  'fixed_amount',
]);

export const RULE_KINDS = enumValues<RuleKind>()([
  'base',
  'category_bonus',
  'rotating_category',
  'intro_bonus',
  'online_bonus',
  'mobile_wallet_bonus',
  'travel_portal_bonus',
  'merchant_specific',
  'spend_threshold_bonus',
  'statement_credit',
]);

export const CAP_PERIODS = enumValues<CapPeriod>()([
  'none',
  'monthly',
  'quarterly',
  'semi_annual',
  'calendar_year',
  'cardmember_year',
  'lifetime',
  'promotional_window',
]);

export const PURCHASE_CHANNELS = enumValues<PurchaseChannel>()([
  'online',
  'in_store',
  'either',
]);

export const PAYMENT_METHODS = enumValues<PaymentMethod>()([
  'physical_card',
  'contactless_card',
  'apple_pay',
  'google_pay',
  'samsung_pay',
  'card_on_file',
  'manual_entry',
  'issuer_travel_portal',
  'other',
]);

export const VERIFICATION_STATUSES = enumValues<VerificationStatus>()([
  'unverified',
  'user_reported',
  'verified',
  'stale',
  'disputed',
  'retired',
]);

export const CONFIDENCE_LEVELS = enumValues<ConfidenceLevel>()(['high', 'medium', 'low']);

export const CATEGORY_MATCH_KINDS = enumValues<CategoryMatchKind>()([
  'exact_merchant',
  'known_mcc',
  'user_selected',
  'inferred',
  'unknown',
]);

export const OFFER_STATUSES = enumValues<OfferStatus>()([
  'available',
  'enrolled',
  'redeemed',
  'expired',
  'declined',
]);

export const ENROLLMENT_STATUSES = enumValues<EnrollmentStatus>()([
  'not_enrolled',
  'enrolled',
  'ineligible',
  'unknown',
]);

/**
 * The payment methods that count as a mobile wallet. Mobile-wallet bonus rules
 * are matched against exactly this set — a contactless tap of the physical card
 * is deliberately not a mobile wallet.
 */
export const MOBILE_WALLET_PAYMENT_METHODS: readonly PaymentMethod[] = [
  'apple_pay',
  'google_pay',
  'samsung_pay',
];

// ---------------------------------------------------------------------------
// Display labels
// ---------------------------------------------------------------------------

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  physical_card: 'Physical card (swipe or insert)',
  contactless_card: 'Contactless card tap',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
  samsung_pay: 'Samsung Pay',
  card_on_file: 'Saved card on file',
  manual_entry: 'Typed card details',
  issuer_travel_portal: 'Issuer travel portal',
  other: 'Other',
};

export const PURCHASE_CHANNEL_LABELS: Record<PurchaseChannel, string> = {
  online: 'Online',
  in_store: 'In store',
  either: 'Either',
};

/**
 * Reward types in the user's words.
 *
 * Phrased as what the user would read on the offer they are copying across, not as
 * the enum member: nobody sees "points_per_dollar" on a bank's website.
 */
export const REWARD_TYPE_LABELS: Record<RewardType, string> = {
  cash_back_percent: 'Percent cash back',
  points_per_dollar: 'Points per dollar',
  miles_per_dollar: 'Miles per dollar',
  statement_credit: 'Statement credit',
  fixed_amount: 'Fixed amount back',
};

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  unverified: 'Not yet verified',
  user_reported: 'Reported by a cardholder',
  verified: 'Verified against a source',
  stale: 'Source may be out of date',
  disputed: 'Disputed',
  retired: 'No longer offered',
};

/**
 * How the category was arrived at, in the user's words.
 *
 * Deliberately blunt about the weaker kinds: "guessed from the name" is what
 * `inferred` means, and dressing it up would misrepresent how much to trust it.
 */
export const CATEGORY_MATCH_KIND_LABELS: Record<CategoryMatchKind, string> = {
  exact_merchant: 'Matched a known merchant',
  known_mcc: 'From the merchant category code',
  user_selected: 'You chose this category',
  inferred: 'Guessed from the merchant name',
  unknown: 'Category unknown',
};

export const CAP_PERIOD_LABELS: Record<CapPeriod, string> = {
  none: 'No cap',
  monthly: 'per month',
  quarterly: 'per quarter',
  semi_annual: 'per half year',
  calendar_year: 'per calendar year',
  cardmember_year: 'per cardmember year',
  lifetime: 'lifetime',
  promotional_window: 'during the promotion',
};

/**
 * What kind of document a rate was read out of.
 *
 * Ordered in the copy from strongest evidence to weakest, and phrased so the
 * difference matters to the reader: an issuer's own terms bind the issuer, its
 * marketing page does not, and a figure someone typed in binds nobody. The UI
 * shows this beside every rate so "verified" cannot be read as "verified against
 * something authoritative" when it was not.
 */
export const SOURCE_DOCUMENT_TYPE_LABELS: Record<SourceDocumentType, string> = {
  issuer_terms: 'Issuer’s own terms',
  issuer_marketing: 'Issuer marketing page',
  network_documentation: 'Card network documentation',
  user_submission: 'Typed in by a cardholder',
  fictional_demo_data: 'Invented demonstration data',
  other: 'Other document',
};
