begin;
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

commit;
