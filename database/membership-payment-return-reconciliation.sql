begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table public.icsh_membership_payment_events drop constraint icsh_membership_payment_events_event_id_check;
alter table public.icsh_membership_payment_events add constraint icsh_membership_payment_events_event_id_check check(event_id ~ '^(evt_[A-Za-z0-9]+|reconcile_[a-f0-9]{64})$');
CREATE OR REPLACE FUNCTION public.icsh_membership_payment_record(p_application_id uuid, p_account_id text, p_mode text, p_session_id text, p_event_id text, p_event_type text, p_status text, p_amount integer, p_payment_intent_id text DEFAULT NULL::text, p_charge_id text DEFAULT NULL::text, p_paid_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_refunded_amount integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare p public.icsh_membership_payments; prior public.icsh_membership_payment_events;
begin
 select * into p from public.icsh_membership_payments where application_id=p_application_id for update;
 if p.application_id is null or p.account_id is distinct from p_account_id or p.mode is distinct from p_mode
   or p.amount is distinct from p_amount or p_session_id is null
   or (p.session_id is not null and p.session_id<>p_session_id)
   or p_event_id is null or not (
    (p_event_id ~ '^evt_[A-Za-z0-9]+$' and p_event_type in ('checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','charge.refunded','charge.dispute.created'))
    or (p_event_id ~ '^reconcile_[a-f0-9]{64}$' and p_event_type='internal.checkout.reconciled')
   )
   or p_status not in ('pending','paid','failed','expired','partially_refunded','refunded','disputed')
   or p_refunded_amount is null or p_refunded_amount<0 or p_refunded_amount>p.amount then
   raise exception using errcode='22023',message='Payment event mismatch';
 end if;
 if p_status in ('paid','partially_refunded','refunded','disputed') and
   (p_payment_intent_id is null or p_charge_id is null or p_paid_at is null or p_paid_at>now()+interval '5 minutes' or p_paid_at<p.created_at-interval '5 minutes') then
   raise exception using errcode='22023',message='Verified payment evidence required';
 end if;
 if (p.payment_intent_id is not null and p_payment_intent_id is not null and p.payment_intent_id<>p_payment_intent_id)
   or (p.charge_id is not null and p_charge_id is not null and p.charge_id<>p_charge_id) then
   raise exception using errcode='40001',message='Payment evidence conflict';
 end if;
 select * into prior from public.icsh_membership_payment_events where event_id=p_event_id;
 if prior.event_id is not null then
   if prior.application_id<>p_application_id or prior.account_id<>p_account_id or prior.mode<>p_mode then
     raise exception using errcode='40001',message='Payment event replay conflict';
   end if;
   return to_jsonb(p);
 end if;
 insert into public.icsh_membership_payment_events(event_id,application_id,account_id,mode,event_type)
 values(p_event_id,p_application_id,p_account_id,p_mode,p_event_type);
 -- An old failure cannot undo payment, nor can an old success undo a refund/dispute.
 update public.icsh_membership_payments set
  session_id=p_session_id,
  payment_intent_id=coalesce(payment_intent_id,p_payment_intent_id),
  charge_id=coalesce(charge_id,p_charge_id),paid_at=coalesce(paid_at,p_paid_at),
  refunded_amount=greatest(refunded_amount,p_refunded_amount),
  status=case
    when status='disputed' then 'disputed'
    when p_status='disputed' then 'disputed'
    when greatest(refunded_amount,p_refunded_amount)=amount then 'refunded'
    when greatest(refunded_amount,p_refunded_amount)>0 then 'partially_refunded'
    when status='paid' and p_status in ('pending','failed','expired') then 'paid'
    else p_status end,
  updated_at=now() where application_id=p_application_id returning * into p;
 return to_jsonb(p);
end $function$;

commit;

