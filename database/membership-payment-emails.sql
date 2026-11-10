-- Supersedes application-received membership mail. No historical backfill.
begin;
alter table public.icsh_form_emails drop constraint icsh_form_emails_kind_check;
alter table public.icsh_form_emails add constraint icsh_form_emails_kind_check
 check(kind in ('membership','membership_active','membership_reminder','donation','rishta','event','stall'));
drop trigger icsh_membership_confirmation on public.icsh_membership_applications;
update public.icsh_form_emails set status='failed',error_code='MEMBERSHIP_POLICY_SUPERSEDED' where kind='membership' and status in ('pending','retry');

create function public.icsh_queue_membership_payment_email() returns trigger language plpgsql security invoker set search_path='' as $$
declare a public.icsh_membership_applications;p public.icsh_membership_payments; recipient text; k text; due timestamptz;
begin
 if tg_table_name='icsh_membership_applications' then
  a:=new;k:='membership_reminder';due:=now()+interval '24 hours';
 else
  select * into a from public.icsh_membership_applications where id=new.application_id;
  select * into p from public.icsh_membership_payments where application_id=new.application_id;
  if p.paid_at is not null or p.status in ('paid','partially_refunded','refunded','disputed') then
   update public.icsh_form_emails set status='failed',error_code='REMINDER_NO_LONGER_REQUIRED'
   where source_id=a.id and kind='membership_reminder' and status in ('pending','retry');
  end if;
  if tg_table_name='icsh_membership_payments' then
   if p.status not in ('failed','expired') or p.paid_at is not null then return new;end if;
   k:='membership_reminder';due:=now()+interval '30 minutes';
  else
   if new.status<>'active' or p.status is distinct from 'paid' or p.paid_at is null or p.mode<>'live'
    or p.account_id<>new.account_id or p.payment_intent_id<>new.payment_intent_id or p.paid_at<>new.paid_at
    or p.charge_id is null or p.amount<>a.fee_pence or p.currency<>'gbp' then return new;end if;
   k:='membership_active';due:=now();
  end if;
 end if;
 if not exists(select 1 from public.icsh_form_email_settings where id and enabled)
  or a.id is null or a.deleted_at is not null or a.mode<>'live' or a.test_data or a.fee_pence<=0 then return new;end if;
 recipient:=lower(trim(a.answers->>'email'));
 if recipient is null or length(recipient)>254 or recipient!~'^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
  or recipient~'[[:cntrl:]]' or recipient~'\.(invalid|test|example|localhost)$'
  or recipient~'@([^@]+\.)?example\.(com|org|net)$' then return new;end if;
 insert into public.icsh_form_emails(source_table,source_id,kind,recipient,reference,available_at)
 values(k,a.id,k,recipient,replace(a.reference,'TEST-MEM-','MEM-'),due)
 on conflict(source_table,source_id) do update set available_at=least(public.icsh_form_emails.available_at,excluded.available_at)
 where public.icsh_form_emails.status in ('pending','retry');
 return new;
end $$;
revoke execute on function public.icsh_queue_membership_payment_email() from public,anon,authenticated;
grant execute on function public.icsh_queue_membership_payment_email() to service_role;
create trigger icsh_membership_payment_reminder after insert on public.icsh_membership_applications for each row execute function public.icsh_queue_membership_payment_email();
create trigger icsh_membership_payment_email after insert or update on public.icsh_membership_payments for each row execute function public.icsh_queue_membership_payment_email();
create trigger icsh_membership_activation_email after insert or update on public.icsh_membership_activations for each row execute function public.icsh_queue_membership_payment_email();

create function public.icsh_membership_email_eligible(p_id uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(
  select 1 from public.icsh_form_emails e
  join public.icsh_membership_applications a on a.id=e.source_id
  left join public.icsh_membership_payments p on p.application_id=a.id
  left join public.icsh_membership_activations x on x.application_id=a.id
  where e.id=p_id and a.mode='live' and not a.test_data and a.deleted_at is null and a.fee_pence>0
   and case when e.kind='membership_reminder' then
    p.paid_at is null and (p.status is null or p.status in ('failed','expired') or (p.status='pending' and not exists(select 1 from public.icsh_membership_payment_events pe where pe.application_id=a.id and pe.event_type='checkout.session.completed')))
   when e.kind='membership_active' then
    p.mode='live' and p.status='paid' and p.amount=a.fee_pence and p.currency='gbp' and p.charge_id is not null
    and x.status='active' and x.activated_at is not null and x.contact_id is not null
    and x.account_id=p.account_id and x.payment_intent_id=p.payment_intent_id and x.paid_at=p.paid_at
   else false end
 );
$$;
revoke execute on function public.icsh_membership_email_eligible(uuid) from public,anon,authenticated;
grant execute on function public.icsh_membership_email_eligible(uuid) to service_role;

create or replace function public.icsh_form_email_claim(p_claim uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.icsh_form_emails;
begin
 if p_claim is null or not exists(select 1 from public.icsh_form_email_settings where id and enabled) then return null;end if;
 update public.icsh_form_emails set status='review_required',error_code='EMAIL_OUTCOME_UNKNOWN' where status='sending' and claimed_at<now()-interval '5 minutes';
 -- Expiry starts at scheduled eligibility, so a delayed reminder is not stale on arrival.
 update public.icsh_form_emails set status='failed',error_code='EMAIL_STALE' where status in ('pending','retry') and greatest(created_at,available_at)<now()-interval '48 hours';
 update public.icsh_form_emails e set status='failed',error_code='MEMBERSHIP_STATE_CHANGED'
 where status in ('pending','retry') and kind in ('membership_active','membership_reminder') and not public.icsh_membership_email_eligible(e.id);
 select * into item from public.icsh_form_emails where status in ('pending','retry') and available_at<=now() order by available_at,created_at,id for update skip locked limit 1;
 if item.id is null then return null;end if;
 update public.icsh_form_emails set status='sending',claim_id=p_claim,claimed_at=now(),attempts=attempts+1 where id=item.id;
 return jsonb_build_object('id',item.id,'kind',item.kind,'recipient',item.recipient,'reference',item.reference,'event_title',item.event_title);
end $$;
commit;
