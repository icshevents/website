-- ICSH memberships: allow a verified renewal at any time, preserving the
-- already-paid term; reminder stages and cron schedules are unchanged.
begin;
set local lock_timeout = '5s';

create or replace function public.icsh_membership_activation_extend(
  p_id uuid, p_claim uuid, p_start date, p_expiry date
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  a public.icsh_membership_applications;
  x public.icsh_membership_activations;
begin
  select * into a from public.icsh_membership_applications where id=p_id for update;
  select * into x from public.icsh_membership_activations where application_id=p_id for update;
  -- Never extend without the valid, short-lived activation claim for this
  -- existing member. There is intentionally no 30-day renewal window.
  if a.id is null or a.deleted_at is not null
     or a.answers->>'kind' is distinct from 'renewal'
     or x.status is distinct from 'syncing'
     or x.claim_id is distinct from p_claim or x.lease_until<=now()
     or x.contact_id is null or p_start is null or p_expiry is null
     or p_start>=p_expiry or p_start>x.start_date
     or p_expiry<=x.start_date then
    return null;
  end if;
  -- The first successful claim fixes the original expiry permanently for
  -- this application, preventing a retry from adding a second year.
  if x.renewal_base_expiry is not null and x.renewal_base_expiry<>p_expiry then
    return null;
  end if;
  if x.renewal_base_expiry is null then
    update public.icsh_membership_activations
       set renewal_base_expiry=p_expiry,
           expiry_date=(p_expiry+interval '1 year')::date,
           updated_at=now()
     where application_id=p_id returning * into x;
  end if;
  return to_jsonb(x);
end $$;

-- This overload includes the Bigin membership start date, so a previously
-- completed renewal for the CURRENT term cannot suppress future reminders.
-- The existing 3-argument function remains available during deployment.
create or replace function public.icsh_renewal_notice_state(
  p_contact text, p_email text, p_expiry date, p_start date
) returns jsonb
language sql stable security invoker set search_path = '' as $$
select jsonb_build_object(
  'enabled', exists (
    select 1 from public.icsh_renewal_notice_settings
    where id and enabled and now()>=enabled_from
  ),
  'service_permission', exists (
    select 1 from public.icsh_membership_applications a
    where a.mode='live' and not a.test_data and a.deleted_at is null
      and lower(btrim(a.answers->>'email'))=p_email
      and a.answers->>'communicationsNotice' in
        ('2026-11-06-membership-service-v1','2026-11-06-all-tiers-v2')
  ),
  'held',
    exists (select 1 from public.icsh_renewal_suppressions where email=p_email)
    or exists (
      select 1
      from public.icsh_membership_applications a
      left join public.icsh_membership_payments p on p.application_id=a.id
      left join public.icsh_membership_activations x on x.application_id=a.id
      where a.mode='live'
        and lower(btrim(a.answers->>'email'))=p_email
        and (a.bigin_record_id is null or a.bigin_record_id=p_contact)
        and (
          -- A renewal completed in the website but not yet visible in Bigin.
          (x.status='active' and x.expiry_date>p_expiry)
          or (
            -- Payment is verified (or a valid free renewal is ready), but
            -- activation or CRM readback is pending. Hold reminders even
            -- when the member renewed many months before the 30-day notice.
            a.deleted_at is null and not a.test_data
            and a.answers->>'kind'='renewal'
            and p_start is not null and p_start<p_expiry
            and (a.created_at at time zone 'Europe/London')::date>=p_start
            and x.status is distinct from 'active'
            and (x.renewal_base_expiry is null
                 or x.renewal_base_expiry=p_expiry)
            and (
              (p.mode='live' and p.paid_at is not null
               and p.status in ('paid','partially_refunded','refunded','disputed'))
              or (a.fee_pence=0 and public.icsh_free_membership_eligible(a.id))
            )
          )
          or (
            -- A withdrawn/refunded/disputed current term needs review,
            -- not another automated renewal request.
            x.expiry_date=p_expiry and
            (a.test_data or a.deleted_at is not null
             or p.status in ('partially_refunded','refunded','disputed'))
          )
        )
    )
);
$$;

revoke all on function public.icsh_membership_activation_extend(uuid,uuid,date,date)
  from public,anon,authenticated;
grant execute on function public.icsh_membership_activation_extend(uuid,uuid,date,date)
  to service_role;
revoke all on function public.icsh_renewal_notice_state(text,text,date,date)
  from public,anon,authenticated;
grant execute on function public.icsh_renewal_notice_state(text,text,date,date)
  to service_role;
commit;
