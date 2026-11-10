begin;
create table public.icsh_membership_activations(
 application_id uuid primary key references public.icsh_membership_applications(id),
 account_id text not null, payment_intent_id text not null unique, paid_at timestamptz not null,
 start_date date not null,expiry_date date not null check(expiry_date>start_date),
 contact_id text check(contact_id ~ '^[1-9][0-9]{0,29}$'),
 status text not null default 'pending' check(status in ('pending','syncing','active','failed','review_required')),
 claim_id uuid,lease_until timestamptz,attempts integer not null default 0,
 error_code text check(error_code ~ '^[A-Z][A-Z0-9_]{0,79}$'),
 next_attempt_at timestamptz not null default now(),activated_at timestamptz,updated_at timestamptz not null default now(),
 check((status='syncing')=(claim_id is not null and lease_until is not null)),
 check(status<>'active' or (contact_id is not null and activated_at is not null))
);
create unique index icsh_membership_activation_contact_lease on public.icsh_membership_activations(contact_id) where status='syncing';
alter table public.icsh_membership_activations enable row level security;
revoke all on public.icsh_membership_activations from public,anon,authenticated,service_role;
grant select,insert,update on public.icsh_membership_activations to service_role;
create function public.icsh_membership_activation_claim(p_id uuid,p_account text,p_claim uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.icsh_membership_applications;p public.icsh_membership_payments;x public.icsh_membership_activations;starts date;
begin
 select * into a from public.icsh_membership_applications where id=p_id for update;
 select * into p from public.icsh_membership_payments where application_id=p_id for update;
 if a.id is null or a.deleted_at is not null or a.mode<>'live' or a.fee_pence<=0 or p.status is distinct from 'paid' or p.mode<>'live' or p.account_id<>p_account or p.amount<>a.fee_pence or p.currency<>'gbp' or p.paid_at is null or p.payment_intent_id is null or p.charge_id is null or p_claim is null then return null;end if;
 if a.bigin_sync_status='syncing' and a.sync_lease_until>now() then raise exception using errcode='40001',message='Contact delivery in progress';end if;
 starts:=(p.paid_at at time zone 'Europe/London')::date;
 insert into public.icsh_membership_activations(application_id,account_id,payment_intent_id,paid_at,start_date,expiry_date)
 values(p_id,p.account_id,p.payment_intent_id,p.paid_at,starts,(starts+interval '1 year')::date) on conflict(application_id) do nothing;
 select * into x from public.icsh_membership_activations where application_id=p_id for update;
 if x.account_id<>p.account_id or x.payment_intent_id<>p.payment_intent_id or x.paid_at<>p.paid_at then raise exception using errcode='40001',message='Activation payment conflict';end if;
 if x.status in ('active','review_required') then return jsonb_build_object('claimed',false,'activation',to_jsonb(x));end if;
 if x.status='syncing' and x.lease_until>now() or x.next_attempt_at>now() then return jsonb_build_object('claimed',false,'activation',to_jsonb(x));end if;
 update public.icsh_membership_activations set status='syncing',claim_id=p_claim,lease_until=now()+interval '3 minutes',attempts=attempts+1,error_code=null,updated_at=now() where application_id=p_id returning * into x;
 return jsonb_build_object('claimed',true,'activation',to_jsonb(x));
end $$;
create function public.icsh_membership_activation_bind(p_id uuid,p_claim uuid,p_contact text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare a public.icsh_membership_applications;p public.icsh_membership_payments;x public.icsh_membership_activations;
begin
 select * into a from public.icsh_membership_applications where id=p_id for update;
 select * into p from public.icsh_membership_payments where application_id=p_id for update;
 select * into x from public.icsh_membership_activations where application_id=p_id for update;
 if a.deleted_at is not null or a.id is null or p.status is distinct from 'paid' or x.status is distinct from 'syncing' or x.claim_id is distinct from p_claim or x.lease_until<=now() or p.payment_intent_id<>x.payment_intent_id or p_contact is null or p_contact !~ '^[1-9][0-9]{0,29}$' or (x.contact_id is not null and x.contact_id<>p_contact) or (a.bigin_record_id is not null and a.bigin_record_id<>p_contact) then return false;end if;
 update public.icsh_membership_activations set status='failed',claim_id=null,lease_until=null,error_code='ACTIVATION_LEASE_EXPIRED',updated_at=now() where contact_id=p_contact and application_id<>p_id and status='syncing' and lease_until<=now();
 update public.icsh_membership_activations set contact_id=p_contact,updated_at=now() where application_id=p_id;return true;
end $$;
create function public.icsh_membership_activation_finish(p_id uuid,p_claim uuid,p_status text,p_error text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.icsh_membership_applications;p public.icsh_membership_payments;x public.icsh_membership_activations;outcome text;
begin
 select * into a from public.icsh_membership_applications where id=p_id for update;
 select * into p from public.icsh_membership_payments where application_id=p_id for update;
 select * into x from public.icsh_membership_activations where application_id=p_id for update;
 if x.status is distinct from 'syncing' or x.claim_id is distinct from p_claim or x.lease_until<=now() or p_status is null or p_status not in ('active','failed','review_required') or (p_error is not null and p_error !~ '^[A-Z][A-Z0-9_]{0,79}$') then raise exception using errcode='40001',message='Activation claim conflict';end if;
 outcome:=case when a.deleted_at is not null or p.status is distinct from 'paid' then 'review_required' else p_status end;
 if outcome='active' and x.contact_id is null then raise exception using errcode='22023',message='Activation contact required';end if;
 update public.icsh_membership_activations set status=outcome,claim_id=null,lease_until=null,error_code=case when outcome<>p_status then 'PAYMENT_OR_APPLICATION_CHANGED' else p_error end,next_attempt_at=now()+interval '1 minute',activated_at=case when outcome='active' then now() else activated_at end,updated_at=now() where application_id=p_id returning * into x;
 if outcome='active' then update public.icsh_membership_applications set bigin_record_id=x.contact_id,bigin_sync_status='synced',bigin_synced_at=coalesce(bigin_synced_at,now()),last_error_code=null,updated_at=now() where id=p_id;end if;
 insert into public.icsh_audit_events(action,record_id) values('membership.activation.'||outcome,p_id::text);
 return to_jsonb(x);
end $$;
create function public.icsh_membership_activation_candidates(p_account text)
returns table(application_id uuid) language sql security invoker set search_path='' as $$
 select p.application_id from public.icsh_membership_payments p join public.icsh_membership_applications a on a.id=p.application_id left join public.icsh_membership_activations x on x.application_id=p.application_id
 where p.status='paid' and p.mode='live' and p.account_id=p_account and a.deleted_at is null and (x.application_id is null or (x.status in ('pending','failed','syncing') and x.next_attempt_at<=now() and (x.lease_until is null or x.lease_until<=now()))) order by p.paid_at,p.application_id limit 5;
$$;
revoke execute on function public.icsh_membership_activation_candidates(text) from public,anon,authenticated;
grant execute on function public.icsh_membership_activation_candidates(text) to service_role;
revoke execute on function public.icsh_membership_activation_claim(uuid,text,uuid),public.icsh_membership_activation_bind(uuid,uuid,text),public.icsh_membership_activation_finish(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.icsh_membership_activation_claim(uuid,text,uuid),public.icsh_membership_activation_bind(uuid,uuid,text),public.icsh_membership_activation_finish(uuid,uuid,text,text) to service_role;
commit;
