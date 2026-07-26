-- ============================================================================
-- WalletWise — 0003 Reference catalog
-- ============================================================================
-- Shared, non-user-owned data: issuers, card products, reward programs,
-- merchant categories, merchants and provenance sources.
--
-- These tables are readable by every authenticated user and writable only by
-- catalog editors / admins (see 20260701000800_row_level_security.sql).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- sources — provenance for every reward rule. Created first so rules can FK.
-- ---------------------------------------------------------------------------
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  -- Public issuer page, terms PDF, or press release. WalletWise reads sources
  -- manually; it does NOT scrape them. See SECURITY.md.
  url text,
  publisher text,
  document_type text not null default 'issuer_terms'
    check (document_type in (
      'issuer_terms', 'issuer_marketing', 'network_documentation',
      'user_submission', 'fictional_demo_data', 'other'
    )),
  published_on date,
  retrieved_on date,
  notes text,
  -- True for the fictional Phase 1 seed data. The UI must badge anything
  -- derived from a fictional source.
  is_fictional boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sources_url_shape check (url is null or url ~ '^https?://')
);

comment on table public.sources is
  'Where a reward rule came from. is_fictional=true marks demonstration data.';

-- ---------------------------------------------------------------------------
-- issuers
-- ---------------------------------------------------------------------------
create table public.issuers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  short_name text,
  -- Neutral colour used by the UI; WalletWise does not reproduce issuer logos
  -- or brand marks. See DESIGN notes in ARCHITECTURE.md.
  accent_color text check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  country_code char(2) not null default 'US',
  is_fictional boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- reward_programs — the currency a card earns into.
-- ---------------------------------------------------------------------------
create table public.reward_programs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  issuer_id uuid references public.issuers (id) on delete set null,
  unit public.reward_unit not null,
  -- Conservative default valuation in USD per unit. Users override this in
  -- user_reward_preferences; the engine always prefers the user's value.
  default_cents_per_unit numeric(12, 6) not null default 1.0
    check (default_cents_per_unit >= 0),
  transfer_partners_count smallint default 0 check (transfer_partners_count >= 0),
  notes text,
  is_fictional boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.reward_programs.default_cents_per_unit is
  'USD cents per point/mile. 1.0 = 1 cent per point. Always overridable by the user.';

-- ---------------------------------------------------------------------------
-- card_products — a specific product in the catalog.
-- ---------------------------------------------------------------------------
create table public.card_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  issuer_id uuid not null references public.issuers (id) on delete restrict,
  reward_program_id uuid references public.reward_programs (id) on delete set null,
  name text not null,
  card_kind public.card_kind not null default 'personal_credit',
  network public.card_network not null default 'other',
  annual_fee_usd numeric(10, 2) not null default 0 check (annual_fee_usd >= 0),
  -- Percentage added to foreign-currency purchases, e.g. 3.00 for 3%.
  foreign_transaction_fee_percent numeric(6, 3) not null default 0
    check (foreign_transaction_fee_percent >= 0 and foreign_transaction_fee_percent <= 20),
  -- Some products only earn in specific countries.
  supported_country_codes char(2)[] not null default array['US']::char(2)[],
  -- A short, factual summary. No marketing copy from the issuer.
  summary text,
  -- Set by the user when they add a product WalletWise does not know about.
  is_user_defined boolean not null default false,
  -- Only surfaced to the owning user when is_user_defined = true.
  created_by uuid references auth.users (id) on delete cascade,
  is_fictional boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_products_user_defined_requires_owner
    check (not is_user_defined or created_by is not null),
  constraint card_products_catalog_has_no_owner
    check (is_user_defined or created_by is null)
);

create index card_products_issuer_idx on public.card_products (issuer_id);
create index card_products_created_by_idx on public.card_products (created_by)
  where created_by is not null;
create index card_products_active_catalog_idx on public.card_products (is_active)
  where is_user_defined = false;

comment on table public.card_products is
  'Card products. Contains no account identifiers of any kind.';

-- ---------------------------------------------------------------------------
-- merchant_categories — WalletWise''s canonical category taxonomy.
-- ---------------------------------------------------------------------------
create table public.merchant_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_]+$'),
  display_name text not null,
  -- Ordered list of MCC ranges that typically map to this category. Used by
  -- the classifier as a hint, never as a guarantee — issuers code merchants
  -- at their own discretion. This is the basis of the amber warning.
  mcc_ranges int4range[] not null default '{}',
  -- Sort order for the quick-category buttons on the purchase form.
  display_order smallint not null default 100,
  icon_name text,
  parent_id uuid references public.merchant_categories (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index merchant_categories_display_order_idx
  on public.merchant_categories (display_order, display_name);

comment on column public.merchant_categories.mcc_ranges is
  'Indicative MCC ranges only. Issuer coding is authoritative and may differ.';

-- ---------------------------------------------------------------------------
-- merchants — known merchants and their observed coding.
-- ---------------------------------------------------------------------------
create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  display_name text not null,
  -- Lower-cased alternates used for fuzzy lookup by the classifier.
  aliases text[] not null default '{}',
  primary_category_id uuid references public.merchant_categories (id) on delete set null,
  -- The MCC we believe this merchant codes as. Nullable — unknown is a valid,
  -- explicitly-modelled state that downgrades recommendation confidence.
  known_mcc integer check (known_mcc between 1 and 9999),
  -- How much we trust `known_mcc`.
  mcc_confidence public.confidence_level not null default 'low',
  country_code char(2) not null default 'US',
  -- Warehouse clubs, superstores and gas-station-convenience hybrids routinely
  -- code in a way that surprises users. Forces the amber warning.
  has_ambiguous_coding boolean not null default false,
  is_online_only boolean not null default false,
  source_id uuid references public.sources (id) on delete set null,
  is_fictional boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index merchants_category_idx on public.merchants (primary_category_id);
create index merchants_display_name_idx on public.merchants (lower(display_name));
create index merchants_aliases_idx on public.merchants using gin (aliases);

comment on column public.merchants.has_ambiguous_coding is
  'When true the engine must attach a merchant-coding warning to every candidate.';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger sources_touch before update on public.sources
  for each row execute function walletwise_private.touch_updated_at();
create trigger issuers_touch before update on public.issuers
  for each row execute function walletwise_private.touch_updated_at();
create trigger reward_programs_touch before update on public.reward_programs
  for each row execute function walletwise_private.touch_updated_at();
create trigger card_products_touch before update on public.card_products
  for each row execute function walletwise_private.touch_updated_at();
create trigger merchant_categories_touch before update on public.merchant_categories
  for each row execute function walletwise_private.touch_updated_at();
create trigger merchants_touch before update on public.merchants
  for each row execute function walletwise_private.touch_updated_at();
