-- PROPOSED migration, staging only. Run after early-bird-discounts.sql and
-- early-bird-redemption-ledger.sql. Never changes existing Iftari bookings.
-- The existing Iftari reservation routine still validates ticket prices,
-- membership ticket counts, capacity, donation and booking idempotency.
begin;
set local lock_timeout='5s';

create function public.icsh_iftari_reserve_discount(
 p_id uuid,p_request_hash text,p_capability_hash text,
 p_contact jsonb,p_quantities jsonb,p_member_emails text[],p_donation integer,
 p_expected_version integer,p_expected_gross integer,p_expected_net integer,
 p_account text,p_mode text,p_discount_code text,p_customer_hash text,
 p_paid_member_verified boolean
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 b public.icsh_iftari_bookings; existing jsonb; d public.icsh_event_discounts;
 discount_scope uuid; gross integer; calculation integer; eligible integer:=0;
 eligible_tickets integer:=0; portion integer; units integer; used integer;
 own integer; item jsonb; category text; price integer; quantity integer;
 normalized text;
begin
 normalized:=upper(btrim(p_discount_code));
 if p_mode<>'live' or normalized!~'^[A-Z0-9][A-Z0-9_-]{2,31}$'
   or p_customer_hash!~'^[a-f0-9]{64}$'
   or p_expected_gross<30 or p_expected_net<30 then
  raise exception using errcode='P2911',message='Invalid discount booking';
 end if;
 -- Existing validation, price recheck and guest-limit locks still apply.
 existing:=public.icsh_iftari_reserve(p_id,p_request_hash,p_capability_hash,
  p_contact,p_quantities,p_member_emails,p_donation,p_expected_version,
  p_expected_gross,p_account,p_mode);
 select * into b from public.icsh_iftari_bookings where id=p_id for update;
 if b.id is null then raise exception using errcode='P2911',message='Booking unavailable';end if;
 if b.quote->'promotion' is not null then
  if b.quote->'promotion'->>'code'<>normalized or b.total<>p_expected_net then
    raise exception using errcode='P2911',message='Discount booking changed';
  end if;
  return to_jsonb(b);
 end if;
 select e.id into discount_scope from public.icsh_events e
 where e.source_type='iftari' and e.source_key=b.event_slug and not e.archived;
 if discount_scope is null then raise exception using errcode='P2911',message='Iftari discount form unavailable';end if;
 select * into d from public.icsh_event_discounts
 where scope_kind='iftari' and scope_id=discount_scope and code=normalized
 for update;
 if d.id is null then raise exception using errcode='P2912',message='Invalid code for this form';end if;
 if not d.active or d.starts_at>now() or d.expires_at<=now() then
  raise exception using errcode='P2912',message='Discount inactive or expired';
 end if;
 if d.paid_members_only and not coalesce(p_paid_member_verified,false) then
  raise exception using errcode='P2913',message='Paid membership required';
 end if;
 gross:=(b.quote->>'total')::integer;
 if gross<>p_expected_gross then raise exception using errcode='P2911',message='Original ticket quote changed';end if;
 calculation:=0;
 for item in select value from jsonb_array_elements(b.quote->'lines') loop
  price:=(item->>'unitAmount')::integer;
  quantity:=(item->>'quantity')::integer;
  category:=case when item->>'key' in ('member','nonmember') then 'adult'
     when item->>'key' in ('child','under5') then 'child' else 'donation' end;
  if price<0 or quantity<1 then raise exception using errcode='P2911',message='Invalid ticket unit price';end if;
  if price>0 and category<>'donation' and (d.categories='all' or d.categories=category) then
    eligible:=eligible+quantity*price;
    eligible_tickets:=eligible_tickets+quantity;
    portion:=case when d.basis='fixed' then least(d.value,price) else (price*d.value+50)/100 end;
    if d.application='per_ticket' then calculation:=calculation+quantity*portion;end if;
  end if;
 end loop;
 if eligible=0 or eligible_tickets=0 then raise exception using errcode='P2913',message='Offer does not apply to selected tickets';end if;
 if d.application='per_booking' then
  calculation:=case when d.basis='fixed' then least(d.value,eligible) else (eligible*d.value+50)/100 end;
 end if;
 calculation:=least(calculation,eligible);
 if calculation<1 or gross-calculation<>p_expected_net then
  raise exception using errcode='P2911',message='Discount total changed';end if;
 units:=case when d.redemption_basis='ticket' then eligible_tickets else 1 end;
 -- Serialise all claims on the discount record before counting redemptions.
 update public.icsh_event_discount_redemptions r
 set status='released',released_at=now() where r.discount_id=d.id and r.status='reserved'
  and r.reserved_at<now()-interval '30 minutes'
  and not exists(select 1 from public.icsh_iftari_bookings paid
    where paid.id=r.booking_id and paid.session_id is not null);
 select coalesce(sum(units),0)::integer into used from public.icsh_event_discount_redemptions
 where discount_id=d.id and status in ('reserved','redeemed');
 if used+units>d.maximum then raise exception using errcode='P2914',message='Discount fully redeemed';end if;
 if d.per_customer_maximum is not null then
  select coalesce(sum(units),0)::integer into own from public.icsh_event_discount_redemptions
   where discount_id=d.id and customer_hash=p_customer_hash and status in ('reserved','redeemed');
  if own+units>d.per_customer_maximum then raise exception using errcode='P2915',message='Customer redemption limit reached';end if;
 end if;
 update public.icsh_iftari_bookings set total=p_expected_net,
  quote=b.quote||jsonb_build_object(
    'grossTotal',gross,'discountPence',calculation,'total',p_expected_net,
    'promotion',jsonb_build_object('code',normalized,'name',d.name,
      'grossPence',gross,'discountPence',calculation,'payablePence',p_expected_net,
      'units',units,'discountId',d.id)
  ) where id=b.id returning * into b;
 insert into public.icsh_event_discount_redemptions
  (discount_id,scope_kind,scope_id,booking_id,customer_hash,units,gross_pence,discount_pence,net_pence)
 values(d.id,'iftari',discount_scope,p_id,p_customer_hash,units,gross,calculation,p_expected_net);
 return to_jsonb(b);
end $$;

-- If an abandoned checkout reservation has been released, the corresponding
-- saved booking must not mint a Stripe session at an old discounted total.
create function public.icsh_iftari_discount_checkout_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.session_id is not null and old.session_id is null
  and old.quote->'promotion' is not null
  and not exists(select 1 from public.icsh_event_discount_redemptions
     where booking_id=new.id and scope_kind='iftari' and status='reserved' for update)
 then raise exception using errcode='P2916',message='Discount reservation expired';end if;
 return new;
end $$;
create trigger icsh_iftari_discount_checkout_guard_before_update
before update of session_id on public.icsh_iftari_bookings
for each row execute function public.icsh_iftari_discount_checkout_guard();

create function public.icsh_iftari_discount_payment_settle()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status in ('paid','partially_refunded','refunded','disputed') then
  update public.icsh_event_discount_redemptions set status='redeemed',redeemed_at=now()
    where booking_id=new.id and scope_kind='iftari' and status='reserved';
 elsif new.status in ('failed','expired') then
  update public.icsh_event_discount_redemptions set status='released',released_at=now()
    where booking_id=new.id and scope_kind='iftari' and status='reserved';
 end if;
 return new;
end $$;
create trigger icsh_iftari_discount_payment_settle_after_update
after update of status on public.icsh_iftari_bookings
for each row execute function public.icsh_iftari_discount_payment_settle();

revoke all on function public.icsh_iftari_reserve_discount(uuid,text,text,jsonb,jsonb,text[],integer,integer,integer,integer,text,text,text,text,boolean),
 public.icsh_iftari_discount_checkout_guard(),public.icsh_iftari_discount_payment_settle()
 from public,anon,authenticated;
grant execute on function public.icsh_iftari_reserve_discount(uuid,text,text,jsonb,jsonb,text[],integer,integer,integer,integer,text,text,text,text,boolean),
 public.icsh_iftari_discount_checkout_guard(),public.icsh_iftari_discount_payment_settle()
 to service_role;
commit;
