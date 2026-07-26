-- ============================================================================
-- WalletWise — RLS integration tests
-- ============================================================================
-- The cross-user matrix from TESTING.md, executed against a real PostgreSQL
-- cluster with the real policies.
--
-- WHY THIS EXISTS ALONGSIDE `schema.test.ts`
-- The structural suite proves a policy exists and is shaped correctly by reading
-- the SQL. It cannot prove the predicate is *right*. `using (user_id = auth.uid())`
-- and `using (true)` are both well-formed policies; only executing them against
-- two real users tells you which one you wrote.
--
-- Every assertion is recorded rather than raised, so one failure does not hide
-- the rest. The runner reports the table at the end and exits non-zero if any row
-- failed.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Fixtures: two members, one catalog editor, one admin
-- ---------------------------------------------------------------------------
select wwtest.act_as_owner();

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'alice@example.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'bob@example.test'),
  ('cccccccc-0000-4000-8000-000000000003', 'editor@example.test'),
  ('dddddddd-0000-4000-8000-000000000004', 'admin@example.test');

-- `public.users` rows come from the on_auth_user_created trigger; the roles are
-- set here because nothing in the client may set them.
update public.users set role = 'catalog_editor'
 where id = 'cccccccc-0000-4000-8000-000000000003';
update public.users set role = 'admin'
 where id = 'dddddddd-0000-4000-8000-000000000004';

select wwtest.ok(
  'the auth trigger created a public.users row per auth user',
  (select count(*) from public.users) = 4,
  format('%s rows', (select count(*) from public.users))
);

-- A card each for Alice and Bob, on a seeded catalog product.
insert into public.user_cards (id, user_id, card_product_id, nickname)
values
  ('11110000-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-000000000001',
   '55555555-0000-4000-8000-000000000001', 'Alice grocery'),
  ('22220000-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-000000000002',
   '55555555-0000-4000-8000-000000000001', 'Bob grocery');

insert into public.user_offers
  (id, user_id, user_card_id, merchant_label, title, reward_type, fixed_amount_usd)
values
  ('33330000-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-000000000001',
   '11110000-0000-4000-8000-00000000000a', 'Greenleaf', '$10 back', 'statement_credit', 10);

insert into public.reward_usage
  (id, user_id, user_card_id, reward_rule_id, period_start, period_end, cap_period,
   qualifying_spend_usd)
values
  ('44440000-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-000000000001',
   '11110000-0000-4000-8000-00000000000a', '66666666-0000-4000-8000-000000000102',
   '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z', 'calendar_year', 1200);

insert into public.user_reward_preferences (id, user_id, reward_program_id, unit, cents_per_unit)
values
  ('55550000-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-000000000001',
   '22222222-0000-4000-8000-000000000002', 'points', 1.5);

insert into public.purchase_queries
  (id, user_id, merchant_input, amount_usd, channel, payment_method, category_match_kind,
   category_confidence)
values
  ('66660000-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-000000000001',
   'Greenleaf Market', 120, 'in_store', 'apple_pay', 'exact_merchant', 'high');

insert into public.recommendations (id, user_id, purchase_query_id, confidence, engine_version)
values
  ('77770000-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-000000000001',
   '66660000-0000-4000-8000-00000000000a', 'high', '0.1.0');

-- ===========================================================================
-- 1. User A cannot see User B's rows, per table
-- ===========================================================================
select wwtest.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select wwtest.ok(
  'a user sees only their own cards',
  (select count(*) from public.user_cards) = 1
    and (select user_id from public.user_cards) = 'aaaaaaaa-0000-4000-8000-000000000001',
  format('%s visible', (select count(*) from public.user_cards))
);

select wwtest.ok(
  'a user sees only their own offers',
  (select count(*) from public.user_offers) = 1,
  format('%s visible', (select count(*) from public.user_offers))
);

select wwtest.ok(
  'a user sees only their own cap usage',
  (select count(*) from public.reward_usage) = 1,
  format('%s visible', (select count(*) from public.reward_usage))
);

select wwtest.ok(
  'a user sees only their own valuations',
  (select count(*) from public.user_reward_preferences) = 1,
  format('%s visible', (select count(*) from public.user_reward_preferences))
);

select wwtest.ok(
  'a user sees only their own purchase queries',
  (select count(*) from public.purchase_queries) = 1,
  format('%s visible', (select count(*) from public.purchase_queries))
);

select wwtest.ok(
  'a user sees only their own recommendations',
  (select count(*) from public.recommendations) = 1,
  format('%s visible', (select count(*) from public.recommendations))
);

select wwtest.ok(
  'a user sees only their own profile row',
  (select count(*) from public.users) = 1
    and (select id from public.users) = 'aaaaaaaa-0000-4000-8000-000000000001',
  format('%s visible', (select count(*) from public.users))
);

-- ---------------------------------------------------------------------------
-- Writes against another user's rows
-- ---------------------------------------------------------------------------
select wwtest.refuses(
  'a user cannot update another user''s card',
  $$update public.user_cards set nickname = 'stolen'
     where id = '22220000-0000-4000-8000-00000000000b'$$
);

select wwtest.refuses(
  'a user cannot delete another user''s card',
  $$delete from public.user_cards where id = '22220000-0000-4000-8000-00000000000b'$$
);

select wwtest.refuses(
  'a user cannot insert a card owned by someone else',
  $$insert into public.user_cards (user_id, card_product_id, nickname)
    values ('bbbbbbbb-0000-4000-8000-000000000002',
            '55555555-0000-4000-8000-000000000001', 'planted')$$
);

select wwtest.refuses(
  'a user cannot attach an offer to another user''s card',
  $$insert into public.user_offers
      (user_id, user_card_id, merchant_label, title, reward_type, fixed_amount_usd)
    values ('aaaaaaaa-0000-4000-8000-000000000001',
            '22220000-0000-4000-8000-00000000000b', 'Greenleaf', 'planted',
            'statement_credit', 10)$$
);

select wwtest.refuses(
  'a user cannot attach cap usage to another user''s card',
  $$insert into public.reward_usage
      (user_id, user_card_id, reward_rule_id, period_start, period_end, cap_period)
    values ('aaaaaaaa-0000-4000-8000-000000000001',
            '22220000-0000-4000-8000-00000000000b',
            '66666666-0000-4000-8000-000000000102',
            '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z', 'calendar_year')$$
);

select wwtest.refuses(
  'a user cannot attach an enrollment to another user''s card',
  $$insert into public.user_rule_enrollments
      (user_id, user_card_id, reward_rule_id, status)
    values ('aaaaaaaa-0000-4000-8000-000000000001',
            '22220000-0000-4000-8000-00000000000b',
            '66666666-0000-4000-8000-000000000102', 'enrolled')$$
);

select wwtest.permits(
  'a user can update their own card',
  $$update public.user_cards set nickname = 'Alice grocery renamed'
     where id = '11110000-0000-4000-8000-00000000000a'$$
);

-- ===========================================================================
-- 2. Self-promotion is impossible
-- ===========================================================================
select wwtest.refuses(
  'a member cannot promote themselves to admin',
  $$update public.users set role = 'admin'
     where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$
);

select wwtest.refuses(
  'a member cannot promote another user',
  $$update public.users set role = 'admin'
     where id = 'bbbbbbbb-0000-4000-8000-000000000002'$$
);

select wwtest.permits(
  'a member can update their own display name',
  $$update public.users set display_name = 'Alice'
     where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$
);

select wwtest.ok(
  'the role is still member after all of that',
  (select role from public.users where id = 'aaaaaaaa-0000-4000-8000-000000000001')
    = 'member'::public.app_role,
  (select role::text from public.users where id = 'aaaaaaaa-0000-4000-8000-000000000001')
);

-- ===========================================================================
-- 3. A member cannot write to the catalog
-- ===========================================================================
select wwtest.refuses(
  'a member cannot insert a reward rule',
  $$insert into public.reward_rules
      (card_product_id, label, kind, reward_type, reward_unit, base_rate)
    values ('55555555-0000-4000-8000-000000000001', 'planted 99% rule',
            'category_bonus', 'cash_back_percent', 'usd', 99)$$
);

select wwtest.refuses(
  'a member cannot change an existing reward rule',
  $$update public.reward_rules set base_rate = 99
     where id = '66666666-0000-4000-8000-000000000102'$$
);

select wwtest.refuses(
  'a member cannot delete a reward rule',
  $$delete from public.reward_rules where id = '66666666-0000-4000-8000-000000000102'$$
);

select wwtest.refuses(
  'a member cannot insert a merchant',
  $$insert into public.merchants (slug, display_name, country_code)
    values ('planted', 'Planted Merchant', 'US')$$
);

select wwtest.refuses(
  'a member cannot insert a source',
  $$insert into public.sources (label) values ('Planted source')$$
);

select wwtest.refuses(
  'a member cannot insert a condition on a catalog rule',
  $$insert into public.reward_rule_conditions (reward_rule_id, included_country_codes)
    values ('66666666-0000-4000-8000-000000000102', array['US']::char(2)[])$$
);

select wwtest.refuses(
  'a member cannot record a verification',
  $$insert into public.verification_history
      (reward_rule_id, new_status, verified_by)
    values ('66666666-0000-4000-8000-000000000102', 'verified',
            'aaaaaaaa-0000-4000-8000-000000000001')$$
);

select wwtest.ok(
  'a member can still read the catalog',
  (select count(*) from public.reward_rules) > 0,
  format('%s rules visible', (select count(*) from public.reward_rules))
);

-- ===========================================================================
-- 4. Append-only tables cannot be rewritten
-- ===========================================================================
select wwtest.act_as('cccccccc-0000-4000-8000-000000000003');

select wwtest.permits(
  'an editor can record a verification',
  $$insert into public.verification_history
      (reward_rule_id, new_status, verified_by)
    values ('66666666-0000-4000-8000-000000000102', 'verified',
            'cccccccc-0000-4000-8000-000000000003')$$
);

select wwtest.refuses(
  'an editor cannot attribute a verification to someone else',
  $$insert into public.verification_history
      (reward_rule_id, new_status, verified_by)
    values ('66666666-0000-4000-8000-000000000102', 'verified',
            'dddddddd-0000-4000-8000-000000000004')$$
);

select wwtest.refuses(
  'nobody can update verification history',
  $$update public.verification_history set new_status = 'disputed'$$
);

select wwtest.refuses(
  'nobody can delete verification history',
  $$delete from public.verification_history$$
);

select wwtest.refuses(
  'nobody can insert into audit_logs from a client session',
  $$insert into public.audit_logs (action, table_name, changed_columns)
    values ('admin_override', 'reward_rules', array['base_rate'])$$
);

select wwtest.refuses(
  'nobody can update audit_logs',
  $$update public.audit_logs set changed_columns = array['nothing']$$
);

select wwtest.refuses(
  'nobody can delete audit_logs',
  $$delete from public.audit_logs$$
);

-- ===========================================================================
-- 5. An editor may curate the catalog
-- ===========================================================================
select wwtest.permits(
  'an editor can change a reward rule',
  $$update public.reward_rules set notes = 'checked by the editor'
     where id = '66666666-0000-4000-8000-000000000102'$$
);

select wwtest.permits(
  'an editor can insert a source',
  $$insert into public.sources (label) values ('Editor-added source')$$
);

select wwtest.ok(
  'the edit was audited, recording column names only',
  exists (
    select 1 from public.audit_logs
     where table_name = 'reward_rules'
       and action = 'update'
       and 'notes' = any (changed_columns)
  ),
  format('%s audit rows', (select count(*) from public.audit_logs))
);

select wwtest.ok(
  'the audit trail records no values, only names',
  not exists (
    select 1 from public.audit_logs
     where context::text ilike '%checked by the editor%'
  ),
  'no audit row contains the written value'
);

-- An editor is still only a member of their own data.
select wwtest.ok(
  'an editor sees no other user''s cards',
  (select count(*) from public.user_cards) = 0,
  format('%s visible', (select count(*) from public.user_cards))
);

-- ===========================================================================
-- 6. An admin reads the audit trail; a member reads only their own
-- ===========================================================================
select wwtest.act_as('dddddddd-0000-4000-8000-000000000004');

select wwtest.ok(
  'an admin sees the whole audit trail',
  (select count(*) from public.audit_logs) > 0,
  format('%s rows', (select count(*) from public.audit_logs))
);

select wwtest.ok(
  'an admin sees every profile row',
  (select count(*) from public.users) = 4,
  format('%s rows', (select count(*) from public.users))
);

select wwtest.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select wwtest.ok(
  'a member sees no audit rows they are not party to',
  (select count(*) from public.audit_logs) = 0,
  format('%s rows', (select count(*) from public.audit_logs))
);

-- ===========================================================================
-- 7. anon is refused everything
-- ===========================================================================
select wwtest.act_as_anon();

select wwtest.refuses(
  'anon cannot read the catalog',
  $$select 1 from public.reward_rules limit 1$$
);

select wwtest.refuses(
  'anon cannot read any user card',
  $$select 1 from public.user_cards limit 1$$
);

select wwtest.refuses(
  'anon cannot read profiles',
  $$select 1 from public.users limit 1$$
);

select wwtest.refuses(
  'anon cannot insert a card',
  $$insert into public.user_cards (user_id, card_product_id)
    values ('aaaaaaaa-0000-4000-8000-000000000001',
            '55555555-0000-4000-8000-000000000001')$$
);

-- ===========================================================================
-- 8. Deleting the auth user cascades away everything they owned
-- ===========================================================================
select wwtest.act_as_owner();

delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-000000000001';

select wwtest.ok(
  'deleting the auth user removes their profile',
  not exists (select 1 from public.users where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'profile gone'
);

select wwtest.ok(
  'deleting the auth user removes their cards',
  not exists (select 1 from public.user_cards
               where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'cards gone'
);

select wwtest.ok(
  'deleting the auth user removes their offers',
  not exists (select 1 from public.user_offers
               where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'offers gone'
);

select wwtest.ok(
  'deleting the auth user removes their cap usage',
  not exists (select 1 from public.reward_usage
               where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'cap usage gone'
);

select wwtest.ok(
  'deleting the auth user removes their valuations',
  not exists (select 1 from public.user_reward_preferences
               where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'valuations gone'
);

select wwtest.ok(
  'deleting the auth user removes their purchase queries',
  not exists (select 1 from public.purchase_queries
               where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'queries gone'
);

select wwtest.ok(
  'deleting the auth user removes their recommendations',
  not exists (select 1 from public.recommendations
               where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'recommendations gone'
);

select wwtest.ok(
  'deleting one user leaves the other user''s data intact',
  exists (select 1 from public.user_cards
           where user_id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  'Bob still has his card'
);

select wwtest.ok(
  'deleting a user leaves the shared catalog intact',
  (select count(*) from public.reward_rules) > 0,
  format('%s rules remain', (select count(*) from public.reward_rules))
);

-- ===========================================================================
-- 9. delete_own_account() deletes the caller, and only the caller
-- ===========================================================================
-- Section 8 proved the cascade works when the auth row goes. This proves the
-- only route a client has to that deletion is scoped to itself. Bob is the one
-- who leaves; the editor stays, and is checked afterwards, because "it deleted
-- something" and "it deleted the right thing" are different claims.
select wwtest.act_as_anon();

select wwtest.refuses(
  'anon cannot delete an account',
  'select public.delete_own_account()'
);

select wwtest.act_as('bbbbbbbb-0000-4000-8000-000000000002');

-- A DO block rather than `select ... is null`: the function returns void, and a
-- void result is not NULL, so testing its value proves nothing either way. What
-- matters is that the call completes without raising, which needs a handler.
do $$
begin
  perform public.delete_own_account();
  perform wwtest.ok('a member can delete their own account', true, 'returned without raising');
exception
  when others then
    perform wwtest.ok(
      'a member can delete their own account',
      false,
      format('raised %s: %s', sqlstate, sqlerrm)
    );
end
$$;

select wwtest.act_as_owner();

select wwtest.ok(
  'deleting your own account removes the auth row',
  not exists (select 1 from auth.users where id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  'auth row gone, so the account cannot sign in again'
);

select wwtest.ok(
  'deleting your own account cascades to the wallet',
  not exists (select 1 from public.user_cards
               where user_id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  'cards gone'
);

select wwtest.ok(
  'deleting your own account leaves other accounts alone',
  exists (select 1 from auth.users where id = 'cccccccc-0000-4000-8000-000000000003')
    and exists (select 1 from auth.users where id = 'dddddddd-0000-4000-8000-000000000004'),
  'the editor and the admin are still here'
);

-- There is no argument to pass, which is the point: the signature itself makes
-- "delete somebody else" unexpressible rather than merely forbidden.
select wwtest.ok(
  'delete_own_account takes no arguments',
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_own_account'
      and p.pronargs = 0) = 1,
  'exactly one zero-argument overload'
);

select wwtest.ok(
  'anon holds no execute privilege on delete_own_account',
  not has_function_privilege('anon', 'public.delete_own_account()', 'execute'),
  'granted to authenticated only'
);

commit;
