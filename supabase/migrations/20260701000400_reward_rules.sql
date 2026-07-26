-- ============================================================================
-- WalletWise — 0004 Reward rules, conditions and verification history
-- ============================================================================
-- reward_rules holds the *numbers*. The deterministic TypeScript engine is the
-- only thing allowed to combine them into a recommendation. No model, prompt
-- or heuristic may produce a rate that is not stored here.
-- ============================================================================

create table public.reward_rules (
  id uuid primary key default gen_random_uuid(),
  card_product_id uuid not null references public.card_products (id) on delete cascade,
  reward_program_id uuid references public.reward_programs (id) on delete set null,

  -- Human-readable label used verbatim in the explanation layer.
  label text not null,
  kind public.rule_kind not null,
  reward_type public.reward_type not null,
  reward_unit public.reward_unit not null,

  -- The earn number. Interpretation depends on reward_type:
  --   cash_back_percent  -> percent, e.g. 6.000000 means 6%
  --   points_per_dollar  -> multiplier, e.g. 4.000000 means 4x
  --   miles_per_dollar   -> multiplier
  --   statement_credit   -> ignored; see fixed_amount_usd
  --   fixed_amount       -> ignored; see fixed_amount_usd
  base_rate numeric(12, 6) not null default 0 check (base_rate >= 0),
  -- Additional earn stacked on top of base_rate when the rule qualifies.
  bonus_rate numeric(12, 6) not null default 0 check (bonus_rate >= 0),
  -- For statement_credit / fixed_amount rules.
  fixed_amount_usd numeric(12, 2) check (fixed_amount_usd is null or fixed_amount_usd >= 0),

  -- Ordering hint. Within a card, the engine evaluates rules by priority
  -- descending and applies the single best-earning qualifying rule per
  -- stack_group, then adds any rule marked is_stackable.
  priority smallint not null default 100,
  stack_group text not null default 'category',
  is_stackable boolean not null default false,

  -- Spending cap. NULL cap_amount means uncapped.
  cap_amount numeric(14, 2) check (cap_amount is null or cap_amount > 0),
  -- Whether cap_amount limits qualifying *spend* or accrued *reward*.
  cap_applies_to text not null default 'spend'
    check (cap_applies_to in ('spend', 'reward')),
  cap_period public.cap_period not null default 'none',
  -- Rate that applies once the cap is exhausted. NULL means "fall through to
  -- the card's base rule".
  post_cap_rate numeric(12, 6) check (post_cap_rate is null or post_cap_rate >= 0),

  -- Validity window. NULL means open-ended.
  starts_at timestamptz,
  ends_at timestamptz,

  -- Rotating categories and targeted offers usually require activation.
  requires_enrollment boolean not null default false,
  enrollment_url text check (enrollment_url is null or enrollment_url ~ '^https?://'),
  enrollment_notes text,

  -- Minimum cumulative spend before this rule unlocks (spend_threshold_bonus).
  spend_threshold_usd numeric(14, 2)
    check (spend_threshold_usd is null or spend_threshold_usd >= 0),

  -- Provenance. Required for anything the engine is allowed to trust.
  source_id uuid references public.sources (id) on delete set null,
  last_verified_at timestamptz,
  verification_status public.verification_status not null default 'unverified',

  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reward_rules_window_ordered
    check (starts_at is null or ends_at is null or starts_at < ends_at),
  constraint reward_rules_cap_needs_period
    check (cap_amount is null or cap_period <> 'none'),
  constraint reward_rules_period_needs_cap
    check (cap_period = 'none' or cap_amount is not null),
  constraint reward_rules_fixed_needs_amount
    check (
      reward_type not in ('statement_credit', 'fixed_amount')
      or fixed_amount_usd is not null
    ),
  constraint reward_rules_rate_needs_value
    check (
      reward_type in ('statement_credit', 'fixed_amount')
      or (base_rate + bonus_rate) > 0
    ),
  constraint reward_rules_unit_matches_type
    check (
      (reward_type = 'cash_back_percent' and reward_unit = 'usd')
      or (reward_type = 'points_per_dollar' and reward_unit = 'points')
      or (reward_type = 'miles_per_dollar' and reward_unit = 'miles')
      or reward_type in ('statement_credit', 'fixed_amount')
    ),
  -- A promotional_window cap is meaningless without an explicit end date.
  constraint reward_rules_promo_window_bounded
    check (cap_period <> 'promotional_window' or ends_at is not null),
  constraint reward_rules_verified_needs_evidence
    check (verification_status <> 'verified'
           or (source_id is not null and last_verified_at is not null))
);

create index reward_rules_product_idx on public.reward_rules (card_product_id);
create index reward_rules_active_idx on public.reward_rules (card_product_id, is_active)
  where is_active = true;
create index reward_rules_window_idx on public.reward_rules (starts_at, ends_at);
create index reward_rules_kind_idx on public.reward_rules (kind);

comment on table public.reward_rules is
  'Authoritative reward numbers. Only source of truth for the rewards engine.';
comment on column public.reward_rules.post_cap_rate is
  'Rate after cap exhaustion. NULL = fall through to the card base rule.';

-- ---------------------------------------------------------------------------
-- reward_rule_conditions — the predicate a purchase must satisfy.
-- ---------------------------------------------------------------------------
-- A rule qualifies when EVERY condition row attached to it is satisfied
-- (logical AND across rows). Within a row, each populated field is an
-- independent constraint, also ANDed. Multiple alternatives are expressed as
-- multiple values inside one array field (logical OR).
--
-- Rules with zero condition rows are unconditional (typical for `base`).
create table public.reward_rule_conditions (
  id uuid primary key default gen_random_uuid(),
  reward_rule_id uuid not null references public.reward_rules (id) on delete cascade,

  -- Category / MCC targeting -----------------------------------------------
  -- Convenience scalar for the common single-category case; indexed so the
  -- admin catalog can filter by category cheaply.
  merchant_category_id uuid references public.merchant_categories (id) on delete cascade,
  -- OR-list for multi-category bonuses ("3x on airfare, hotels or transit").
  -- The effective category constraint is the union of merchant_category_id and
  -- this array. When both are empty there is no category constraint at all.
  included_category_ids uuid[] not null default '{}',
  excluded_category_ids uuid[] not null default '{}',
  -- Explicit MCC allow-list, e.g. {5411, 5422}.
  included_mccs integer[] not null default '{}',
  -- Inclusive MCC ranges, e.g. {"[5300,5399]"}.
  included_mcc_ranges int4range[] not null default '{}',
  excluded_mccs integer[] not null default '{}',

  -- Merchant targeting ------------------------------------------------------
  included_merchant_ids uuid[] not null default '{}',
  excluded_merchant_ids uuid[] not null default '{}',

  -- Geography and currency --------------------------------------------------
  included_country_codes char(2)[] not null default '{}',
  excluded_country_codes char(2)[] not null default '{}',
  included_currency_codes char(3)[] not null default '{}',

  -- Channel and payment method ---------------------------------------------
  channel public.purchase_channel not null default 'either',
  included_payment_methods public.payment_method[] not null default '{}',

  -- Per-condition validity window, independent of the rule's window. Used for
  -- rotating quarters so one rule can carry four quarters of conditions.
  starts_at timestamptz,
  ends_at timestamptz,

  -- Minimum / maximum purchase amount for this condition to apply.
  min_amount_usd numeric(14, 2) check (min_amount_usd is null or min_amount_usd >= 0),
  max_amount_usd numeric(14, 2) check (max_amount_usd is null or max_amount_usd > 0),

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint rule_conditions_window_ordered
    check (starts_at is null or ends_at is null or starts_at < ends_at),
  constraint rule_conditions_amounts_ordered
    check (min_amount_usd is null or max_amount_usd is null
           or min_amount_usd <= max_amount_usd)
);

create index reward_rule_conditions_rule_idx
  on public.reward_rule_conditions (reward_rule_id);
create index reward_rule_conditions_category_idx
  on public.reward_rule_conditions (merchant_category_id);
create index reward_rule_conditions_included_categories_idx
  on public.reward_rule_conditions using gin (included_category_ids);
create index reward_rule_conditions_included_merchants_idx
  on public.reward_rule_conditions using gin (included_merchant_ids);
create index reward_rule_conditions_excluded_merchants_idx
  on public.reward_rule_conditions using gin (excluded_merchant_ids);

comment on table public.reward_rule_conditions is
  'AND-ed predicates for a reward rule. Array fields are OR-ed internally.';

-- ---------------------------------------------------------------------------
-- verification_history — append-only audit of catalog data quality.
-- ---------------------------------------------------------------------------
create table public.verification_history (
  id uuid primary key default gen_random_uuid(),
  reward_rule_id uuid not null references public.reward_rules (id) on delete cascade,
  source_id uuid references public.sources (id) on delete set null,
  previous_status public.verification_status,
  new_status public.verification_status not null,
  -- Snapshot of the rate at verification time, so historical recommendations
  -- remain explainable after a rate change.
  verified_base_rate numeric(12, 6),
  verified_bonus_rate numeric(12, 6),
  verified_at timestamptz not null default now(),
  verified_by uuid references auth.users (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index verification_history_rule_idx
  on public.verification_history (reward_rule_id, verified_at desc);

comment on table public.verification_history is
  'Append-only. Rows are never updated or deleted; corrections are new rows.';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger reward_rules_touch before update on public.reward_rules
  for each row execute function walletwise_private.touch_updated_at();
create trigger reward_rule_conditions_touch before update on public.reward_rule_conditions
  for each row execute function walletwise_private.touch_updated_at();
