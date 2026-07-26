-- ============================================================================
-- WalletWise — 0006 Purchase queries and recommendations
-- ============================================================================
-- These tables record what the user asked and what the deterministic engine
-- answered, so any recommendation can be re-explained later even if the
-- catalog changes underneath it.
--
-- WalletWise never initiates a payment. A purchase_query is a hypothetical.
-- ============================================================================

create table public.purchase_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- What the user typed / picked ---------------------------------------------
  merchant_input text not null check (length(merchant_input) between 1 and 120),
  amount_usd numeric(14, 2) not null check (amount_usd > 0 and amount_usd <= 1000000),
  currency_code char(3) not null default 'USD',
  country_code char(2) not null default 'US',
  channel public.purchase_channel not null default 'in_store',
  payment_method public.payment_method not null default 'physical_card',
  notes text check (notes is null or length(notes) <= 500),

  -- What the classifier resolved --------------------------------------------
  resolved_merchant_id uuid references public.merchants (id) on delete set null,
  resolved_category_id uuid references public.merchant_categories (id) on delete set null,
  resolved_mcc integer check (resolved_mcc is null or resolved_mcc between 1 and 9999),
  category_match_kind public.category_match_kind not null default 'unknown',
  category_confidence public.confidence_level not null default 'low',
  -- Set when the merchant's issuer coding is known to be unreliable. Drives
  -- the amber warning in the UI.
  has_coding_warning boolean not null default false,

  -- Original free text when the user used natural language. This is the only
  -- place a language model touches the pipeline: text in, structured fields
  -- out. It never produces a rate.
  raw_natural_language_input text
    check (raw_natural_language_input is null
           or length(raw_natural_language_input) <= 500),

  created_at timestamptz not null default now()
);

create index purchase_queries_user_idx on public.purchase_queries (user_id, created_at desc);
create index purchase_queries_merchant_idx on public.purchase_queries (resolved_merchant_id);

comment on table public.purchase_queries is
  'A hypothetical purchase the user asked about. WalletWise never initiates payment.';

-- ---------------------------------------------------------------------------
-- recommendations — the engine's answer to one purchase_query.
-- ---------------------------------------------------------------------------
create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  purchase_query_id uuid not null references public.purchase_queries (id) on delete cascade,

  -- Winner. NULL when no card qualified.
  recommended_user_card_id uuid references public.user_cards (id) on delete set null,
  runner_up_user_card_id uuid references public.user_cards (id) on delete set null,

  -- Headline numbers, denormalised from the winning candidate so the history
  -- screen renders without a join.
  estimated_value_usd numeric(14, 4),
  estimated_reward_units numeric(16, 6),
  reward_unit public.reward_unit,
  -- Delta over the runner-up. Negative is impossible by construction.
  advantage_over_runner_up_usd numeric(14, 4)
    check (advantage_over_runner_up_usd is null or advantage_over_runner_up_usd >= 0),

  confidence public.confidence_level not null default 'low',
  -- Short deterministic sentence assembled by the explanation layer.
  explanation text,
  -- Machine-readable warnings, e.g. ['merchant_coding_uncertain', 'cap_nearly_reached'].
  warnings text[] not null default '{}',

  -- Version of the engine that produced this answer, so results stay
  -- reproducible across releases.
  engine_version text not null default '0.1.0',
  candidate_count smallint not null default 0 check (candidate_count >= 0),
  eligible_count smallint not null default 0 check (eligible_count >= 0),
  computed_at timestamptz not null default now(),

  -- Did the user say they followed it? Feeds cap tracking.
  was_accepted boolean,
  accepted_at timestamptz,

  created_at timestamptz not null default now(),

  constraint recommendations_counts_consistent check (eligible_count <= candidate_count),
  constraint recommendations_one_per_query unique (purchase_query_id)
);

create index recommendations_user_idx on public.recommendations (user_id, created_at desc);

comment on table public.recommendations is
  'Deterministic engine output for one purchase query. Estimates only.';

-- ---------------------------------------------------------------------------
-- recommendation_candidates — one row per evaluated card, ranked.
-- ---------------------------------------------------------------------------
-- Includes cards that did NOT qualify, with a machine-readable reason, so the
-- "why not this card?" screen never has to guess.
create table public.recommendation_candidates (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.recommendations (id) on delete cascade,
  user_card_id uuid not null references public.user_cards (id) on delete cascade,

  rank smallint not null check (rank >= 1),
  is_eligible boolean not null,

  -- The rule the engine settled on. NULL when nothing qualified.
  applied_reward_rule_id uuid references public.reward_rules (id) on delete set null,
  applied_user_offer_id uuid references public.user_offers (id) on delete set null,

  -- Deterministic breakdown, all figures in the units named. -----------------
  effective_rate numeric(12, 6),
  reward_unit public.reward_unit,
  gross_reward_units numeric(16, 6) not null default 0,
  -- Portion of the purchase that fits under the remaining cap.
  capped_spend_usd numeric(14, 2),
  uncapped_spend_usd numeric(14, 2),
  offer_value_usd numeric(14, 4) not null default 0,
  statement_credit_usd numeric(14, 4) not null default 0,
  foreign_transaction_fee_usd numeric(14, 4) not null default 0,
  -- cents_per_unit actually used, after applying user preferences.
  applied_cents_per_unit numeric(12, 6),
  -- gross reward valued in USD, plus offers/credits, minus FX fees.
  net_value_usd numeric(14, 4) not null default 0,

  -- Cap context surfaced in the UI.
  cap_amount_usd numeric(14, 2),
  cap_remaining_usd numeric(14, 2),
  cap_period public.cap_period,

  confidence public.confidence_level not null default 'low',
  -- Human-readable reason. For ineligible cards this explains the rejection.
  reason text,
  -- Machine-readable rejection code, e.g. 'merchant_excluded', 'rule_expired',
  -- 'not_enrolled', 'cap_exhausted', 'country_not_supported'.
  ineligibility_code text,
  -- Provenance of the applied rule, snapshotted at computation time.
  source_verified_at timestamptz,
  verification_status public.verification_status,
  warnings text[] not null default '{}',

  created_at timestamptz not null default now(),

  constraint recommendation_candidates_unique_card
    unique (recommendation_id, user_card_id),
  constraint recommendation_candidates_unique_rank
    unique (recommendation_id, rank) deferrable initially deferred,
  constraint recommendation_candidates_ineligible_has_code
    check (is_eligible or ineligibility_code is not null),
  constraint recommendation_candidates_eligible_has_rule
    check (not is_eligible or applied_reward_rule_id is not null
           or statement_credit_usd > 0 or offer_value_usd > 0)
);

create index recommendation_candidates_recommendation_idx
  on public.recommendation_candidates (recommendation_id, rank);
create index recommendation_candidates_card_idx
  on public.recommendation_candidates (user_card_id);

comment on table public.recommendation_candidates is
  'Full ranked evaluation, including non-qualifying cards and why they failed.';
