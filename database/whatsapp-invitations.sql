-- Local setup draft only. Not applied to production; feature remains disabled.
-- Requires existing membership applications, payments, activations and mobile-key helper.
begin;
create table public.icsh_whatsapp_invitations (
 application_id uuid primary key references public.icsh_membership_applications(id),
 claim_token uuid not null unique,
 request jsonb not null check(jsonb_typeof(request)='object' and octet_length(request::text)<=3000),
 status text not null default 'claimed' check(status in ('claimed','request_accepted','rejected','review_required','cancelled')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index icsh_whatsapp_invitation_status_idx on public.icsh_whatsapp_invitations(status,created_at);
alter table public.icsh_whatsapp_invitations enable row level security;
revoke all on public.icsh_whatsapp_invitations from public,anon,authenticated,service_role;
grant select,insert,update on public.icsh_whatsapp_invitations to service_role;

-- No lease or expiry: an abandoned claim may already have caused a provider side effect.
-- Only verified server calls may claim; browser roles cannot invoke these functions.
create function public.icsh_whatsapp_invitation_claim(p_id uuid,p_token uuid,p_request jsonb,p_applications_from timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.icsh_membership_applications;p public.icsh_membership_payments;x public.icsh_membership_activations;
 saved public.icsh_whatsapp_invitations;keys integer;today date:=(now() at time zone 'Europe/London')::date;
begin
 if p_id is null or p_token is null or p_applications_from is null or p_request is null or
  jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>3000 then
  raise exception using errcode='22023',message='Invalid invitation request';
 end if;
 select count(*) into keys from jsonb_object_keys(p_request);
 if keys<>10 or not(p_request ?& array['applicationId','contactId','recipient','paymentIntentId','startDate','expiryDate','templateName','category','sender','accountId']) or
  exists(select 1 from jsonb_each(p_request) e where jsonb_typeof(e.value)<>'string') or
  (p_request->>'applicationId') is distinct from p_id::text or
  (p_request->>'contactId') !~ '^[1-9][0-9]{0,29}$' or
  (p_request->>'recipient') !~ '^\+[1-9][0-9]{6,14}$' or
  (p_request->>'sender') !~ '^\+[1-9][0-9]{6,14}$' or
  (p_request->>'sender')=(p_request->>'recipient') or
  (p_request->>'templateName') !~ '^icsh_[a-z0-9_]{1,100}$' or
  (p_request->>'category') not in ('utility','marketing') then
  raise exception using errcode='22023',message='Invalid invitation request';
 end if;
 -- Use the same lock order as membership activation and payment reconciliation.
 select * into a from public.icsh_membership_applications where id=p_id for update;
 select * into p from public.icsh_membership_payments where application_id=p_id for update;
 select * into x from public.icsh_membership_activations where application_id=p_id for update;
 if a.id is null or p.application_id is null or x.application_id is null or a.deleted_at is not null or
  a.mode<>'live' or a.test_data is distinct from false or a.created_at<p_applications_from or
  a.answers->'whatsappInvitation' is distinct from 'true'::jsonb or a.answers->>'kind' not in ('new','renewal') or
  not((a.category='standard' and a.fee_pence=2000) or (a.category='pensioner' and a.fee_pence=1500) or
   (a.category in ('standard','pensioner') and a.fee_pence=100 and coalesce(lower(btrim(a.answers->>'email')),'')='events.icsh@gmail.com')) or
  a.currency<>'GBP' or p.mode<>'live' or p.status is distinct from 'paid' or p.refunded_amount<>0 or
  p.amount<>a.fee_pence or p.currency<>'gbp' or p.paid_at is null or p.payment_intent_id is null or p.charge_id is null or
  x.status is distinct from 'active' or x.activation_kind is distinct from 'paid' or x.account_id<>p.account_id or
  x.payment_intent_id is distinct from p.payment_intent_id or x.paid_at is distinct from p.paid_at or
  a.bigin_sync_status<>'synced' or a.bigin_record_id is distinct from x.contact_id or x.contact_id is null or
  x.start_date<>(p.paid_at at time zone 'Europe/London')::date or x.start_date>today or x.expiry_date<=today or
  x.contact_id is distinct from p_request->>'contactId' or p.account_id is distinct from p_request->>'accountId' or
  p.payment_intent_id is distinct from p_request->>'paymentIntentId' or x.start_date::text is distinct from p_request->>'startDate' or
  x.expiry_date::text is distinct from p_request->>'expiryDate' or
  public.icsh_membership_mobile_key(a.answers->>'mobile') is distinct from substr(p_request->>'recipient',2) then return null;end if;
 insert into public.icsh_whatsapp_invitations(application_id,claim_token,request)
  values(p_id,p_token,p_request) on conflict(application_id) do nothing returning * into saved;
 if saved.application_id is null then return null;end if;
 return jsonb_build_object('token',saved.claim_token);
end $$;

create function public.icsh_whatsapp_invitation_finish(p_id uuid,p_token uuid,p_status text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare x public.icsh_whatsapp_invitations;
begin
 if p_status is null or p_status not in ('request_accepted','rejected','review_required','cancelled') then
  raise exception using errcode='22023',message='Invalid invitation outcome';end if;
 select * into x from public.icsh_whatsapp_invitations where application_id=p_id for update;
 if x.application_id is null or x.claim_token is distinct from p_token then
  raise exception using errcode='40001',message='Invitation claim conflict';end if;
 if x.status=p_status then return true;end if;
 if x.status<>'claimed' then raise exception using errcode='40001',message='Invitation already finished';end if;
 update public.icsh_whatsapp_invitations set status=p_status,updated_at=now() where application_id=p_id;
 return true;
end $$;

create function public.icsh_whatsapp_invitation_candidates(p_account text,p_applications_from timestamptz)
returns table(application_id uuid) language sql security invoker set search_path='' as $$
 select a.id from public.icsh_membership_applications a
 join public.icsh_membership_payments p on p.application_id=a.id
 join public.icsh_membership_activations x on x.application_id=a.id
 left join public.icsh_whatsapp_invitations w on w.application_id=a.id
 where w.application_id is null and a.deleted_at is null and a.mode='live' and a.test_data=false and
  a.created_at>=p_applications_from and a.answers->'whatsappInvitation'='true'::jsonb and
  ((a.category='standard' and a.fee_pence=2000) or (a.category='pensioner' and a.fee_pence=1500) or
   (a.category in ('standard','pensioner') and a.fee_pence=100 and coalesce(lower(btrim(a.answers->>'email')),'')='events.icsh@gmail.com')) and
  p.account_id=p_account and p.mode='live' and p.status='paid' and p.refunded_amount=0 and p.amount=a.fee_pence and
  x.status='active' and x.activation_kind='paid' and x.contact_id=a.bigin_record_id and
  x.start_date<=(now() at time zone 'Europe/London')::date and x.expiry_date>(now() at time zone 'Europe/London')::date
 order by p.paid_at,a.id limit 5;
$$;
revoke execute on function public.icsh_whatsapp_invitation_claim(uuid,uuid,jsonb,timestamptz),
 public.icsh_whatsapp_invitation_finish(uuid,uuid,text),public.icsh_whatsapp_invitation_candidates(text,timestamptz)
 from public,anon,authenticated;
grant execute on function public.icsh_whatsapp_invitation_claim(uuid,uuid,jsonb,timestamptz),
 public.icsh_whatsapp_invitation_finish(uuid,uuid,text),public.icsh_whatsapp_invitation_candidates(text,timestamptz)
 to service_role;
commit;
