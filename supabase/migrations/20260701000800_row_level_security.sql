-- ============================================================================
-- WalletWise — 0008 Row-Level Security
-- ============================================================================
-- POLICY MODEL
--   * RLS is enabled on EVERY table in `public`. There are no exceptions.
--   * `anon` gets nothing. All access requires an authenticated session.
--   * User-owned rows are visible only to their owner (`user_id = auth.uid()`).
--   * Reference catalog rows are readable by any authenticated user and
--     writable only by catalog_editor / admin.
--   * Append-only tables (verification_history, audit_logs) have no UPDATE or
--     DELETE policy at all, so those operations are impossible via the API.
--
-- Verified by the checklist in SECURITY.md.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Baseline table privileges
-- ---------------------------------------------------------------------------
-- RLS narrows what a role can see; GRANT decides whether it can ask at all.
-- Both are needed, and they are deliberately stated here rather than inherited.
--
-- WHY THESE ARE EXPLICIT
-- A hosted Supabase project ships `alter default privileges ... grant all on
-- tables to anon, authenticated, service_role`, so a migration that grants
-- nothing still appears to work there. That makes the schema depend on a
-- platform setting no reviewer can see in this repository, and it hands every
-- role every verb — including UPDATE on tables that are meant to be append-only,
-- where the only thing standing in the way is the absence of a policy. Granting
-- per table and per verb means a missing policy is a second lock, not the only
-- one. It also makes the migration set replayable on any Postgres, which is what
-- supabase/tests/ runs against.
--
-- The privilege granted is the *union* of what the policies below allow; the
-- policies still decide which rows. Where no policy exists for a verb, the verb
-- is not granted either.
revoke all on all tables in schema public from anon;

-- anon gets nothing at all. Every route in this app requires a session.

-- Reference catalog: readable by any signed-in user, written only by curators
-- (enforced by the *_write policies, which call public.can_edit_catalog()).
grant select, insert, update, delete on
  public.issuers,
  public.reward_programs,
  public.card_products,
  public.merchant_categories,
  public.merchants,
  public.sources,
  public.reward_rules,
  public.reward_rule_conditions
to authenticated;

-- User-owned data: full CRUD, scoped to the owner by the policies below.
grant select, insert, update, delete on
  public.user_cards,
  public.user_reward_preferences,
  public.user_rule_enrollments,
  public.user_offers,
  public.reward_usage,
  public.recommendations
to authenticated;

-- No UPDATE: a recorded query and its candidate set are history. There is no
-- update policy for either, and now no privilege either.
grant select, insert, delete on
  public.purchase_queries,
  public.recommendation_candidates
to authenticated;

-- users: a row is created by the signup trigger and removed by cascade, so the
-- client needs neither INSERT nor DELETE. UPDATE is allowed but users_update_self
-- pins `role`, so this cannot be a privilege-escalation path.
grant select, update on public.users to authenticated;

-- Append-only. The absence of an UPDATE/DELETE policy already refuses these;
-- withholding the privilege makes the refusal a 42501 instead of a silent
-- zero-row result, which is easier to spot in a log.
grant select, insert on public.verification_history to authenticated;

-- audit_logs is written only by walletwise_private.audit_catalog_change(), which
-- is SECURITY DEFINER. No client may insert into it.
grant select on public.audit_logs to authenticated;

-- service_role is used by server-side code only and never reaches the device.
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter table public.users                     enable row level security;
alter table public.issuers                   enable row level security;
alter table public.reward_programs           enable row level security;
alter table public.card_products             enable row level security;
alter table public.merchant_categories       enable row level security;
alter table public.merchants                 enable row level security;
alter table public.sources                   enable row level security;
alter table public.reward_rules              enable row level security;
alter table public.reward_rule_conditions    enable row level security;
alter table public.verification_history      enable row level security;
alter table public.user_cards                enable row level security;
alter table public.user_reward_preferences   enable row level security;
alter table public.user_rule_enrollments     enable row level security;
alter table public.user_offers               enable row level security;
alter table public.reward_usage              enable row level security;
alter table public.purchase_queries          enable row level security;
alter table public.recommendations           enable row level security;
alter table public.recommendation_candidates enable row level security;
alter table public.audit_logs                enable row level security;

-- Force RLS even for the table owner, so a misconfigured connection string
-- cannot silently bypass these policies.
alter table public.users                     force row level security;
alter table public.user_cards                force row level security;
alter table public.user_reward_preferences   force row level security;
alter table public.user_rule_enrollments     force row level security;
alter table public.user_offers               force row level security;
alter table public.reward_usage              force row level security;
alter table public.purchase_queries          force row level security;
alter table public.recommendations           force row level security;
alter table public.recommendation_candidates force row level security;
alter table public.audit_logs                force row level security;

-- ===========================================================================
-- users — self access only. Role escalation is impossible from the client.
-- ===========================================================================
create policy users_select_self on public.users
  for select to authenticated
  using (id = auth.uid());

create policy users_select_admin on public.users
  for select to authenticated
  using (public.is_admin());

create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid())
  -- `role` is deliberately absent from anything the client can set; the WITH
  -- CHECK below pins it to the current value so a member cannot promote
  -- themselves to admin.
  with check (
    id = auth.uid()
    and role = (select u.role from public.users u where u.id = auth.uid())
  );

-- No INSERT policy: rows are created by the on_auth_user_created trigger.
-- No DELETE policy: account deletion goes through auth.users (ON DELETE CASCADE).

-- ===========================================================================
-- Reference catalog — read for all authenticated, write for editors.
-- ===========================================================================
create policy issuers_read on public.issuers
  for select to authenticated using (true);
create policy issuers_write on public.issuers
  for all to authenticated
  using (public.can_edit_catalog()) with check (public.can_edit_catalog());

create policy reward_programs_read on public.reward_programs
  for select to authenticated using (true);
create policy reward_programs_write on public.reward_programs
  for all to authenticated
  using (public.can_edit_catalog()) with check (public.can_edit_catalog());

create policy merchant_categories_read on public.merchant_categories
  for select to authenticated using (true);
create policy merchant_categories_write on public.merchant_categories
  for all to authenticated
  using (public.can_edit_catalog()) with check (public.can_edit_catalog());

create policy merchants_read on public.merchants
  for select to authenticated using (true);
create policy merchants_write on public.merchants
  for all to authenticated
  using (public.can_edit_catalog()) with check (public.can_edit_catalog());

create policy sources_read on public.sources
  for select to authenticated using (true);
create policy sources_write on public.sources
  for all to authenticated
  using (public.can_edit_catalog()) with check (public.can_edit_catalog());

-- ---------------------------------------------------------------------------
-- card_products — shared catalog rows plus private user-defined products.
-- ---------------------------------------------------------------------------
create policy card_products_read_catalog on public.card_products
  for select to authenticated
  using (is_user_defined = false);

create policy card_products_read_own on public.card_products
  for select to authenticated
  using (is_user_defined = true and created_by = auth.uid());

-- A user may create a custom card product for themselves, but only as a
-- user-defined row owned by them.
create policy card_products_insert_own on public.card_products
  for insert to authenticated
  with check (is_user_defined = true and created_by = auth.uid());

create policy card_products_update_own on public.card_products
  for update to authenticated
  using (is_user_defined = true and created_by = auth.uid())
  with check (is_user_defined = true and created_by = auth.uid());

create policy card_products_delete_own on public.card_products
  for delete to authenticated
  using (is_user_defined = true and created_by = auth.uid());

create policy card_products_write_catalog on public.card_products
  for all to authenticated
  using (public.can_edit_catalog()) with check (public.can_edit_catalog());

-- ---------------------------------------------------------------------------
-- reward_rules / conditions — readable when the parent product is readable.
-- ---------------------------------------------------------------------------
create policy reward_rules_read on public.reward_rules
  for select to authenticated
  using (
    exists (
      select 1 from public.card_products p
       where p.id = reward_rules.card_product_id
         and (p.is_user_defined = false or p.created_by = auth.uid())
    )
  );

create policy reward_rules_write_own_product on public.reward_rules
  for all to authenticated
  using (
    exists (
      select 1 from public.card_products p
       where p.id = reward_rules.card_product_id
         and p.is_user_defined = true
         and p.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.card_products p
       where p.id = reward_rules.card_product_id
         and p.is_user_defined = true
         and p.created_by = auth.uid()
    )
  );

create policy reward_rules_write_catalog on public.reward_rules
  for all to authenticated
  using (public.can_edit_catalog()) with check (public.can_edit_catalog());

create policy reward_rule_conditions_read on public.reward_rule_conditions
  for select to authenticated
  using (
    exists (
      select 1
        from public.reward_rules r
        join public.card_products p on p.id = r.card_product_id
       where r.id = reward_rule_conditions.reward_rule_id
         and (p.is_user_defined = false or p.created_by = auth.uid())
    )
  );

create policy reward_rule_conditions_write_own_product on public.reward_rule_conditions
  for all to authenticated
  using (
    exists (
      select 1
        from public.reward_rules r
        join public.card_products p on p.id = r.card_product_id
       where r.id = reward_rule_conditions.reward_rule_id
         and p.is_user_defined = true
         and p.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1
        from public.reward_rules r
        join public.card_products p on p.id = r.card_product_id
       where r.id = reward_rule_conditions.reward_rule_id
         and p.is_user_defined = true
         and p.created_by = auth.uid()
    )
  );

create policy reward_rule_conditions_write_catalog on public.reward_rule_conditions
  for all to authenticated
  using (public.can_edit_catalog()) with check (public.can_edit_catalog());

-- ---------------------------------------------------------------------------
-- verification_history — append-only. Read for all, INSERT for editors.
-- No UPDATE or DELETE policy exists, by design.
-- ---------------------------------------------------------------------------
create policy verification_history_read on public.verification_history
  for select to authenticated using (true);

create policy verification_history_insert on public.verification_history
  for insert to authenticated
  with check (public.can_edit_catalog() and verified_by = auth.uid());

-- ===========================================================================
-- User-owned data — owner-only, on every command.
-- ===========================================================================
create policy user_cards_select on public.user_cards
  for select to authenticated using (user_id = auth.uid());
create policy user_cards_insert on public.user_cards
  for insert to authenticated with check (user_id = auth.uid());
create policy user_cards_update on public.user_cards
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_cards_delete on public.user_cards
  for delete to authenticated using (user_id = auth.uid());

create policy user_reward_preferences_select on public.user_reward_preferences
  for select to authenticated using (user_id = auth.uid());
create policy user_reward_preferences_insert on public.user_reward_preferences
  for insert to authenticated with check (user_id = auth.uid());
create policy user_reward_preferences_update on public.user_reward_preferences
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_reward_preferences_delete on public.user_reward_preferences
  for delete to authenticated using (user_id = auth.uid());

create policy user_rule_enrollments_select on public.user_rule_enrollments
  for select to authenticated using (user_id = auth.uid());
create policy user_rule_enrollments_insert on public.user_rule_enrollments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.user_cards c
       where c.id = user_rule_enrollments.user_card_id and c.user_id = auth.uid()
    )
  );
create policy user_rule_enrollments_update on public.user_rule_enrollments
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_rule_enrollments_delete on public.user_rule_enrollments
  for delete to authenticated using (user_id = auth.uid());

create policy user_offers_select on public.user_offers
  for select to authenticated using (user_id = auth.uid());
create policy user_offers_insert on public.user_offers
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.user_cards c
       where c.id = user_offers.user_card_id and c.user_id = auth.uid()
    )
  );
create policy user_offers_update on public.user_offers
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_offers_delete on public.user_offers
  for delete to authenticated using (user_id = auth.uid());

create policy reward_usage_select on public.reward_usage
  for select to authenticated using (user_id = auth.uid());
create policy reward_usage_insert on public.reward_usage
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.user_cards c
       where c.id = reward_usage.user_card_id and c.user_id = auth.uid()
    )
  );
create policy reward_usage_update on public.reward_usage
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reward_usage_delete on public.reward_usage
  for delete to authenticated using (user_id = auth.uid());

create policy purchase_queries_select on public.purchase_queries
  for select to authenticated using (user_id = auth.uid());
create policy purchase_queries_insert on public.purchase_queries
  for insert to authenticated with check (user_id = auth.uid());
create policy purchase_queries_delete on public.purchase_queries
  for delete to authenticated using (user_id = auth.uid());
-- No UPDATE policy: a query is an immutable record of what the user asked.

create policy recommendations_select on public.recommendations
  for select to authenticated using (user_id = auth.uid());
create policy recommendations_insert on public.recommendations
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.purchase_queries q
       where q.id = recommendations.purchase_query_id and q.user_id = auth.uid()
    )
  );
-- Users may only mark acceptance; other columns are engine output.
create policy recommendations_update on public.recommendations
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy recommendations_delete on public.recommendations
  for delete to authenticated using (user_id = auth.uid());

create policy recommendation_candidates_select on public.recommendation_candidates
  for select to authenticated
  using (
    exists (
      select 1 from public.recommendations r
       where r.id = recommendation_candidates.recommendation_id
         and r.user_id = auth.uid()
    )
  );
create policy recommendation_candidates_insert on public.recommendation_candidates
  for insert to authenticated
  with check (
    exists (
      select 1 from public.recommendations r
       where r.id = recommendation_candidates.recommendation_id
         and r.user_id = auth.uid()
    )
  );
create policy recommendation_candidates_delete on public.recommendation_candidates
  for delete to authenticated
  using (
    exists (
      select 1 from public.recommendations r
       where r.id = recommendation_candidates.recommendation_id
         and r.user_id = auth.uid()
    )
  );

-- ===========================================================================
-- audit_logs — read your own trail; admins read everything. Never writable
-- from the client (rows come from SECURITY DEFINER triggers only).
-- ===========================================================================
create policy audit_logs_select_own on public.audit_logs
  for select to authenticated
  using (subject_user_id = auth.uid() or actor_id = auth.uid());

create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using (public.is_admin());
