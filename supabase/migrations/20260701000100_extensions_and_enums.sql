-- ============================================================================
-- WalletWise — 0001 Extensions, schemas and enumerated types
-- ============================================================================
-- Every enum here is referenced by REWARDS_ENGINE.md. Adding a value is a
-- backwards-compatible migration; removing one is not.
-- ============================================================================

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "citext" with schema extensions;

-- Internal helpers live in their own schema so they are not exposed over the
-- auto-generated REST API.
create schema if not exists walletwise_private;
revoke all on schema walletwise_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('member', 'catalog_editor', 'admin');

-- ---------------------------------------------------------------------------
-- Cards
-- ---------------------------------------------------------------------------
create type public.card_network as enum ('visa', 'mastercard', 'amex', 'discover', 'other');

create type public.card_kind as enum (
  'personal_credit',
  'business_credit',
  'charge',
  'store_credit',
  'debit'
);

-- ---------------------------------------------------------------------------
-- Rewards
-- ---------------------------------------------------------------------------
-- The currency a reward accrues in. `usd` rewards need no valuation step;
-- `points` and `miles` are converted using the user's own valuation.
create type public.reward_unit as enum ('usd', 'points', 'miles');

create type public.reward_type as enum (
  'cash_back_percent',      -- e.g. 6% back            -> rate is a percentage
  'points_per_dollar',      -- e.g. 4x points           -> rate is a multiplier
  'miles_per_dollar',       -- e.g. 3x miles            -> rate is a multiplier
  'statement_credit',       -- fixed USD credit
  'fixed_amount'            -- fixed USD or fixed unit amount
);

-- What kind of rule this is. Determines stacking behaviour in the engine.
create type public.rule_kind as enum (
  'base',                   -- everything-else earn rate
  'category_bonus',         -- elevated rate for a category / MCC set
  'rotating_category',      -- quarterly-activated bonus
  'intro_bonus',            -- limited-time welcome / intro earn
  'online_bonus',           -- online-only uplift
  'mobile_wallet_bonus',    -- Apple Pay / Google Pay / Samsung Pay uplift
  'travel_portal_bonus',    -- issuer travel-portal uplift
  'merchant_specific',      -- named-merchant uplift baked into the product
  'spend_threshold_bonus',  -- unlocked after cumulative spend
  'statement_credit'        -- recurring statement credit
);

create type public.cap_period as enum (
  'none',
  'monthly',
  'quarterly',
  'semi_annual',
  'calendar_year',
  'cardmember_year',
  'lifetime',
  'promotional_window'
);

create type public.purchase_channel as enum ('online', 'in_store', 'either');

create type public.payment_method as enum (
  'physical_card',
  'contactless_card',
  'apple_pay',
  'google_pay',
  'samsung_pay',
  'card_on_file',
  'manual_entry',
  'issuer_travel_portal',
  'other'
);

-- ---------------------------------------------------------------------------
-- Data quality / provenance
-- ---------------------------------------------------------------------------
create type public.verification_status as enum (
  'unverified',
  'user_reported',
  'verified',
  'stale',
  'disputed',
  'retired'
);

-- Confidence attached to a recommendation candidate, surfaced in the UI as
-- green / amber / red.
create type public.confidence_level as enum ('high', 'medium', 'low');

create type public.category_match_kind as enum (
  'exact_merchant',      -- we know this merchant and its MCC
  'known_mcc',           -- MCC supplied by the caller
  'user_selected',       -- user picked the category themselves
  'inferred',            -- classifier guessed from the merchant name
  'unknown'              -- no category could be determined
);

-- ---------------------------------------------------------------------------
-- Offers and enrollment
-- ---------------------------------------------------------------------------
create type public.offer_status as enum ('available', 'enrolled', 'redeemed', 'expired', 'declined');

create type public.enrollment_status as enum ('not_enrolled', 'enrolled', 'ineligible', 'unknown');

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
create type public.audit_action as enum (
  'insert',
  'update',
  'delete',
  'verify',
  'enroll',
  'unenroll',
  'export',
  'admin_override'
);
