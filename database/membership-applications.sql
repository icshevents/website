-- Pending TEST applications only. This does not activate or update memberships.
-- Run against the existing ICSH Events database after reviewing this setup script.
begin;

create table if not exists public.icsh_membership_applications (
  id uuid primary key,
  reference text generated always as ('TEST-MEM-' || upper(replace(id::text, '-', ''))) stored unique,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  capability_hash text not null check (capability_hash ~ '^[a-f0-9]{64}$'),
  answers jsonb not null check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 12000),
  category text not null check (category in ('standard', 'pensioner', 'student')),
  fee_pence integer not null check (fee_pence between 0 and 1000000),
  currency text not null default 'GBP' check (currency = 'GBP'),
  mode text not null default 'test' check (mode = 'test'),
  test_data boolean not null default true check (test_data = true),
  payment_status text not null check (payment_status in ('awaiting_payment', 'not_required')),
  application_status text not null default 'received' check (application_status = 'received'),
  start_date date check (start_date is null),
  expiry_date date check (expiry_date is null),
  bigin_sync_status text not null default 'awaiting_authorisation'
    check (bigin_sync_status in ('awaiting_authorisation', 'ready', 'syncing', 'synced', 'review_required', 'outcome_unknown', 'failed')),
  bigin_record_id text check (bigin_record_id ~ '^[0-9]{1,40}$'),
  bigin_synced_at timestamptz,
  last_error_code text check (last_error_code ~ '^[A-Z][A-Z0-9_]{0,79}$'),
  sync_attempts integer not null default 0 check (sync_attempts >= 0),
  sync_claim_id uuid,
  sync_lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((fee_pence = 0 and payment_status = 'not_required') or (fee_pence > 0 and payment_status = 'awaiting_payment')),
  check (bigin_sync_status <> 'synced' or (bigin_record_id is not null and bigin_synced_at is not null)),
  check (bigin_sync_status <> 'syncing' or (sync_claim_id is not null and sync_lease_until is not null)),
  check (answers->>'kind' is not null and answers->>'kind' in ('new', 'renewal')),
  check (answers->>'email' is not null and answers->>'email' ~ '^[^[:space:]@<>]+@example\.invalid$')
);
create index if not exists icsh_membership_application_time_idx
  on public.icsh_membership_applications(created_at desc, id);
alter table public.icsh_membership_applications enable row level security;
revoke all on public.icsh_membership_applications from public, anon, authenticated, service_role;
grant select, insert, update on public.icsh_membership_applications to service_role;

-- Canonical keys protect simultaneous submissions, including UK 07 / +44 variants.
create or replace function public.icsh_membership_mobile_key(value text)
returns text language sql immutable strict security invoker set search_path = '' as $$
  with cleaned as (select regexp_replace(regexp_replace(btrim(value), '[^0-9]', '', 'g'), '^00', '') as digits)
  select case when digits ~ '^0[1-9][0-9]{9}$' then '44' || substr(digits, 2)
    when digits ~ '^7[0-9]{9}$' then '44' || digits else nullif(digits, '') end from cleaned;
$$;
revoke all on function public.icsh_membership_mobile_key(text) from public, anon, authenticated;
grant execute on function public.icsh_membership_mobile_key(text) to service_role;
create unique index if not exists icsh_membership_application_email_unique
  on public.icsh_membership_applications(lower(btrim(answers->>'email')));
create unique index if not exists icsh_membership_application_phone_unique
  on public.icsh_membership_applications(public.icsh_membership_mobile_key(answers->>'mobile'));

create or replace function public.icsh_membership_application_save(
  p_id uuid, p_request_hash text, p_capability_hash text, p_answers jsonb,
  p_category text, p_fee_pence integer, p_payment_status text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare saved public.icsh_membership_applications; inserted boolean; duplicate_constraint text;
begin
  if p_id is null or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$'
    or p_capability_hash is null or p_capability_hash !~ '^[a-f0-9]{64}$'
    or p_answers is null or jsonb_typeof(p_answers) <> 'object' or octet_length(p_answers::text) > 12000
    or p_answers->>'kind' is null or p_answers->>'kind' not in ('new', 'renewal')
    or p_answers->>'email' is null or p_answers->>'email' !~ '^[^[:space:]@<>]+@example\.invalid$'
    or p_category is null or p_category not in ('standard', 'pensioner', 'student')
    or p_fee_pence is null or p_fee_pence < 0 or p_fee_pence > 1000000
    or p_payment_status is null
    or not ((p_fee_pence = 0 and p_payment_status = 'not_required') or (p_fee_pence > 0 and p_payment_status = 'awaiting_payment')) then
    raise exception using errcode = '22023', message = 'Invalid membership application';
  end if;
  begin
    insert into public.icsh_membership_applications(id, request_hash, capability_hash, answers, category, fee_pence, payment_status)
      values(p_id, p_request_hash, p_capability_hash, p_answers, p_category, p_fee_pence, p_payment_status)
      on conflict(id) do nothing returning * into saved;
    inserted := found;
  exception when unique_violation then
    get stacked diagnostics duplicate_constraint = CONSTRAINT_NAME;
    if duplicate_constraint = 'icsh_membership_application_email_unique' then
      raise exception using errcode = 'P2001', message = 'Membership application email already in use';
    elsif duplicate_constraint = 'icsh_membership_application_phone_unique' then
      raise exception using errcode = 'P2002', message = 'Membership application phone already in use';
    end if;
    raise;
  end;
  if not inserted then
    select * into saved from public.icsh_membership_applications where id = p_id for update;
    if saved.id is null or saved.request_hash <> p_request_hash or saved.capability_hash <> p_capability_hash then
      raise exception using errcode = '23505', message = 'Membership request conflict';
    end if;
  else
    insert into public.icsh_audit_events(action, record_id)
      values('membership.application.saved', saved.id::text);
  end if;
  return jsonb_build_object('application', to_jsonb(saved), 'created', inserted);
end $$;

create or replace function public.icsh_membership_bigin_claim(p_id uuid, p_claim_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare saved public.icsh_membership_applications;
begin
  if p_id is null or p_claim_id is null then
    raise exception using errcode = '22023', message = 'Invalid membership sync claim';
  end if;
  select * into saved from public.icsh_membership_applications where id = p_id for update;
  if saved.id is null then return null; end if;
  if saved.bigin_sync_status = 'syncing' then
    if saved.sync_lease_until <= now() then
      -- A crashed worker may already have created the Contact. Never reclaim for another POST.
      -- Retain the claim ID so its original worker can still record a late confirmed outcome.
      update public.icsh_membership_applications set bigin_sync_status = 'outcome_unknown',
        last_error_code = 'SYNC_LEASE_EXPIRED', sync_lease_until = null, updated_at = now()
        where id = p_id;
      insert into public.icsh_audit_events(action, record_id) values('membership.bigin.outcome_unknown', p_id::text);
    end if;
    return null;
  end if;
  if saved.bigin_sync_status not in ('awaiting_authorisation', 'ready', 'failed')
    and not (saved.bigin_sync_status = 'outcome_unknown' and saved.bigin_record_id is not null) then
    return null;
  end if;
  -- An unknown outcome with a known Contact ID may be claimed for GET verification only.
  -- The server adapter must never POST when bigin_record_id is already present.
  update public.icsh_membership_applications set bigin_sync_status = 'syncing', sync_claim_id = p_claim_id,
    sync_lease_until = now() + interval '2 minutes', sync_attempts = sync_attempts + 1,
    last_error_code = null, updated_at = now() where id = p_id returning * into saved;
  insert into public.icsh_audit_events(action, record_id) values('membership.bigin.claimed', p_id::text);
  return to_jsonb(saved);
end $$;

create or replace function public.icsh_membership_bigin_complete(
  p_id uuid, p_claim_id uuid, p_status text, p_bigin_record_id text default null, p_error_code text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare saved public.icsh_membership_applications; resolved_id text;
begin
  if p_id is null or p_claim_id is null or p_status is null
    or p_status not in ('awaiting_authorisation', 'synced', 'review_required', 'outcome_unknown', 'failed')
    or (p_bigin_record_id is not null and p_bigin_record_id !~ '^[0-9]{1,40}$')
    or (p_error_code is not null and p_error_code !~ '^[A-Z][A-Z0-9_]{0,79}$') then
    raise exception using errcode = '22023', message = 'Invalid membership sync outcome';
  end if;
  select * into saved from public.icsh_membership_applications where id = p_id for update;
  if saved.id is null or saved.sync_claim_id is distinct from p_claim_id
    or not (saved.bigin_sync_status = 'syncing'
      or (saved.bigin_sync_status = 'outcome_unknown' and saved.last_error_code = 'SYNC_LEASE_EXPIRED')) then
    raise exception using errcode = '40001', message = 'Membership sync claim changed';
  end if;
  if saved.bigin_record_id is not null and p_bigin_record_id is not null and saved.bigin_record_id <> p_bigin_record_id then
    raise exception using errcode = '40001', message = 'Membership sync record changed';
  end if;
  resolved_id := coalesce(saved.bigin_record_id, p_bigin_record_id);
  if p_status = 'synced' and resolved_id is null then
    raise exception using errcode = '22023', message = 'A verified Bigin record ID is required';
  end if;
  -- A known Contact ID is never discarded, including after a failed verification read.
  update public.icsh_membership_applications set bigin_sync_status = p_status, bigin_record_id = resolved_id,
    bigin_synced_at = case when p_status = 'synced' then now() else bigin_synced_at end,
    last_error_code = case when p_status = 'synced' then null else p_error_code end,
    sync_claim_id = null, sync_lease_until = null, updated_at = now()
    where id = p_id returning * into saved;
  insert into public.icsh_audit_events(action, record_id) values('membership.bigin.' || p_status, p_id::text);
  return to_jsonb(saved);
end $$;

revoke execute on function public.icsh_membership_application_save(uuid,text,text,jsonb,text,integer,text) from public, anon, authenticated;
revoke execute on function public.icsh_membership_bigin_claim(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.icsh_membership_bigin_complete(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.icsh_membership_application_save(uuid,text,text,jsonb,text,integer,text) to service_role;
grant execute on function public.icsh_membership_bigin_claim(uuid,uuid) to service_role;
grant execute on function public.icsh_membership_bigin_complete(uuid,uuid,text,text,text) to service_role;

commit;
