-- ============================================================================
-- WalletWise — 0009 Self-service account deletion
-- ============================================================================
-- Lets a signed-in user delete their own account, and nobody else's.
--
-- WHY THIS IS A DATABASE FUNCTION AND NOT A CLIENT LOOP
-- Deleting an account means removing the row in `auth.users`, which no client
-- role can touch — `auth` is not exposed to `anon` or `authenticated`, and it
-- must not be, or one user could delete another. A client-side loop over the
-- public tables would also be wrong in a subtler way: it would leave the
-- `auth.users` row behind, so the account would still exist and still be able to
-- sign in, into an empty wallet. One statement, one transaction, no partial state.
--
-- Every public table that holds user data references `auth.users(id)` with
-- ON DELETE CASCADE, so this single delete removes all of it. The cascade is
-- asserted row by row in supabase/tests/10_rls.sql rather than assumed here.
--
-- WHY `auth.uid()` IS THE ONLY INPUT
-- The function takes no arguments. There is deliberately no "which user"
-- parameter, because a SECURITY DEFINER function that accepted one would be a
-- delete-anybody endpoint one missing check away from disaster. The identity
-- comes from the verified JWT and cannot be supplied by the caller.
-- ============================================================================

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_deleted int;
begin
  -- SECURITY DEFINER runs as the owner, so an unauthenticated call would
  -- otherwise delete the row whose id is NULL — which matches nothing today, but
  -- is not something to leave to luck.
  if v_user_id is null then
    raise exception 'delete_own_account requires an authenticated session'
      using errcode = 'insufficient_privilege';
  end if;

  delete from auth.users where id = v_user_id;

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'no account found for the current session'
      using errcode = 'no_data_found';
  end if;
end;
$$;

comment on function public.delete_own_account is
  'Deletes the calling user''s auth row, cascading to every table they own. Identity comes from auth.uid(); there is no user parameter by design.';

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
