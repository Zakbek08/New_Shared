-- ============================================================================
-- WalletWise — 0009 Custom-card issuer names
-- ============================================================================
-- PROBLEM
--   A user adding a card the catalog does not know types in an issuer name.
--   `card_products.issuer_id` was NOT NULL, but `issuers` is writable only by
--   catalog editors — so a member could never satisfy the foreign key, and the
--   Phase 2 "Add a custom card" flow could not work at all.
--
-- FIX
--   Catalog rows keep their required `issuer_id`. User-defined rows instead
--   carry a free-text `custom_issuer_name` and no `issuer_id`, so a member's
--   private card never introduces a row into the shared issuer catalog.
--
-- The alternative — letting members insert into `issuers` — would let anyone
-- write to shared reference data. Not worth it for a display string.
-- ============================================================================

alter table public.card_products
  alter column issuer_id drop not null;

alter table public.card_products
  add column custom_issuer_name text
    check (custom_issuer_name is null or length(custom_issuer_name) between 1 and 80);

comment on column public.card_products.custom_issuer_name is
  'Issuer name for a user-defined card. Catalog rows use issuer_id instead.';

-- Exactly one of the two issuer sources, decided by is_user_defined.
alter table public.card_products
  add constraint card_products_issuer_source check (
    (is_user_defined = false and issuer_id is not null and custom_issuer_name is null)
    or (is_user_defined = true and issuer_id is null and custom_issuer_name is not null)
  );

-- ---------------------------------------------------------------------------
-- A user-defined product also needs a reward program to earn into, and
-- `reward_programs` is catalog-only for the same reason. Rather than open that
-- table up, a user-defined rule may simply carry no program: the engine falls
-- back to the user's per-unit valuation, which is what it does for any program
-- without an explicit preference.
-- ---------------------------------------------------------------------------
comment on column public.reward_rules.reward_program_id is
  'NULL for user-defined cards; the engine then values the unit by the user''s '
  'per-unit default rather than a program-specific valuation.';
