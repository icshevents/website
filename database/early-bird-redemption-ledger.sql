-- PROPOSED migration (apply after early-bird-discounts.sql on an isolated staging DB).
-- A booking is saved and its discount reserved atomically. A Stripe webhook
-- commits/release the reservation in the SAME transaction as the payment ledger.
begin;
set local lock_timeout='5s';

create function public.icsh_discount_ticket_reserve()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
 b jsonb; promo jsonb; d public.icsh_event_discounts;
 gross integer; computed integer; eligible integer:=0; eligible_tickets integer:=0;
 portion integer; units integer; in_use integer; for_customer integer; entry jsonb;
 category text; price integer; applied integer; customer text; max_customer integer;
begin
 b:=new.answers->'record';promo:=b->'booking'->'promotion';
 if promo is null or jsonb_typeof(promo)='null' then return new;end if;
 if new.mode<>'live' or b->>'status'<>'pending' or b->>'mode'<>'live'
   or promo->>'code' is null or promo->>'customerHash'!~'^[a-f0-9]{64}$'
   or jsonb_typeof(b->'attendees')<>'array' then
  raise exception using errcode='P2911',message='Discount booking invalid';
 end if;
 select * into d from public.icsh_event_discounts
 where scope_kind='tickets' and scope_id=new.form_id and code=upper(promo->>'code')
 for update;
 if d.id is null or not d.active or d.starts_at>now() or d.expires_at<=now() then
  raise exception using errcode='P2912',message='The discount code is unavailable';
 end if;
 if d.paid_members_only and coalesce((promo->>'paidMemberVerified')::boolean,false) is not true then
  raise exception using errcode='P2913',message='Paid membership is required for this offer';
 end if;
 select coalesce(sum((item->>'unitAmount')::integer),0)::integer into gross
 from jsonb_array_elements(b->'attendees') item;
 if gross<30 or (promo->>'grossPence')::integer<>gross then
  raise exception using errcode='P2911',message='Invalid gross amount';
 end if;
 computed:=0;
 for entry in select value from jsonb_array_elements(b->'attendees') loop
  price:=(entry->>'unitAmount')::integer;
  category:=case when entry->>'ticket'='child' then 'child' else 'adult' end;
  if price is null or price<0 then raise exception using errcode='P2911',message='Invalid ticket amount';end if;
  if price>0 and (d.categories='all' or d.categories=category) then
    eligible:=eligible+price;eligible_tickets:=eligible_tickets+1;
    portion:=case when d.basis='fixed' then least(d.value,price)
      else (price*d.value+50)/100 end;
    if d.application='per_ticket' then computed:=computed+portion;end if;
  end if;
 end loop;
 if eligible=0 or eligible_tickets=0 then raise exception using errcode='P2913',message='No qualifying tickets';end if;
 if d.application='per_booking' then
  computed:=case when d.basis='fixed' then least(d.value,eligible)
    else (eligible*d.value+50)/100 end;
 end if;
 computed:=least(computed,eligible);
 if computed<=0 or (promo->>'discountPence')::integer<>computed
   or (promo->>'netPence')::integer<>gross-computed
   or (b->>'total')::integer<>gross-computed
   or gross-computed<30 then raise exception using errcode='P2911',message='Discounted total is invalid';end if;
 units:=case when d.redemption_basis='ticket' then eligible_tickets else 1 end;
 if (promo->>'units')::integer<>units then raise exception using errcode='P2911',message='Invalid discount use count';end if;
 -- Row lock on d serialises competing final uses; inserts cannot overshoot.
 -- Discard abandoned pre-checkout claims only where no Stripe session exists.
 update public.icsh_event_discount_redemptions r
 set status='released',released_at=now()
 where r.discount_id=d.id and r.status='reserved'
   and r.reserved_at<now()-interval '30 minutes'
   and not exists(select 1 from public.icsh_form_payments p
      where p.source_kind='event' and p.source_id=r.booking_id and p.session_id is not null);
 select coalesce(sum(units),0)::integer into in_use from public.icsh_event_discount_redemptions
 where discount_id=d.id and status in ('reserved','redeemed');
 if in_use+units>d.maximum then raise exception using errcode='P2914',message='Discount use limit reached';end if;
 customer:=promo->>'customerHash';
 if d.per_customer_maximum is not null then
  select coalesce(sum(units),0)::integer into for_customer
   from public.icsh_event_discount_redemptions
   where discount_id=d.id and customer_hash=customer and status in ('reserved','redeemed');
  if for_customer+units>d.per_customer_maximum then
   raise exception using errcode='P2915',message='Customer discount limit reached';
  end if;
 end if;
 insert into public.icsh_event_discount_redemptions
 (discount_id,scope_kind,scope_id,booking_id,customer_hash,units,gross_pence,discount_pence,net_pence)
 values(d.id,'tickets',new.form_id,new.id,customer,units,gross,computed,gross-computed);
 return new;
end $$;
create trigger icsh_discount_ticket_reserve_after_insert
after insert on public.icsh_submissions for each row
when (new.answers->'record'->'booking'->'promotion' is not null)
execute function public.icsh_discount_ticket_reserve();

-- A saved, expired, unclaimed discount must never acquire a new Stripe
-- Checkout session. Existing session reconciliation remains permitted.
create function public.icsh_discount_ticket_checkout_guard()
returns trigger language plpgsql security invoker set search_path='' as $
begin
 if new.source_kind='event' and new.session_id is not null and old.session_id is null
  and exists(select 1 from public.icsh_submissions s
   where s.id=new.source_id and s.answers->'record'->'booking'->'promotion' is not null)
  and not exists(select 1 from public.icsh_event_discount_redemptions r
   where r.booking_id=new.source_id and r.scope_kind='tickets'
   and r.status='reserved' for update)
 then raise exception using errcode='P2916',message='The discount reservation has expired';end if;
 return new;
end $;
create trigger icsh_discount_ticket_checkout_guard_before_update
before update of session_id on public.icsh_form_payments
for each row execute function public.icsh_discount_ticket_checkout_guard();

-- Consume once only after verified Stripe payment, never after a mere saved
-- booking or successful redirection. Refunds don't restore an offer's uses.
create function public.icsh_discount_payment_settle()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.source_kind<>'event' then return new;end if;
 if new.status in ('paid','partially_refunded','refunded','disputed') then
  update public.icsh_event_discount_redemptions r
   set status='redeemed',redeemed_at=now()
   where r.booking_id=new.source_id and r.scope_kind='tickets' and r.status='reserved';
 elsif new.status in ('failed','expired') then
  update public.icsh_event_discount_redemptions r
   set status='released',released_at=now()
   where r.booking_id=new.source_id and r.scope_kind='tickets' and r.status='reserved';
 end if;
 return new;
end $$;
create trigger icsh_discount_payment_settle_after_insert
after insert on public.icsh_form_payments for each row execute function public.icsh_discount_payment_settle();
create trigger icsh_discount_payment_settle_after_update
after update of status on public.icsh_form_payments for each row execute function public.icsh_discount_payment_settle();

revoke all on function public.icsh_discount_ticket_reserve(),public.icsh_discount_payment_settle(),public.icsh_discount_ticket_checkout_guard() from public,anon,authenticated;
grant execute on function public.icsh_discount_ticket_reserve(),public.icsh_discount_payment_settle(),public.icsh_discount_ticket_checkout_guard() to service_role;
commit;

-- Preserve the current live source guard, updating only its invariant to
-- check gross admission prices against the recorded discount and final total.
begin;
CREATE OR REPLACE FUNCTION public.icsh_form_payment_source(p_kind text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare d public.icsh_donations;s public.icsh_submissions;f public.icsh_forms;r jsonb;parent_id uuid;amount integer;
begin
 if p_kind='donation' then
  select * into d from public.icsh_donations where id=p_id for update;
  if d.id is null then return null;end if;
  return jsonb_build_object('kind',p_kind,'id',p_id,'mode',d.mode,'amount',d.amount,'currency','gbp','reference','DON-'||upper(replace(d.id::text,'-','')),
   'description','Donation to ICSH','email',d.email,'capabilityHash',d.capability_hash,'eligible',true);
 elsif p_kind='event' then
  select form_id into parent_id from public.icsh_submissions where id=p_id;
  select * into f from public.icsh_forms where id=parent_id for update;
  select * into s from public.icsh_submissions where id=p_id and form_id=parent_id for update;
  if s.id is null or f.kind is distinct from 'tickets' then return null;end if;
  r:=s.answers->'record';amount:=(r->>'total')::integer;
  if r->>'mode' is distinct from s.mode or r->>'currency' is distinct from 'gbp' or jsonb_typeof(r->'attendees') is distinct from 'array'
   or amount is null or amount<30
   or amount<>(
     select coalesce(sum((value->>'unitAmount')::integer),0)
     from jsonb_array_elements(r->'attendees')
   ) - coalesce((r->'booking'->'promotion'->>'discountPence')::integer,0)
   or (
     r->'booking'->'promotion' is not null
     and not exists(
       select 1 from public.icsh_event_discount_redemptions red
       where red.booking_id=p_id and red.scope_kind='tickets'
         and red.scope_id=parent_id and red.net_pence=amount
     )
   ) then
   raise exception using errcode='22023',message='Invalid saved booking amount';end if;
  return jsonb_build_object('kind',p_kind,'id',p_id,'mode',s.mode,'amount',amount,'currency','gbp','reference',r->>'reference',
   'description',r->>'eventTitle','email',r->'contact'->>'email','capabilityHash',r->>'capabilityHash','formId',parent_id,
   'eligible',coalesce(s.mode=f.mode and f.status='published' and f.configuration->>'status'='published'
    and (f.configuration->>'startsAt')::timestamptz>now() and not coalesce((f.configuration->>'prototype')::boolean,false)
    and r->>'status' not in ('cancelled','confirmed_free')
    and (
      r->'booking'->'promotion' is null
      or exists (
        select 1 from public.icsh_event_discount_redemptions red
        where red.booking_id=p_id and red.scope_kind='tickets'
          and red.scope_id=parent_id
          and red.status in ('reserved','redeemed')
      )
    ),false));
 end if;
 return null;
end $function$

commit;

-- Existing confirmation email queue must accept discounted final payment totals.
begin;
CREATE OR REPLACE FUNCTION public.icsh_queue_paid_ticket_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r jsonb; f public.icsh_forms; p public.icsh_form_payments; recipient text;
begin
 r:=new.answers->'record';
 if new.mode<>'live' or r->>'mode'<>'live' or r->>'status'<>'confirmed_paid' or coalesce((r->>'paymentReview')::boolean,false)
  or old.answers->'record'->>'status'='confirmed_paid' then return new;end if;
 if not exists(select 1 from public.icsh_form_email_settings where id and enabled) then return new;end if;
 select * into f from public.icsh_forms where id=new.form_id;
 if f.kind<>'tickets' or f.slug<>'icsh-winter-lunch-2026' or f.configuration->>'paidConfirmationEmail' is distinct from 'true' then return new;end if;
 select * into p from public.icsh_form_payments where source_kind='event' and source_id=new.id;
 if p.status is distinct from 'paid' or p.mode<>'live' or p.currency<>'gbp' or p.refunded_amount<>0 or p.paid_at is null or p.payment_intent_id is null or p.charge_id is null
  or p.amount is distinct from (r->>'total')::integer or p.amount is distinct from ((select sum((a->>'unitAmount')::integer) from jsonb_array_elements(r->'attendees') a)-coalesce((r->'booking'->'promotion'->>'discountPence')::integer,0)) then return new;end if;
 recipient:=lower(trim(r->'contact'->>'email'));
 if recipient is null or recipient !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$' or length(recipient)>254 or recipient~'[[:cntrl:]]'
  or recipient~'[.](invalid|test|example|localhost)$' or recipient~'@([^@]+[.])?example[.](com|org|net)$' then return new;end if;
 insert into public.icsh_ticket_confirmation_emails(submission_id,payload) values(new.id,jsonb_build_object(
  'recipient',recipient,'reference',r->>'reference','name',r->'contact'->>'name','title',r->>'eventTitle','venue',f.configuration->>'venue',
  'startsAt',r->>'eventStartsAt','endsAt',f.configuration->>'endsAt','total',p.amount,
  'discountPence',coalesce((r->'booking'->'promotion'->>'discountPence')::integer,0),
  'discountCode',r->'booking'->'promotion'->>'code','discountName',r->'booking'->'promotion'->>'name',
  'attendees',(select jsonb_agg(jsonb_build_object('ticket',a->>'ticket','unitAmount',(a->>'unitAmount')::integer)) from jsonb_array_elements(r->'attendees') a)))
 on conflict(submission_id) do nothing;
 return new;
end $function$

commit;
