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

-- The authorisation helpers (current_app_role, is_admin, can_edit_catalog) read
-- public.users, so they cannot be defined here: Postgres parses a LANGUAGE sql
-- body at CREATE time and would reject a reference to a table that does not
-- exist yet. They live in 20260701000550_authorisation_helpers.sql, immediately
-- after the table.

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
