-- Extend the existing durable activation state to verified zero-fee applications.
-- No existing application is activated by installing this migration.
begin;
alter table public.icsh_membership_activations add column activation_kind text not null default 'paid' check(activation_kind in ('paid','free'));
alter table public.icsh_membership_activations alter column payment_intent_id drop not null, alter column paid_at drop not null;
alter table public.icsh_membership_activations add constraint icsh_activation_evidence check(
 (activation_kind='paid' and payment_intent_id is not null and paid_at is not null)
 or (activation_kind='free' and account_id='free' and payment_intent_id is null and paid_at is null));
create function public.icsh_free_membership_eligible(p_id uuid) returns boolean language plpgsql stable security invoker set search_path='' as $$
declare a public.icsh_membership_applications;dob date;years integer;
begin
 select * into a from public.icsh_membership_applications where id=p_id;
 if a.id is null or a.deleted_at is not null or a.mode<>'live' or a.test_data or a.fee_pence<>0 or a.category<>'student' or a.payment_status<>'not_required'
  or a.answers->>'education' is distinct from 'yes' or a.answers->>'studentDeclaration' is distinct from 'true'
  or a.answers->>'terms' is distinct from 'true' or a.answers->>'accuracy' is distinct from 'true'
  or a.answers->>'dob' is null or a.answers->>'dob' !~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
  or (a.bigin_sync_status='synced' or (a.bigin_sync_status='review_required' and a.last_error_code='RENEWAL')) is not true then return false;end if;
 begin dob:=to_date(a.answers->>'dob','DD/MM/YYYY');exception when others then return false;end;
 if to_char(dob,'DD/MM/YYYY')<>a.answers->>'dob' then return false;end if;
 years:=extract(year from age((a.created_at at time zone 'Europe/London')::date,dob));
 return years between 17 and 21;
end $$;
create function public.icsh_free_membership_activation_claim(p_id uuid,p_claim uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.icsh_membership_applications;x public.icsh_membership_activations;starts date;
begin
 select * into a from public.icsh_membership_applications where id=p_id for update;
 if p_claim is null or not public.icsh_free_membership_eligible(p_id) then return null;end if;
 if exists(select 1 from public.icsh_membership_payments where application_id=p_id) then return null;end if;
 starts:=(now() at time zone 'Europe/London')::date;
 insert into public.icsh_membership_activations(application_id,account_id,payment_intent_id,paid_at,start_date,expiry_date,activation_kind)
 values(p_id,'free',null,null,starts,(starts+interval '1 year')::date,'free') on conflict(application_id) do nothing;
 select * into x from public.icsh_membership_activations where application_id=p_id for update;
 if x.activation_kind<>'free' then raise exception using errcode='40001',message='Activation category conflict';end if;
 if x.status in ('active','review_required') or (x.status='syncing' and x.lease_until>now()) or x.next_attempt_at>now() then return jsonb_build_object('claimed',false,'activation',to_jsonb(x));end if;
 update public.icsh_membership_activations set status='syncing',claim_id=p_claim,lease_until=now()+interval '3 minutes',attempts=attempts+1,error_code=null,updated_at=now() where application_id=p_id returning * into x;
 return jsonb_build_object('claimed',true,'activation',to_jsonb(x));
end $$;
create or replace function public.icsh_membership_activation_bind(p_id uuid,p_claim uuid,p_contact text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare a public.icsh_membership_applications;p public.icsh_membership_payments;x public.icsh_membership_activations;
begin
 select * into a from public.icsh_membership_applications where id=p_id for update;
 select * into p from public.icsh_membership_payments where application_id=p_id for update;
 select * into x from public.icsh_membership_activations where application_id=p_id for update;
 if a.deleted_at is not null or a.id is null or (x.activation_kind='paid' and p.status is distinct from 'paid') or (x.activation_kind='free' and not public.icsh_free_membership_eligible(p_id)) or x.status is distinct from 'syncing' or x.claim_id is distinct from p_claim or x.lease_until<=now() or (x.activation_kind='paid' and p.payment_intent_id<>x.payment_intent_id) or p_contact is null or p_contact !~ '^[1-9][0-9]{0,29}$' or (x.contact_id is not null and x.contact_id<>p_contact) or (a.bigin_record_id is not null and a.bigin_record_id<>p_contact) then return false;end if;
 update public.icsh_membership_activations set status='failed',claim_id=null,lease_until=null,error_code='ACTIVATION_LEASE_EXPIRED',updated_at=now() where contact_id=p_contact and application_id<>p_id and status='syncing' and lease_until<=now();
 update public.icsh_membership_activations set contact_id=p_contact,updated_at=now() where application_id=p_id;return true;
end $$;
create or replace function public.icsh_membership_activation_finish(p_id uuid,p_claim uuid,p_status text,p_error text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.icsh_membership_applications;p public.icsh_membership_payments;x public.icsh_membership_activations;outcome text;
begin
 select * into a from public.icsh_membership_applications where id=p_id for update;
 select * into p from public.icsh_membership_payments where application_id=p_id for update;
 select * into x from public.icsh_membership_activations where application_id=p_id for update;
 if x.status is distinct from 'syncing' or x.claim_id is distinct from p_claim or x.lease_until<=now() or p_status is null or p_status not in ('active','failed','review_required') or (p_error is not null and p_error !~ '^[A-Z][A-Z0-9_]{0,79}$') then raise exception using errcode='40001',message='Activation claim conflict';end if;
 outcome:=case when a.deleted_at is not null or (x.activation_kind='paid' and p.status is distinct from 'paid') or (x.activation_kind='free' and not public.icsh_free_membership_eligible(p_id)) then 'review_required' else p_status end;
 if outcome='active' and x.contact_id is null then raise exception using errcode='22023',message='Activation contact required';end if;
 update public.icsh_membership_activations set status=outcome,claim_id=null,lease_until=null,error_code=case when outcome<>p_status then 'PAYMENT_OR_APPLICATION_CHANGED' else p_error end,next_attempt_at=now()+interval '1 minute',activated_at=case when outcome='active' then now() else activated_at end,updated_at=now() where application_id=p_id returning * into x;
 if outcome='active' then update public.icsh_membership_applications set bigin_record_id=x.contact_id,bigin_sync_status='synced',bigin_synced_at=coalesce(bigin_synced_at,now()),last_error_code=null,updated_at=now() where id=p_id;end if;
 insert into public.icsh_audit_events(action,record_id) values('membership.activation.'||outcome,p_id::text);
 return to_jsonb(x);
end $$;
create function public.icsh_free_membership_activation_candidates()
returns table(application_id uuid) language sql stable security invoker set search_path='' as $$
 select a.id from public.icsh_membership_applications a left join public.icsh_membership_activations x on x.application_id=a.id
 where a.mode='live' and a.deleted_at is null and a.fee_pence=0 and public.icsh_free_membership_eligible(a.id)
 and (x.application_id is null or (x.activation_kind='free' and x.status in ('pending','failed','syncing') and x.next_attempt_at<=now() and (x.lease_until is null or x.lease_until<=now())))
 order by a.created_at,a.id limit 5;
$$;
revoke execute on function public.icsh_free_membership_eligible(uuid),public.icsh_free_membership_activation_claim(uuid,uuid),public.icsh_free_membership_activation_candidates() from public,anon,authenticated;
grant execute on function public.icsh_free_membership_eligible(uuid),public.icsh_free_membership_activation_claim(uuid,uuid),public.icsh_free_membership_activation_candidates() to service_role;

create function public.icsh_queue_free_membership_email() returns trigger language plpgsql security invoker set search_path='' as $$
declare a public.icsh_membership_applications;recipient text;
begin
 if new.activation_kind<>'free' or new.status<>'active' or new.activated_at is null or not public.icsh_free_membership_eligible(new.application_id)
  or not exists(select 1 from public.icsh_form_email_settings where id and enabled) then return new;end if;
 select * into a from public.icsh_membership_applications where id=new.application_id;
 recipient:=lower(trim(a.answers->>'email'));
 if recipient is null or length(recipient)>254 or recipient!~'^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
  or recipient~'[[:cntrl:]]' or recipient~'\.(invalid|test|example|localhost)$' or recipient~'@([^@]+\.)?example\.(com|org|net)$' then return new;end if;
 insert into public.icsh_form_emails(source_table,source_id,kind,recipient,reference)
 values('membership_active',a.id,'membership_active',recipient,replace(a.reference,'TEST-MEM-','MEM-')) on conflict(source_table,source_id) do nothing;
 return new;
end $$;
revoke execute on function public.icsh_queue_free_membership_email() from public,anon,authenticated;
grant execute on function public.icsh_queue_free_membership_email() to service_role;
create trigger icsh_free_membership_activation_email after insert or update on public.icsh_membership_activations for each row execute function public.icsh_queue_free_membership_email();
create or replace function public.icsh_membership_email_eligible(p_id uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(
  select 1 from public.icsh_form_emails e
  join public.icsh_membership_applications a on a.id=e.source_id
  left join public.icsh_membership_payments p on p.application_id=a.id
  left join public.icsh_membership_activations x on x.application_id=a.id
  where e.id=p_id and a.mode='live' and not a.test_data and a.deleted_at is null 
   and case when e.kind='membership_reminder' then
    a.fee_pence>0 and p.paid_at is null and (p.status is null or p.status in ('failed','expired') or (p.status='pending' and not exists(select 1 from public.icsh_membership_payment_events pe where pe.application_id=a.id and pe.event_type='checkout.session.completed')))
   when e.kind='membership_active' then
    ((x.activation_kind='free' and public.icsh_free_membership_eligible(a.id) and x.account_id='free' and p.application_id is null) or (x.activation_kind='paid' and a.fee_pence>0 and p.mode='live' and p.status='paid' and p.amount=a.fee_pence and p.currency='gbp' and p.charge_id is not null
    and x.account_id=p.account_id and x.payment_intent_id=p.payment_intent_id and x.paid_at=p.paid_at))
    and x.status='active' and x.activated_at is not null and x.contact_id is not null
   else false end
 );
$$;
create or replace function public.icsh_membership_email_details(p_id uuid,p_claim uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('membership_number',m.member_id,'activation_kind',x.activation_kind,
   'start_date',x.start_date::text,'expiry_date',x.expiry_date::text)
 from public.icsh_form_emails e
 join public.icsh_membership_applications a on a.id=e.source_id
 join public.icsh_membership_activations x on x.application_id=a.id
 join public.icsh_member_ids m on m.contact_id=x.contact_id
 where e.id=p_id and e.kind='membership_active' and e.status='sending'
   and e.claim_id=p_claim and m.confirmed_at is not null
   and lower(trim(a.answers->>'email'))=e.recipient
   and x.expiry_date>=x.start_date
   and public.icsh_membership_email_eligible(e.id);
$$;
commit;
