-- ============================================================================
-- WalletWise — 0005 Users and wallet
-- ============================================================================
-- SECURITY INVARIANT
--   No table in this file may ever hold a full card number, CVV/CVC, PIN,
--   bank password or security answer. `user_cards` intentionally has no column
--   capable of holding a 15-19 digit account number, and the one column that
--   touches card digits at all stores ciphertext produced on the device.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- users — application profile, 1:1 with auth.users.
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Denormalised from auth.users for display only. Not a credential.
  email extensions.citext,
  display_name text check (display_name is null or length(display_name) between 1 and 80),
  role public.app_role not null default 'member',
  home_country_code char(2) not null default 'US',
  home_currency_code char(3) not null default 'USD',
  -- Locale / accessibility preferences that affect rendering only.
  preferred_locale text not null default 'en-US',
  -- Version of the financial-information disclaimer the user has accepted.
  disclaimers_accepted_version text,
  disclaimers_accepted_at timestamptz,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users is
  'Application profile. Contains no financial account identifiers.';

-- Provision a profile row whenever Supabase Auth creates a user.
create or replace function walletwise_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email::extensions.citext)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function walletwise_private.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- user_cards — the wallet. Product reference + nickname + preferences only.
-- ---------------------------------------------------------------------------
create table public.user_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  card_product_id uuid not null references public.card_products (id) on delete restrict,

  nickname text check (nickname is null or length(nickname) between 1 and 40),

  -- OPTIONAL, ENCRYPTED, LAST FOUR ONLY.
  -- Base64 AES-GCM ciphertext produced on the device before it is ever sent to
  -- the server. The server, this database and every log sink only ever see
  -- ciphertext. The CHECK constraints below are defence-in-depth: they reject
  -- anything that looks like plaintext digits or a longer account number.
  last_four_cipher text,
  last_four_key_id text,

  -- Wallet ergonomics --------------------------------------------------------
  display_order smallint not null default 0,
  is_archived boolean not null default false,
  -- Excluded from recommendations without deleting history (e.g. card frozen).
  is_excluded_from_recommendations boolean not null default false,
  -- Anniversary used to resolve `cardmember_year` cap windows.
  account_opened_on date,
  -- Users can pin a card they prefer for tie-breaks.
  is_preferred boolean not null default false,
  notes text check (notes is null or length(notes) <= 500),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_cards_unique_product_per_user
    unique (user_id, card_product_id, nickname),

  -- Reject plaintext four-digit values.
  constraint user_cards_last_four_not_plaintext
    check (last_four_cipher is null or last_four_cipher !~ '^[0-9]{1,19}$'),
  -- Ciphertext is base64 and bounded; nothing PAN-sized fits usefully here.
  constraint user_cards_last_four_cipher_shape
    check (
      last_four_cipher is null
      or (last_four_cipher ~ '^[A-Za-z0-9+/=_-]{16,256}$')
    ),
  constraint user_cards_cipher_requires_key_id
    check ((last_four_cipher is null) = (last_four_key_id is null))
);

create index user_cards_user_idx on public.user_cards (user_id)
  where is_archived = false;
create index user_cards_product_idx on public.user_cards (card_product_id);

comment on table public.user_cards is
  'A card in the user wallet. NEVER stores a full card number, CVV, PIN or password.';
comment on column public.user_cards.last_four_cipher is
  'Device-encrypted last four digits (base64 AES-GCM). Optional. Server never sees plaintext.';

-- ---------------------------------------------------------------------------
-- user_reward_preferences — how this user values points and miles.
-- ---------------------------------------------------------------------------
create table public.user_reward_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- NULL reward_program_id = the user's global default for this unit.
  reward_program_id uuid references public.reward_programs (id) on delete cascade,
  unit public.reward_unit not null,
  -- USD cents the user personally assigns to one point/mile.
  cents_per_unit numeric(12, 6) not null check (cents_per_unit >= 0 and cents_per_unit <= 100),
  -- When true the engine ignores non-cash rewards entirely for this user.
  prefers_cash_back_only boolean not null default false,
  -- Minimum extra USD value required before recommending a switch away from
  -- the user's preferred card. Prevents noisy 3-cent recommendations.
  minimum_switch_benefit_usd numeric(10, 2) not null default 0
    check (minimum_switch_benefit_usd >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_reward_preferences_unique_program
    unique nulls not distinct (user_id, reward_program_id)
);

create index user_reward_preferences_user_idx on public.user_reward_preferences (user_id);

comment on table public.user_reward_preferences is
  'User-defined point/mile valuations. Always take precedence over program defaults.';

-- ---------------------------------------------------------------------------
-- user_rule_enrollments — activation state for rules that require it.
-- ---------------------------------------------------------------------------
create table public.user_rule_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  user_card_id uuid not null references public.user_cards (id) on delete cascade,
  reward_rule_id uuid not null references public.reward_rules (id) on delete cascade,
  status public.enrollment_status not null default 'not_enrolled',
  -- Self-reported by the user; WalletWise never logs into an issuer to check.
  enrolled_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_rule_enrollments_unique unique (user_card_id, reward_rule_id),
  constraint user_rule_enrollments_enrolled_has_date
    check (status <> 'enrolled' or enrolled_at is not null)
);

create index user_rule_enrollments_user_idx on public.user_rule_enrollments (user_id);
create index user_rule_enrollments_card_idx on public.user_rule_enrollments (user_card_id);

comment on table public.user_rule_enrollments is
  'Self-reported activation state. WalletWise never performs a bank login.';

-- ---------------------------------------------------------------------------
-- user_offers — targeted / merchant-specific offers attached to one user.
-- ---------------------------------------------------------------------------
create table public.user_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  user_card_id uuid not null references public.user_cards (id) on delete cascade,
  merchant_id uuid references public.merchants (id) on delete set null,
  -- Free-text merchant name when the merchant is not in our catalog.
  merchant_label text,

  title text not null check (length(title) between 1 and 120),
  description text,

  reward_type public.reward_type not null,
  reward_unit public.reward_unit not null default 'usd',
  -- Percent for cash_back_percent, multiplier for points/miles.
  rate numeric(12, 6) not null default 0 check (rate >= 0),
  -- Fixed statement credit, e.g. "$20 back on $100+".
  fixed_amount_usd numeric(12, 2) check (fixed_amount_usd is null or fixed_amount_usd >= 0),
  minimum_spend_usd numeric(14, 2) not null default 0 check (minimum_spend_usd >= 0),
  -- Maximum total benefit this offer can produce.
  max_benefit_usd numeric(12, 2) check (max_benefit_usd is null or max_benefit_usd > 0),

  status public.offer_status not null default 'available',
  channel public.purchase_channel not null default 'either',
  starts_at timestamptz,
  ends_at timestamptz,
  -- Whether the user has confirmed they added the offer to their card.
  enrolled_at timestamptz,
  redeemed_at timestamptz,
  -- Users enter these by hand from their issuer app. Never scraped.
  is_user_entered boolean not null default true,
  source_id uuid references public.sources (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_offers_window_ordered
    check (starts_at is null or ends_at is null or starts_at < ends_at),
  constraint user_offers_has_merchant
    check (merchant_id is not null or merchant_label is not null),
  constraint user_offers_fixed_needs_amount
    check (
      reward_type not in ('statement_credit', 'fixed_amount')
      or fixed_amount_usd is not null
    ),
  constraint user_offers_rate_or_amount
    check (rate > 0 or fixed_amount_usd is not null)
);

create index user_offers_user_idx on public.user_offers (user_id, status);
create index user_offers_card_idx on public.user_offers (user_card_id);
create index user_offers_merchant_idx on public.user_offers (merchant_id);
create index user_offers_expiry_idx on public.user_offers (ends_at)
  where status in ('available', 'enrolled');

comment on table public.user_offers is
  'Per-user targeted offers, entered by hand by the user. No scraping, ever.';

-- ---------------------------------------------------------------------------
-- reward_usage — per-user progress against a rule''s spending cap.
-- ---------------------------------------------------------------------------
-- One row per (user_card, rule, cap window). The engine reads this to compute
-- the remaining cap and writes to it only when the user confirms a purchase.
create table public.reward_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  user_card_id uuid not null references public.user_cards (id) on delete cascade,
  reward_rule_id uuid not null references public.reward_rules (id) on delete cascade,

  -- Cap window this row accounts for, resolved at write time.
  period_start timestamptz not null,
  period_end timestamptz not null,
  cap_period public.cap_period not null,

  -- Cumulative qualifying spend and accrued reward inside the window.
  qualifying_spend_usd numeric(14, 2) not null default 0
    check (qualifying_spend_usd >= 0),
  accrued_reward_units numeric(16, 6) not null default 0
    check (accrued_reward_units >= 0),
  accrued_reward_usd numeric(14, 4) not null default 0
    check (accrued_reward_usd >= 0),

  -- true when the user typed the number in themselves rather than confirming a
  -- WalletWise-recommended purchase. Affects cap-alert confidence.
  is_user_adjusted boolean not null default false,
  last_recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reward_usage_window_ordered check (period_start < period_end),
  constraint reward_usage_unique_window
    unique (user_card_id, reward_rule_id, period_start, period_end)
);

create index reward_usage_user_idx on public.reward_usage (user_id);
create index reward_usage_lookup_idx
  on public.reward_usage (user_card_id, reward_rule_id, period_start desc);

comment on table public.reward_usage is
  'Cap progress per user/card/rule/window. Estimated, self-reported, not a ledger.';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger users_touch before update on public.users
  for each row execute function walletwise_private.touch_updated_at();
create trigger user_cards_touch before update on public.user_cards
  for each row execute function walletwise_private.touch_updated_at();
create trigger user_reward_preferences_touch before update on public.user_reward_preferences
  for each row execute function walletwise_private.touch_updated_at();
create trigger user_rule_enrollments_touch before update on public.user_rule_enrollments
  for each row execute function walletwise_private.touch_updated_at();
create trigger user_offers_touch before update on public.user_offers
  for each row execute function walletwise_private.touch_updated_at();
create trigger reward_usage_touch before update on public.reward_usage
  for each row execute function walletwise_private.touch_updated_at();
