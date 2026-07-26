/**
 * Typed Supabase schema for WalletWise.
 *
 * This file mirrors `supabase/migrations/` by hand. Once a Supabase project
 * exists it should be replaced by codegen so drift is impossible:
 *
 *   npm run db:types
 *
 * Until then the shape below is the contract, and `npm run typecheck` is what
 * keeps callers honest.
 *
 * SECURITY: there is deliberately no field anywhere in this schema capable of
 * holding a full card number, CVV/CVC, PIN, bank password or security answer.
 * If you find yourself wanting to add one, read SECURITY.md instead.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// ---------------------------------------------------------------------------
// Enumerated types (mirrors 20260701000100_extensions_and_enums.sql)
// ---------------------------------------------------------------------------

export type AppRole = 'member' | 'catalog_editor' | 'admin';

export type CardNetwork = 'visa' | 'mastercard' | 'amex' | 'discover' | 'other';

export type CardKind =
  'personal_credit' | 'business_credit' | 'charge' | 'store_credit' | 'debit';

export type RewardUnit = 'usd' | 'points' | 'miles';

export type RewardType =
  | 'cash_back_percent'
  | 'points_per_dollar'
  | 'miles_per_dollar'
  | 'statement_credit'
  | 'fixed_amount';

export type RuleKind =
  | 'base'
  | 'category_bonus'
  | 'rotating_category'
  | 'intro_bonus'
  | 'online_bonus'
  | 'mobile_wallet_bonus'
  | 'travel_portal_bonus'
  | 'merchant_specific'
  | 'spend_threshold_bonus'
  | 'statement_credit';

export type CapPeriod =
  | 'none'
  | 'monthly'
  | 'quarterly'
  | 'semi_annual'
  | 'calendar_year'
  | 'cardmember_year'
  | 'lifetime'
  | 'promotional_window';

export type PurchaseChannel = 'online' | 'in_store' | 'either';

export type PaymentMethod =
  | 'physical_card'
  | 'contactless_card'
  | 'apple_pay'
  | 'google_pay'
  | 'samsung_pay'
  | 'card_on_file'
  | 'manual_entry'
  | 'issuer_travel_portal'
  | 'other';

export type VerificationStatus =
  'unverified' | 'user_reported' | 'verified' | 'stale' | 'disputed' | 'retired';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type CategoryMatchKind =
  'exact_merchant' | 'known_mcc' | 'user_selected' | 'inferred' | 'unknown';

export type OfferStatus = 'available' | 'enrolled' | 'redeemed' | 'expired' | 'declined';

export type EnrollmentStatus = 'not_enrolled' | 'enrolled' | 'ineligible' | 'unknown';

export type AuditAction =
  | 'insert'
  | 'update'
  | 'delete'
  | 'verify'
  | 'enroll'
  | 'unenroll'
  | 'export'
  | 'admin_override';

export type CapAppliesTo = 'spend' | 'reward';

export type SourceDocumentType =
  | 'issuer_terms'
  | 'issuer_marketing'
  | 'network_documentation'
  | 'user_submission'
  | 'fictional_demo_data'
  | 'other';

/** Postgres `int4range` serialised over PostgREST, e.g. `"[5411,5412)"`. */
export type Int4RangeText = string;

/** Postgres `timestamptz` serialised as an ISO-8601 string. */
export type IsoTimestamp = string;

/** Postgres `date` serialised as `YYYY-MM-DD`. */
export type IsoDate = string;

// ---------------------------------------------------------------------------
// Row / Insert / Update helpers
// ---------------------------------------------------------------------------

/**
 * Builds the Insert shape for a table: `Row` minus the columns the database
 * fills in, with `Optional` columns made optional.
 */
type Insertable<Row, Generated extends keyof Row, Optional extends keyof Row = never> = Omit<
  Row,
  Generated | Optional
> &
  Partial<Pick<Row, Generated | Optional>>;

/** Every column optional — PostgREST PATCH semantics. */
type Updatable<Row> = Partial<Row>;

/** Columns present on every table that carries the standard timestamps. */
type Timestamps = 'created_at' | 'updated_at';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type SourceRow = {
  id: string;
  label: string;
  url: string | null;
  publisher: string | null;
  document_type: SourceDocumentType;
  published_on: IsoDate | null;
  retrieved_on: IsoDate | null;
  notes: string | null;
  is_fictional: boolean;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
};

export type IssuerRow = {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  accent_color: string | null;
  country_code: string;
  is_fictional: boolean;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
};

export type RewardProgramRow = {
  id: string;
  slug: string;
  name: string;
  issuer_id: string | null;
  unit: RewardUnit;
  /** USD cents per unit. 1.0 = one cent per point. */
  default_cents_per_unit: number;
  transfer_partners_count: number | null;
  notes: string | null;
  is_fictional: boolean;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
};

export type CardProductRow = {
  id: string;
  slug: string;
  /** Set on catalog rows. Always `null` on a user-defined row. */
  issuer_id: string | null;
  /** Set on a user-defined row. Always `null` on a catalog row. */
  custom_issuer_name: string | null;
  reward_program_id: string | null;
  name: string;
  card_kind: CardKind;
  network: CardNetwork;
  annual_fee_usd: number;
  /** Percentage, e.g. 3 for a 3% foreign transaction fee. */
  foreign_transaction_fee_percent: number;
  supported_country_codes: string[];
  summary: string | null;
  is_user_defined: boolean;
  created_by: string | null;
  is_fictional: boolean;
  is_active: boolean;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
};

export type MerchantCategoryRow = {
  id: string;
  slug: string;
  display_name: string;
  /** Indicative only. Issuer coding is authoritative and may differ. */
  mcc_ranges: Int4RangeText[];
  display_order: number;
  icon_name: string | null;
  parent_id: string | null;
  is_active: boolean;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
};

export type MerchantRow = {
  id: string;
  slug: string;
  display_name: string;
  aliases: string[];
  primary_category_id: string | null;
  known_mcc: number | null;
  mcc_confidence: ConfidenceLevel;
  country_code: string;
  has_ambiguous_coding: boolean;
  is_online_only: boolean;
  source_id: string | null;
  is_fictional: boolean;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
};

export type RewardRuleRow = {
  id: string;
  card_product_id: string;
  reward_program_id: string | null;
  label: string;
  kind: RuleKind;
  reward_type: RewardType;
  reward_unit: RewardUnit;
  /** Percent for `cash_back_percent`, multiplier for points/miles. */
  base_rate: number;
  bonus_rate: number;
  fixed_amount_usd: number | null;
  priority: number;
  stack_group: string;
  is_stackable: boolean;
  cap_amount: number | null;
  cap_applies_to: CapAppliesTo;
  cap_period: CapPeriod;
  /** `null` means "fall through to this card's base rule". */
  post_cap_rate: number | null;
  starts_at: IsoTimestamp | null;
  ends_at: IsoTimestamp | null;
  requires_enrollment: boolean;
  enrollment_url: string | null;
  enrollment_notes: string | null;
  spend_threshold_usd: number | null;
  source_id: string | null;
  last_verified_at: IsoTimestamp | null;
  verification_status: VerificationStatus;
  is_active: boolean;
  notes: string | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
};

export type RewardRuleConditionRow = {
  id: string;
  reward_rule_id: string;
  merchant_category_id: string | null;
  included_category_ids: string[];
  excluded_category_ids: string[];
  included_mccs: number[];
  included_mcc_ranges: Int4RangeText[];
  excluded_mccs: number[];
  included_merchant_ids: string[];
  excluded_merchant_ids: string[];
  included_country_codes: string[];
  excluded_country_codes: string[];
  included_currency_codes: string[];
  channel: PurchaseChannel;
  included_payment_methods: PaymentMethod[];
  starts_at: IsoTimestamp | null;
  ends_at: IsoTimestamp | null;
  min_amount_usd: number | null;
  max_amount_usd: number | null;
  notes: string | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
};

export type VerificationHistoryRow = {
  id: string;
  reward_rule_id: string;
  source_id: string | null;
  previous_status: VerificationStatus | null;
  new_status: VerificationStatus;
  verified_base_rate: number | null;
  verified_bonus_rate: number | null;
  verified_at: IsoTimestamp;
  verified_by: string | null;
  note: string | null;
  created_at: IsoTimestamp;
};

export type UserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: AppRole;
  home_country_code: string;
  home_currency_code: string;
  preferred_locale: string;
  disclaimers_accepted_version: string | null;
  disclaimers_accepted_at: IsoTimestamp | null;
  onboarding_completed_at: IsoTimestamp | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
};

export type UserCardRow = {
  id: string;
  user_id: string;
  card_product_id: string;
  nickname: string | null;
  /**
   * Device-encrypted last four digits (base64 AES-GCM ciphertext). Optional.
   * NEVER a full card number, and never plaintext.
   */
  last_four_cipher: string | null;
  last_four_key_id: string | null;
  display_order: number;
  is_archived: boolean;
  is_excluded_from_recommendations: boolean;
  account_opened_on: IsoDate | null;
  is_preferred: boolean;
  notes: string | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
};

export type UserRewardPreferenceRow = {
  id: string;
  user_id: string;
  /** `null` = the user's global default for `unit`. */
  reward_program_id: string | null;
  unit: RewardUnit;
  cents_per_unit: number;
  prefers_cash_back_only: boolean;
  minimum_switch_benefit_usd: number;
  notes: string | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
};

export type UserRuleEnrollmentRow = {
  id: string;
  user_id: string;
  user_card_id: string;
  reward_rule_id: string;
  status: EnrollmentStatus;
  enrolled_at: IsoTimestamp | null;
  expires_at: IsoTimestamp | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
};

export type UserOfferRow = {
  id: string;
  user_id: string;
  user_card_id: string;
  merchant_id: string | null;
  merchant_label: string | null;
  title: string;
  description: string | null;
  reward_type: RewardType;
  reward_unit: RewardUnit;
  rate: number;
  fixed_amount_usd: number | null;
  minimum_spend_usd: number;
  max_benefit_usd: number | null;
  status: OfferStatus;
  channel: PurchaseChannel;
  starts_at: IsoTimestamp | null;
  ends_at: IsoTimestamp | null;
  enrolled_at: IsoTimestamp | null;
  redeemed_at: IsoTimestamp | null;
  is_user_entered: boolean;
  source_id: string | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
};

export type RewardUsageRow = {
  id: string;
  user_id: string;
  user_card_id: string;
  reward_rule_id: string;
  period_start: IsoTimestamp;
  period_end: IsoTimestamp;
  cap_period: CapPeriod;
  qualifying_spend_usd: number;
  accrued_reward_units: number;
  accrued_reward_usd: number;
  is_user_adjusted: boolean;
  last_recorded_at: IsoTimestamp;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
};

export type PurchaseQueryRow = {
  id: string;
  user_id: string;
  merchant_input: string;
  amount_usd: number;
  currency_code: string;
  country_code: string;
  channel: PurchaseChannel;
  payment_method: PaymentMethod;
  notes: string | null;
  resolved_merchant_id: string | null;
  resolved_category_id: string | null;
  resolved_mcc: number | null;
  category_match_kind: CategoryMatchKind;
  category_confidence: ConfidenceLevel;
  has_coding_warning: boolean;
  raw_natural_language_input: string | null;
  created_at: IsoTimestamp;
};

export type RecommendationRow = {
  id: string;
  user_id: string;
  purchase_query_id: string;
  recommended_user_card_id: string | null;
  runner_up_user_card_id: string | null;
  estimated_value_usd: number | null;
  estimated_reward_units: number | null;
  reward_unit: RewardUnit | null;
  advantage_over_runner_up_usd: number | null;
  confidence: ConfidenceLevel;
  explanation: string | null;
  warnings: string[];
  engine_version: string;
  candidate_count: number;
  eligible_count: number;
  computed_at: IsoTimestamp;
  was_accepted: boolean | null;
  accepted_at: IsoTimestamp | null;
  created_at: IsoTimestamp;
};

export type RecommendationCandidateRow = {
  id: string;
  recommendation_id: string;
  user_card_id: string;
  rank: number;
  is_eligible: boolean;
  applied_reward_rule_id: string | null;
  applied_user_offer_id: string | null;
  effective_rate: number | null;
  reward_unit: RewardUnit | null;
  gross_reward_units: number;
  capped_spend_usd: number | null;
  uncapped_spend_usd: number | null;
  offer_value_usd: number;
  statement_credit_usd: number;
  foreign_transaction_fee_usd: number;
  applied_cents_per_unit: number | null;
  net_value_usd: number;
  cap_amount_usd: number | null;
  cap_remaining_usd: number | null;
  cap_period: CapPeriod | null;
  confidence: ConfidenceLevel;
  reason: string | null;
  ineligibility_code: string | null;
  source_verified_at: IsoTimestamp | null;
  verification_status: VerificationStatus | null;
  warnings: string[];
  created_at: IsoTimestamp;
};

export type AuditLogRow = {
  id: number;
  actor_id: string | null;
  actor_role: AppRole | null;
  subject_user_id: string | null;
  action: AuditAction;
  table_name: string;
  record_id: string | null;
  /** Column NAMES only — never values. See SECURITY.md. */
  changed_columns: string[];
  context: Json;
  occurred_at: IsoTimestamp;
};

// ---------------------------------------------------------------------------
// Database contract consumed by `createClient<Database>()`
// ---------------------------------------------------------------------------

interface TableShape<Row, Insert, Update> {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
}

export interface Database {
  public: {
    Tables: {
      sources: TableShape<
        SourceRow,
        Insertable<
          SourceRow,
          'id' | Timestamps,
          | 'url'
          | 'publisher'
          | 'document_type'
          | 'published_on'
          | 'retrieved_on'
          | 'notes'
          | 'is_fictional'
        >,
        Updatable<SourceRow>
      >;
      issuers: TableShape<
        IssuerRow,
        Insertable<
          IssuerRow,
          'id' | Timestamps,
          'short_name' | 'accent_color' | 'country_code' | 'is_fictional'
        >,
        Updatable<IssuerRow>
      >;
      reward_programs: TableShape<
        RewardProgramRow,
        Insertable<
          RewardProgramRow,
          'id' | Timestamps,
          | 'issuer_id'
          | 'default_cents_per_unit'
          | 'transfer_partners_count'
          | 'notes'
          | 'is_fictional'
        >,
        Updatable<RewardProgramRow>
      >;
      card_products: TableShape<
        CardProductRow,
        Insertable<
          CardProductRow,
          'id' | Timestamps,
          | 'issuer_id'
          | 'custom_issuer_name'
          | 'reward_program_id'
          | 'card_kind'
          | 'network'
          | 'annual_fee_usd'
          | 'foreign_transaction_fee_percent'
          | 'supported_country_codes'
          | 'summary'
          | 'is_user_defined'
          | 'created_by'
          | 'is_fictional'
          | 'is_active'
        >,
        Updatable<CardProductRow>
      >;
      merchant_categories: TableShape<
        MerchantCategoryRow,
        Insertable<
          MerchantCategoryRow,
          'id' | Timestamps,
          'mcc_ranges' | 'display_order' | 'icon_name' | 'parent_id' | 'is_active'
        >,
        Updatable<MerchantCategoryRow>
      >;
      merchants: TableShape<
        MerchantRow,
        Insertable<
          MerchantRow,
          'id' | Timestamps,
          | 'aliases'
          | 'primary_category_id'
          | 'known_mcc'
          | 'mcc_confidence'
          | 'country_code'
          | 'has_ambiguous_coding'
          | 'is_online_only'
          | 'source_id'
          | 'is_fictional'
        >,
        Updatable<MerchantRow>
      >;
      reward_rules: TableShape<
        RewardRuleRow,
        Insertable<
          RewardRuleRow,
          'id' | Timestamps,
          | 'reward_program_id'
          | 'base_rate'
          | 'bonus_rate'
          | 'fixed_amount_usd'
          | 'priority'
          | 'stack_group'
          | 'is_stackable'
          | 'cap_amount'
          | 'cap_applies_to'
          | 'cap_period'
          | 'post_cap_rate'
          | 'starts_at'
          | 'ends_at'
          | 'requires_enrollment'
          | 'enrollment_url'
          | 'enrollment_notes'
          | 'spend_threshold_usd'
          | 'source_id'
          | 'last_verified_at'
          | 'verification_status'
          | 'is_active'
          | 'notes'
        >,
        Updatable<RewardRuleRow>
      >;
      reward_rule_conditions: TableShape<
        RewardRuleConditionRow,
        Insertable<
          RewardRuleConditionRow,
          'id' | Timestamps,
          | 'merchant_category_id'
          | 'included_category_ids'
          | 'excluded_category_ids'
          | 'included_mccs'
          | 'included_mcc_ranges'
          | 'excluded_mccs'
          | 'included_merchant_ids'
          | 'excluded_merchant_ids'
          | 'included_country_codes'
          | 'excluded_country_codes'
          | 'included_currency_codes'
          | 'channel'
          | 'included_payment_methods'
          | 'starts_at'
          | 'ends_at'
          | 'min_amount_usd'
          | 'max_amount_usd'
          | 'notes'
        >,
        Updatable<RewardRuleConditionRow>
      >;
      verification_history: TableShape<
        VerificationHistoryRow,
        Insertable<
          VerificationHistoryRow,
          'id' | 'created_at',
          | 'source_id'
          | 'previous_status'
          | 'verified_base_rate'
          | 'verified_bonus_rate'
          | 'verified_at'
          | 'verified_by'
          | 'note'
        >,
        // Append-only: there is no UPDATE policy on this table.
        never
      >;
      users: TableShape<
        UserRow,
        Insertable<
          UserRow,
          Timestamps,
          | 'email'
          | 'display_name'
          | 'role'
          | 'home_country_code'
          | 'home_currency_code'
          | 'preferred_locale'
          | 'disclaimers_accepted_version'
          | 'disclaimers_accepted_at'
          | 'onboarding_completed_at'
        >,
        // `role` is pinned by RLS; excluding it here surfaces the error at
        // compile time rather than at runtime.
        Updatable<Omit<UserRow, 'id' | 'role'>>
      >;
      user_cards: TableShape<
        UserCardRow,
        Insertable<
          UserCardRow,
          'id' | Timestamps,
          | 'nickname'
          | 'last_four_cipher'
          | 'last_four_key_id'
          | 'display_order'
          | 'is_archived'
          | 'is_excluded_from_recommendations'
          | 'account_opened_on'
          | 'is_preferred'
          | 'notes'
        >,
        Updatable<Omit<UserCardRow, 'id' | 'user_id'>>
      >;
      user_reward_preferences: TableShape<
        UserRewardPreferenceRow,
        Insertable<
          UserRewardPreferenceRow,
          'id' | Timestamps,
          | 'reward_program_id'
          | 'prefers_cash_back_only'
          | 'minimum_switch_benefit_usd'
          | 'notes'
        >,
        Updatable<Omit<UserRewardPreferenceRow, 'id' | 'user_id'>>
      >;
      user_rule_enrollments: TableShape<
        UserRuleEnrollmentRow,
        Insertable<
          UserRuleEnrollmentRow,
          'id' | Timestamps,
          'status' | 'enrolled_at' | 'expires_at'
        >,
        Updatable<Omit<UserRuleEnrollmentRow, 'id' | 'user_id'>>
      >;
      user_offers: TableShape<
        UserOfferRow,
        Insertable<
          UserOfferRow,
          'id' | Timestamps,
          | 'merchant_id'
          | 'merchant_label'
          | 'description'
          | 'reward_unit'
          | 'rate'
          | 'fixed_amount_usd'
          | 'minimum_spend_usd'
          | 'max_benefit_usd'
          | 'status'
          | 'channel'
          | 'starts_at'
          | 'ends_at'
          | 'enrolled_at'
          | 'redeemed_at'
          | 'is_user_entered'
          | 'source_id'
        >,
        Updatable<Omit<UserOfferRow, 'id' | 'user_id'>>
      >;
      reward_usage: TableShape<
        RewardUsageRow,
        Insertable<
          RewardUsageRow,
          'id' | Timestamps,
          | 'qualifying_spend_usd'
          | 'accrued_reward_units'
          | 'accrued_reward_usd'
          | 'is_user_adjusted'
          | 'last_recorded_at'
        >,
        Updatable<Omit<RewardUsageRow, 'id' | 'user_id'>>
      >;
      purchase_queries: TableShape<
        PurchaseQueryRow,
        Insertable<
          PurchaseQueryRow,
          'id' | 'created_at',
          | 'currency_code'
          | 'country_code'
          | 'channel'
          | 'payment_method'
          | 'notes'
          | 'resolved_merchant_id'
          | 'resolved_category_id'
          | 'resolved_mcc'
          | 'category_match_kind'
          | 'category_confidence'
          | 'has_coding_warning'
          | 'raw_natural_language_input'
        >,
        // Immutable: there is no UPDATE policy on this table.
        never
      >;
      recommendations: TableShape<
        RecommendationRow,
        Insertable<
          RecommendationRow,
          'id' | 'created_at',
          | 'recommended_user_card_id'
          | 'runner_up_user_card_id'
          | 'estimated_value_usd'
          | 'estimated_reward_units'
          | 'reward_unit'
          | 'advantage_over_runner_up_usd'
          | 'confidence'
          | 'explanation'
          | 'warnings'
          | 'engine_version'
          | 'candidate_count'
          | 'eligible_count'
          | 'computed_at'
          | 'was_accepted'
          | 'accepted_at'
        >,
        // Only acceptance is user-mutable; everything else is engine output.
        Updatable<Pick<RecommendationRow, 'was_accepted' | 'accepted_at'>>
      >;
      recommendation_candidates: TableShape<
        RecommendationCandidateRow,
        Insertable<
          RecommendationCandidateRow,
          'id' | 'created_at',
          | 'applied_reward_rule_id'
          | 'applied_user_offer_id'
          | 'effective_rate'
          | 'reward_unit'
          | 'gross_reward_units'
          | 'capped_spend_usd'
          | 'uncapped_spend_usd'
          | 'offer_value_usd'
          | 'statement_credit_usd'
          | 'foreign_transaction_fee_usd'
          | 'applied_cents_per_unit'
          | 'net_value_usd'
          | 'cap_amount_usd'
          | 'cap_remaining_usd'
          | 'cap_period'
          | 'confidence'
          | 'reason'
          | 'ineligibility_code'
          | 'source_verified_at'
          | 'verification_status'
          | 'warnings'
        >,
        never
      >;
      audit_logs: TableShape<
        AuditLogRow,
        // Written only by SECURITY DEFINER triggers; not insertable from the app.
        never,
        never
      >;
    };
    Views: Record<never, never>;
    Functions: {
      current_app_role: { Args: Record<never, never>; Returns: AppRole };
      is_admin: { Args: Record<never, never>; Returns: boolean };
      can_edit_catalog: { Args: Record<never, never>; Returns: boolean };
      /**
       * Takes no arguments by design: the account deleted is always the caller's,
       * read from auth.uid(). See 20260703000100_account_deletion.sql.
       */
      delete_own_account: { Args: Record<never, never>; Returns: void };
    };
    Enums: {
      app_role: AppRole;
      audit_action: AuditAction;
      cap_period: CapPeriod;
      card_kind: CardKind;
      card_network: CardNetwork;
      category_match_kind: CategoryMatchKind;
      confidence_level: ConfidenceLevel;
      enrollment_status: EnrollmentStatus;
      offer_status: OfferStatus;
      payment_method: PaymentMethod;
      purchase_channel: PurchaseChannel;
      reward_type: RewardType;
      reward_unit: RewardUnit;
      rule_kind: RuleKind;
      verification_status: VerificationStatus;
    };
    CompositeTypes: Record<never, never>;
  };
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
