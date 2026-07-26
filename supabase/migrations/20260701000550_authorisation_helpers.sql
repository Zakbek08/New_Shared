-- ============================================================================
-- WalletWise — 0005.5 Authorisation helpers
-- ============================================================================
-- These read public.users, so they must be created after it.
--
-- WHY THEY ARE NOT IN 0002 WITH THE OTHER SHARED FUNCTIONS
-- Postgres parses and analyses a LANGUAGE sql function body at CREATE time
-- (check_function_bodies is on by default), so a reference to a table that does
-- not exist yet is a hard error rather than a deferred one. The plpgsql
-- functions in 0002 are only syntax-checked, which is why they can sit earlier.
-- Splitting on that boundary keeps the migration set replayable from empty.
--
-- Every RLS policy in 0008 is written against these three functions, so their
-- correctness is the whole authorisation model. They are exercised directly by
-- supabase/tests/10_rls.sql.
-- ============================================================================

-- SECURITY DEFINER so it can read public.users without recursing through that
-- table's own RLS policies. search_path is pinned to defeat search-path
-- hijacking.
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select u.role from public.users u where u.id = auth.uid()),
    'member'::public.app_role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_app_role() = 'admin'::public.app_role;
$$;

-- Catalog editors and admins may both curate the shared card catalog.
create or replace function public.can_edit_catalog()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_app_role() in (
    'catalog_editor'::public.app_role,
    'admin'::public.app_role
  );
$$;

revoke all on function public.current_app_role() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.can_edit_catalog() from public, anon;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_edit_catalog() to authenticated;

comment on function public.current_app_role is
  'The signed-in user''s role, defaulting to member. SECURITY DEFINER to avoid RLS recursion on public.users.';
