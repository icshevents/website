-- Retire launch-only pricing and artificial terms. Historical records are unchanged.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
CREATE OR REPLACE FUNCTION public.icsh_free_membership_activation_claim(p_id uuid, p_claim uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a public.icsh_membership_applications;x public.icsh_membership_activations;starts date;expires date;
begin
 select * into a from public.icsh_membership_applications where id=p_id for update;
 if p_claim is null or not public.icsh_free_membership_eligible(p_id) then return null;end if;
 if exists(select 1 from public.icsh_membership_payments where application_id=p_id) then return null;end if;
 starts:=(now() at time zone 'Europe/London')::date;expires:=(starts+interval '1 year')::date;
 insert into public.icsh_membership_activations(application_id,account_id,payment_intent_id,paid_at,start_date,expiry_date,activation_kind)
 values(p_id,'free',null,null,starts,expires,'free') on conflict(application_id) do nothing;
 select * into x from public.icsh_membership_activations where application_id=p_id for update;
 if x.activation_kind<>'free' then raise exception using errcode='40001',message='Activation category conflict';end if;
 if x.status in ('active','review_required') or (x.status='syncing' and x.lease_until>now()) or x.next_attempt_at>now() then return jsonb_build_object('claimed',false,'activation',to_jsonb(x));end if;
 update public.icsh_membership_activations set status='syncing',claim_id=p_claim,lease_until=now()+interval '3 minutes',attempts=attempts+1,error_code=null,updated_at=now() where application_id=p_id returning * into x;
 return jsonb_build_object('claimed',true,'activation',to_jsonb(x));
end $function$
;
CREATE OR REPLACE FUNCTION public.icsh_free_membership_eligible(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
 return coalesce(a.category='student' and a.answers->>'education'='yes' and a.answers->>'studentDeclaration'='true' and years between 17 and 21,false);
end $function$
;
CREATE OR REPLACE FUNCTION public.icsh_membership_payment_prepare(p_application_id uuid, p_account_id text, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a public.icsh_membership_applications; p public.icsh_membership_payments;
begin
 select * into a from public.icsh_membership_applications where id=p_application_id for update;
 if a.id is null or a.mode is distinct from p_mode or a.fee_pence not in (1500,2000)
   or a.currency<>'GBP' or a.payment_status<>'awaiting_payment'
   or not ((a.category='standard' and a.fee_pence=2000) or (a.category='pensioner' and a.fee_pence=1500) ) then
   raise exception using errcode='22023',message='Invalid payment application';
 end if;
 insert into public.icsh_membership_payments(application_id,account_id,mode,amount)
 values(a.id,p_account_id,p_mode,a.fee_pence) on conflict(application_id) do nothing;
 select * into p from public.icsh_membership_payments where application_id=a.id;
 if p.account_id is distinct from p_account_id or p.mode is distinct from p_mode or p.amount<>a.fee_pence then
   raise exception using errcode='40001',message='Payment configuration changed';
 end if;
 return to_jsonb(p);
end $function$
;
revoke all on function public.icsh_free_membership_eligible(uuid),public.icsh_free_membership_activation_claim(uuid,uuid),public.icsh_membership_payment_prepare(uuid,text,text) from public,anon,authenticated;
grant execute on function public.icsh_free_membership_eligible(uuid),public.icsh_free_membership_activation_claim(uuid,uuid),public.icsh_membership_payment_prepare(uuid,text,text) to service_role;
commit;

