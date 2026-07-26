-- ============================================================================
-- WalletWise — 0007 Audit log
-- ============================================================================
-- Append-only record of who changed what. Deliberately stores *shape*, not
-- *content*: the diff records which columns changed, never their values. That
-- keeps financial and personal data out of the audit trail entirely.
-- ============================================================================

create table public.audit_logs (
  id bigint generated always as identity primary key,
  -- The user who performed the action. NULL for system / migration activity.
  actor_id uuid references auth.users (id) on delete set null,
  actor_role public.app_role,
  -- The user whose data was touched, when different from the actor.
  subject_user_id uuid references auth.users (id) on delete cascade,

  action public.audit_action not null,
  table_name text not null,
  record_id text,

  -- Names of the columns that changed. NEVER the values. See SECURITY.md.
  changed_columns text[] not null default '{}',
  -- Optional non-sensitive context, e.g. {"reason":"stale_source"}. A CHECK
  -- cannot enforce "no sensitive data", so this is enforced by review and by
  -- the redaction helper in src/services/audit.
  context jsonb not null default '{}'::jsonb,

  occurred_at timestamptz not null default now(),

  constraint audit_logs_context_is_object check (jsonb_typeof(context) = 'object'),
  -- Cheap structural guard against the most obvious mistakes.
  constraint audit_logs_no_credential_keys check (
    not (context ?| array[
      'card_number', 'cardNumber', 'pan', 'cvv', 'cvc', 'pin',
      'password', 'security_answer', 'securityAnswer', 'access_token'
    ])
  )
);

create index audit_logs_subject_idx on public.audit_logs (subject_user_id, occurred_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, occurred_at desc);
create index audit_logs_table_idx on public.audit_logs (table_name, occurred_at desc);

comment on table public.audit_logs is
  'Append-only. Records which columns changed, never their values.';
comment on column public.audit_logs.changed_columns is
  'Column names only. Storing values here would leak financial data.';

-- ---------------------------------------------------------------------------
-- Generic audit trigger for catalog tables.
-- ---------------------------------------------------------------------------
create or replace function walletwise_private.audit_catalog_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_changed text[] := '{}';
  v_record_id text;
  v_action public.audit_action;
begin
  if tg_op = 'INSERT' then
    v_action := 'insert';
    v_record_id := (to_jsonb(new) ->> 'id');
  elsif tg_op = 'UPDATE' then
    v_action := 'update';
    v_record_id := (to_jsonb(new) ->> 'id');
    select coalesce(array_agg(o.key order by o.key), '{}')
      into v_changed
      from jsonb_each(to_jsonb(old)) o
      join jsonb_each(to_jsonb(new)) n on n.key = o.key
     where n.value is distinct from o.value
       and o.key <> 'updated_at';
    -- Nothing meaningful changed; don't create noise.
    if v_changed = '{}' then
      return new;
    end if;
  else
    v_action := 'delete';
    v_record_id := (to_jsonb(old) ->> 'id');
  end if;

  insert into public.audit_logs (
    actor_id, actor_role, action, table_name, record_id, changed_columns
  )
  values (
    auth.uid(),
    public.current_app_role(),
    v_action,
    tg_table_name,
    v_record_id,
    v_changed
  );

  return coalesce(new, old);
end;
$$;

create trigger audit_card_products
  after insert or update or delete on public.card_products
  for each row execute function walletwise_private.audit_catalog_change();

create trigger audit_reward_rules
  after insert or update or delete on public.reward_rules
  for each row execute function walletwise_private.audit_catalog_change();

create trigger audit_reward_rule_conditions
  after insert or update or delete on public.reward_rule_conditions
  for each row execute function walletwise_private.audit_catalog_change();

create trigger audit_merchants
  after insert or update or delete on public.merchants
  for each row execute function walletwise_private.audit_catalog_change();

create trigger audit_sources
  after insert or update or delete on public.sources
  for each row execute function walletwise_private.audit_catalog_change();
