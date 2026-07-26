-- ============================================================================
-- WalletWise — integration-test bootstrap
-- ============================================================================
-- Reproduces the parts of a Supabase database that the migrations depend on but
-- that plain PostgreSQL does not provide: the `auth` schema, the three Supabase
-- roles, and `auth.uid()`.
--
-- WHY A SHIM RATHER THAN THE REAL THING
-- The migrations reference `auth.users` and `auth.uid()` in 77 places. Running
-- them against a stock Postgres cluster is the cheapest way to execute the RLS
-- policies *as Postgres will execute them* — the policy predicates, the SECURITY
-- DEFINER helpers, the FORCE flags and the cascade behaviour are all the real
-- thing. Only the identity source is stubbed.
--
-- `auth.uid()` reads the same `request.jwt.claims` setting Supabase's own
-- implementation reads, so `set_config('request.jwt.claims', ...)` in a test
-- behaves exactly as a real JWT does.
-- ============================================================================

-- Supabase's three client roles. NOLOGIN: tests reach them via SET ROLE.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists extensions;
create schema if not exists auth;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- auth.users — only the columns the migrations reference
-- ---------------------------------------------------------------------------
create table if not exists auth.users (
  id uuid primary key,
  email text unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- auth.uid() — the current request's subject
-- ---------------------------------------------------------------------------
-- Matches Supabase's implementation: read the `sub` claim from the request's
-- JWT claims, returning NULL when there is none. Every RLS policy in this
-- schema is written against it, so a test that sets the claim is exercising the
-- same code path a signed-in client does.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Test helpers
-- ---------------------------------------------------------------------------
create schema if not exists wwtest;

/**
 * Acts as a signed-in user for the rest of the transaction.
 *
 * `set local` so the effect ends with the transaction — a test that forgets to
 * reset cannot leak an identity into the next one.
 */
create or replace function wwtest.act_as(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';
end;
$$;

/** Acts as an unauthenticated visitor. */
create or replace function wwtest.act_as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end;
$$;

/** Returns to the owner role, for setting up fixtures. */
create or replace function wwtest.act_as_owner()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
end;
$$;

/**
 * Records one assertion.
 *
 * Collected in a table rather than raised, so a whole matrix runs and reports
 * every failure at once. A run that stopped at the first failure would hide the
 * other nineteen.
 */
create table if not exists wwtest.results (
  id bigserial primary key,
  name text not null,
  passed boolean not null,
  detail text
);

-- SECURITY DEFINER so an assertion made while acting as `anon` or `authenticated`
-- can still be recorded. Those roles deliberately have no privileges on
-- wwtest.results, and granting them INSERT would be a second, pointless way for
-- the harness to differ from production. Recording a row is all this does.
--
-- `refuses` and `permits` below must NOT be SECURITY DEFINER: they EXECUTE
-- arbitrary SQL, and running that as the owner would bypass the very RLS the
-- tests exist to check.
create or replace function wwtest.ok(p_name text, p_condition boolean, p_detail text default null)
returns void
language sql
security definer
set search_path = wwtest, pg_temp
as $$
  insert into wwtest.results (name, passed, detail) values (p_name, coalesce(p_condition, false), p_detail);
$$;

/**
 * Asserts a statement is refused.
 *
 * An RLS refusal on INSERT raises 42501; a refusal on SELECT/UPDATE/DELETE
 * silently matches zero rows instead. Both count as "refused" here, and the
 * detail records which happened — the distinction matters when reading a failure.
 */
create or replace function wwtest.refuses(p_name text, p_sql text)
returns void
language plpgsql
as $$
declare
  v_affected bigint;
begin
  execute p_sql;
  get diagnostics v_affected = row_count;

  if v_affected = 0 then
    perform wwtest.ok(p_name, true, 'affected 0 rows');
  else
    perform wwtest.ok(p_name, false, format('affected %s rows — NOT refused', v_affected));
  end if;
exception
  when insufficient_privilege then
    perform wwtest.ok(p_name, true, 'raised 42501 insufficient_privilege');
  when others then
    -- A different error is not a refusal. Record what happened rather than
    -- treating any exception as a pass, which would make this helper useless.
    perform wwtest.ok(p_name, false, format('raised %s: %s', sqlstate, sqlerrm));
end;
$$;

/** Asserts a statement is permitted and affects at least one row. */
create or replace function wwtest.permits(p_name text, p_sql text)
returns void
language plpgsql
as $$
declare
  v_affected bigint;
begin
  execute p_sql;
  get diagnostics v_affected = row_count;

  perform wwtest.ok(
    p_name,
    v_affected > 0,
    format('affected %s rows', v_affected)
  );
exception
  when others then
    perform wwtest.ok(p_name, false, format('raised %s: %s', sqlstate, sqlerrm));
end;
$$;

-- The role-switching and assertion helpers are reachable from every role a test
-- acts as. wwtest.results itself is not granted, so a test running as anon or
-- authenticated cannot edit its own verdict — it can only append through ok().
grant usage on schema wwtest to anon, authenticated, service_role;

grant execute on function
  wwtest.act_as(uuid), wwtest.act_as_anon(), wwtest.act_as_owner(),
  wwtest.ok(text, boolean, text), wwtest.refuses(text, text), wwtest.permits(text, text)
to anon, authenticated, service_role;
