begin;
set local lock_timeout='5s';
-- Remember an extension once, under the existing durable activation claim.
alter table public.icsh_membership_activations add column renewal_base_expiry date;
create function public.icsh_membership_activation_extend(p_id uuid,p_claim uuid,p_start date,p_expiry date)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.icsh_membership_applications;x public.icsh_membership_activations;
begin
 select * into a from public.icsh_membership_applications where id=p_id for update;
 select * into x from public.icsh_membership_activations where application_id=p_id for update;
 if a.id is null or a.deleted_at is not null or a.answers->>'kind' is distinct from 'renewal' or x.status is distinct from 'syncing' or x.claim_id is distinct from p_claim or x.lease_until<=now() or x.contact_id is null or p_start is null or p_expiry is null or p_start>=p_expiry or p_start>x.start_date or p_expiry<=x.start_date or p_expiry>x.start_date+30 then return null;end if;
 if x.renewal_base_expiry is not null and x.renewal_base_expiry<>p_expiry then return null;end if;
 if x.renewal_base_expiry is null then
  update public.icsh_membership_activations set renewal_base_expiry=p_expiry,expiry_date=(p_expiry+interval '1 year')::date,updated_at=now() where application_id=p_id returning * into x;
 end if;
 return to_jsonb(x);
end $$;
revoke all on function public.icsh_membership_activation_extend(uuid,uuid,date,date) from public,anon,authenticated;
grant execute on function public.icsh_membership_activation_extend(uuid,uuid,date,date) to service_role;

create table public.icsh_renewal_notice_settings(id boolean primary key default true check(id),enabled boolean not null default false,test_enabled boolean not null default false,test_token_hash text check(test_token_hash ~ '^[a-f0-9]{64}$'),test_until timestamptz,enabled_from timestamptz not null default now());
insert into public.icsh_renewal_notice_settings(id) values(true);
create table public.icsh_renewal_suppressions(email text primary key check(email=lower(btrim(email))),created_at timestamptz not null default now());
create table public.icsh_renewal_notices(
 id uuid primary key default gen_random_uuid(),contact_id text not null check(contact_id ~ '^[1-9][0-9]{0,29}$' or contact_id='test-admin'),
 expiry_date date not null,stage text not null check(stage in ('before30','before7','expired','after7')),recipient text not null check(length(recipient)<=254 and recipient=lower(btrim(recipient)) and recipient !~ '[[:space:]<>]'),
 is_test boolean not null default false,status text not null check(status in ('sending','accepted','retry','failed','review_required','cancelled')),
 claim_id uuid not null,claimed_at timestamptz not null default now(),attempts integer not null default 1,
 available_at timestamptz not null default now(),provider_id text,error_code text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(contact_id,expiry_date,stage,is_test),check(not is_test or (contact_id='test-admin' and recipient='admin@icsh.org.uk'))
);
-- Test subjects cannot be resent by varying the fixture expiry date.
create unique index icsh_renewal_test_once on public.icsh_renewal_notices(stage) where is_test;
alter table public.icsh_renewal_notice_settings enable row level security;
alter table public.icsh_renewal_suppressions enable row level security;
alter table public.icsh_renewal_notices enable row level security;
revoke all on public.icsh_renewal_notice_settings,public.icsh_renewal_suppressions,public.icsh_renewal_notices from public,anon,authenticated,service_role;
grant select,insert,update on public.icsh_renewal_notice_settings,public.icsh_renewal_suppressions,public.icsh_renewal_notices to service_role;

create function public.icsh_renewal_notice_state(p_contact text,p_email text,p_expiry date)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'enabled',exists(select 1 from public.icsh_renewal_notice_settings where id and enabled and now()>=enabled_from),
 'service_permission',exists(select 1 from public.icsh_membership_applications a where a.mode='live' and not a.test_data and a.deleted_at is null and lower(btrim(a.answers->>'email'))=p_email and a.answers->>'communicationsNotice' in ('2026-11-06-membership-service-v1','2026-11-06-all-tiers-v2')),
 'held',exists(select 1 from public.icsh_renewal_suppressions where email=p_email) or exists(
 select 1 from public.icsh_membership_applications a
 left join public.icsh_membership_payments p on p.application_id=a.id
 left join public.icsh_membership_activations x on x.application_id=a.id
 where a.mode='live' and lower(btrim(a.answers->>'email'))=p_email
 and (a.bigin_record_id is null or a.bigin_record_id=p_contact)
 and (
  -- Confirmed newer term, including a website renewal before CRM sync/readback settles.
  (x.status='active' and x.expiry_date>p_expiry)
  -- A verified payment or validated free renewal is waiting for activation: do not ask again.
  or (a.deleted_at is null and not a.test_data and a.completed_at is null and a.answers->>'kind'='renewal' and (a.created_at at time zone 'Europe/London')::date>=p_expiry-30 and
    ((p.mode='live' and p.paid_at is not null and p.status in ('paid','partially_refunded','refunded','disputed')) or (a.fee_pence=0 and public.icsh_free_membership_eligible(a.id))))
  -- Don't send against a current term subsequently deleted, refunded or disputed.
  or (x.expiry_date=p_expiry and (a.test_data or a.deleted_at is not null or p.status in ('partially_refunded','refunded','disputed')))
 )));
$$;
create function public.icsh_renewal_notice_claim(p_contact text,p_expiry date,p_stage text,p_email text,p_claim uuid,p_test boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare x public.icsh_renewal_notices;days integer;st jsonb;
begin
 if p_claim is null or p_contact is null or p_email is null or p_expiry is null or p_stage is null or p_test is null or p_stage not in ('before30','before7','expired','after7') then return null;end if;
 if p_test then
  if p_contact<>'test-admin' or p_email<>'admin@icsh.org.uk' or not exists(select 1 from public.icsh_renewal_notice_settings where id and test_enabled and test_until>now()) then return null;end if;
 else
  st:=public.icsh_renewal_notice_state(p_contact,p_email,p_expiry);
  if (st->>'enabled')::boolean is not true or (st->>'held')::boolean is not false then return null;end if;
  days:=case p_stage when 'before30' then 30 when 'before7' then 7 when 'expired' then 0 else -7 end;
  if p_expiry-(now() at time zone 'Europe/London')::date<>days then return null;end if;
 end if;
 insert into public.icsh_renewal_notices(contact_id,expiry_date,stage,recipient,is_test,status,claim_id)
 values(p_contact,p_expiry,p_stage,p_email,p_test,'sending',p_claim) on conflict do nothing returning * into x;
 if x.id is not null then return jsonb_build_object('id',x.id,'token',p_claim);end if;
 -- Only an explicit rate-limit rejection can be retried. An abandoned/uncertain send never reclaims.
 if p_test then return null;end if;
 select * into x from public.icsh_renewal_notices where contact_id=p_contact and expiry_date=p_expiry and stage=p_stage and not is_test for update;
 if x.status='sending' and x.claimed_at<now()-interval '10 minutes' then
  update public.icsh_renewal_notices set status='review_required',error_code='NOTICE_OUTCOME_UNKNOWN',updated_at=now() where id=x.id;return null;
 end if;
 if x.status is distinct from 'retry' or x.recipient<>p_email or x.available_at>now() or x.attempts>=3 then return null;end if;
 update public.icsh_renewal_notices set status='sending',claim_id=p_claim,claimed_at=now(),attempts=attempts+1,updated_at=now() where id=x.id;
 return jsonb_build_object('id',x.id,'token',p_claim);
end $$;
create function public.icsh_renewal_notice_finish(p_id uuid,p_claim uuid,p_status text,p_provider text default null,p_error text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_status is null or p_status not in ('accepted','retry','failed','review_required','cancelled') or (p_provider is not null and p_provider!~'^[A-Za-z0-9_.-]{1,200}$') or (p_error is not null and p_error!~'^[A-Z][A-Z0-9_]{0,79}$') then return false;end if;
 update public.icsh_renewal_notices set status=p_status,provider_id=p_provider,error_code=p_error,available_at=now()+interval '1 hour',updated_at=now() where id=p_id and claim_id=p_claim and status='sending';
 return found;
end $$;
revoke all on function public.icsh_renewal_notice_state(text,text,date),public.icsh_renewal_notice_claim(text,date,text,text,uuid,boolean),public.icsh_renewal_notice_finish(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.icsh_renewal_notice_state(text,text,date),public.icsh_renewal_notice_claim(text,date,text,text,uuid,boolean),public.icsh_renewal_notice_finish(uuid,uuid,text,text,text) to service_role;
commit;
