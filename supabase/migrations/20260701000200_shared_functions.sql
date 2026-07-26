-- ============================================================================
-- WalletWise — 0002 Shared trigger functions and authorisation helpers
-- ============================================================================

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function walletwise_private.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Authorisation helpers
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Cap-period window boundaries
-- ---------------------------------------------------------------------------
-- Returns the [start, end) window that a cap of `p_period` covers, as of
-- `p_as_of`. `p_anchor` is the cardmember anniversary (account open date) and
-- is only consulted for 'cardmember_year'.
--
-- The rewards engine reimplements this in TypeScript (see
-- src/domain/rewards/capWindow.ts). The two implementations are kept in sync
-- by the unit tests; SQL is provided for reporting queries.
create or replace function public.cap_period_window(
  p_period public.cap_period,
  p_as_of timestamptz default now(),
  p_anchor date default null
)
returns tstzrange
language plpgsql
immutable
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_anchor date := coalesce(p_anchor, date_trunc('year', p_as_of)::date);
  v_years int;
begin
  case p_period
    when 'none' then
      return null;
    when 'monthly' then
      v_start := date_trunc('month', p_as_of);
      v_end := v_start + interval '1 month';
    when 'quarterly' then
      v_start := date_trunc('quarter', p_as_of);
      v_end := v_start + interval '3 months';
    when 'semi_annual' then
      v_start := date_trunc('year', p_as_of)
                 + (case when extract(month from p_as_of) <= 6 then 0 else 6 end
                    * interval '1 month');
      v_end := v_start + interval '6 months';
    when 'calendar_year' then
      v_start := date_trunc('year', p_as_of);
      v_end := v_start + interval '1 year';
    when 'cardmember_year' then
      -- Exact anniversary arithmetic, so this agrees with capWindow.ts rather
      -- than drifting by a day the way epoch division would.
      v_years := extract(year from p_as_of)::int - extract(year from v_anchor)::int;
      v_start := v_anchor::timestamptz + (v_years * interval '1 year');
      if v_start > p_as_of then
        v_start := v_anchor::timestamptz + ((v_years - 1) * interval '1 year');
      end if;
      v_end := v_start + interval '1 year';
    when 'lifetime' then
      v_start := '-infinity'::timestamptz;
      v_end := 'infinity'::timestamptz;
    when 'promotional_window' then
      -- Bounded by the rule's own starts_at / ends_at, not by a calendar.
      return null;
  end case;

  return tstzrange(v_start, v_end, '[)');
end;
$$;

comment on function public.cap_period_window is
  'Resolves a cap_period into a concrete [start, end) window. Mirrored by capWindow.ts.';
