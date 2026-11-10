-- Preserve completed applications while reserving one pending application per identity.
-- The launch rehearsal is limited to Test Test applications created on 28 October 2026.
begin;
set local lock_timeout='5s';
alter table public.icsh_membership_applications add column completed_at timestamptz;
create function public.icsh_membership_application_completed()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='active' and new.activated_at is not null and new.contact_id is not null then
  update public.icsh_membership_applications set completed_at=coalesce(completed_at,new.activated_at),updated_at=now() where id=new.application_id;
 end if;
 return new;
end $$;
revoke execute on function public.icsh_membership_application_completed() from public,anon,authenticated;
grant execute on function public.icsh_membership_application_completed() to service_role;
create trigger icsh_membership_application_completed after insert or update on public.icsh_membership_activations for each row execute function public.icsh_membership_application_completed();
update public.icsh_membership_applications a set completed_at=x.activated_at
from public.icsh_membership_activations x where a.id=x.application_id and x.status='active' and x.activated_at is not null;
drop index public.icsh_membership_application_email_unique;
drop index public.icsh_membership_application_phone_unique;
create unique index icsh_membership_application_email_unique on public.icsh_membership_applications(mode,lower(btrim(answers->>'email'))) where deleted_at is null and completed_at is null;
create unique index icsh_membership_application_phone_unique on public.icsh_membership_applications(mode,public.icsh_membership_mobile_key(answers->>'mobile')) where deleted_at is null and completed_at is null;
-- Existing retry functions must select only the current pending application.
do $$declare definition text;begin
 select pg_get_functiondef('public.icsh_membership_application_resume(jsonb,text,integer,text)'::regprocedure) into definition;
 if position('mode=''live'' and deleted_at is null' in definition)=0 then raise exception 'Unexpected application retry definition';end if;
 execute replace(definition,'mode=''live'' and deleted_at is null','mode=''live'' and deleted_at is null and completed_at is null');
 select pg_get_functiondef('public.icsh_membership_retry_identity(jsonb)'::regprocedure) into definition;
 if position('a.mode=''live'' and a.deleted_at is null' in definition)=0 then raise exception 'Unexpected identity retry definition';end if;
 execute replace(definition,'a.mode=''live'' and a.deleted_at is null','a.mode=''live'' and a.deleted_at is null and a.completed_at is null');
end $$;
create or replace function public.icsh_free_membership_eligible(p_id uuid)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare a public.icsh_membership_applications;dob date;years integer;created date;
begin
 select * into a from public.icsh_membership_applications where id=p_id;
 if a.id is null or a.deleted_at is not null or a.mode<>'live' or a.test_data or a.fee_pence<>0 or a.payment_status<>'not_required'
  or a.answers->>'terms' is distinct from 'true' or a.answers->>'accuracy' is distinct from 'true'
  or a.answers->>'dob' is null or a.answers->>'dob' !~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
  or (a.bigin_sync_status='synced' or (a.bigin_sync_status='review_required' and a.last_error_code='RENEWAL')) is not true then return false;end if;
 begin dob:=to_date(a.answers->>'dob','DD/MM/YYYY');exception when others then return false;end;
 created:=(a.created_at at time zone 'Europe/London')::date;
 if to_char(dob,'DD/MM/YYYY')<>a.answers->>'dob' or dob<'1900-01-01' or dob>created then return false;end if;
 years:=extract(year from age(created,dob));
 if a.category='standard' and created='2026-10-28' and lower(trim(a.answers->>'firstName'))='test' and lower(trim(a.answers->>'lastName'))='test'
  and a.answers->>'kind' in ('new','renewal') and years>=17 then return true;end if;
 return coalesce(a.category='student' and a.answers->>'education'='yes' and a.answers->>'studentDeclaration'='true' and years between 17 and 21,false);
end $$;
create or replace function public.icsh_free_membership_activation_claim(p_id uuid,p_claim uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.icsh_membership_applications;x public.icsh_membership_activations;starts date;expires date;
begin
 select * into a from public.icsh_membership_applications where id=p_id for update;
 if p_claim is null or not public.icsh_free_membership_eligible(p_id) then return null;end if;
 if exists(select 1 from public.icsh_membership_payments where application_id=p_id) then return null;end if;
 starts:=(now() at time zone 'Europe/London')::date;expires:=(starts+interval '1 year')::date;
 if a.category='standard' and (a.created_at at time zone 'Europe/London')::date='2026-10-28'
  and lower(trim(a.answers->>'firstName'))='test' and lower(trim(a.answers->>'lastName'))='test' and a.answers->>'kind'='new' then
  -- A completed historic term gives the real renewal rules a valid expired record.
  starts:='2025-10-28';expires:='2026-10-28';
 end if;
 insert into public.icsh_membership_activations(application_id,account_id,payment_intent_id,paid_at,start_date,expiry_date,activation_kind)
 values(p_id,'free',null,null,starts,expires,'free') on conflict(application_id) do nothing;
 select * into x from public.icsh_membership_activations where application_id=p_id for update;
 if x.activation_kind<>'free' then raise exception using errcode='40001',message='Activation category conflict';end if;
 if x.status in ('active','review_required') or (x.status='syncing' and x.lease_until>now()) or x.next_attempt_at>now() then return jsonb_build_object('claimed',false,'activation',to_jsonb(x));end if;
 update public.icsh_membership_activations set status='syncing',claim_id=p_claim,lease_until=now()+interval '3 minutes',attempts=attempts+1,error_code=null,updated_at=now() where application_id=p_id returning * into x;
 return jsonb_build_object('claimed',true,'activation',to_jsonb(x));
end $$;
-- CREATE OR REPLACE preserves the existing restricted grants; assert the boundary.
revoke execute on function public.icsh_free_membership_eligible(uuid),public.icsh_free_membership_activation_claim(uuid,uuid) from public,anon,authenticated;
grant execute on function public.icsh_free_membership_eligible(uuid),public.icsh_free_membership_activation_claim(uuid,uuid) to service_role;
commit;
