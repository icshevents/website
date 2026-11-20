-- Replace paid-only eligibility with active or inactive membership eligibility.
set local lock_timeout='5s';

alter table public.icsh_event_discounts
 add column audience text not null default 'all' check (audience in ('all','active','inactive'));

update public.icsh_event_discounts
 set audience='active',version=version+1,updated_at=now()
 where paid_members_only;

create or replace function public.icsh_discount_hub_list(p_token text,p_event uuid,p_form uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare kind text;
begin
 kind:=public.icsh_discount_hub_scope(p_token,p_event,p_form);
 perform public.icsh_discount_release_stale(kind,p_form);
 return coalesce((
 select jsonb_agg(jsonb_build_object(
  'id',d.id,'scopeKind',d.scope_kind,'scopeId',d.scope_id,'code',d.code,
  'name',d.name,'basis',d.basis,'value',d.value,'categories',d.categories,
  'application',d.application,'redemptionBasis',d.redemption_basis,
  'maximum',d.maximum,'perCustomerMaximum',d.per_customer_maximum,
  'startsAt',d.starts_at,'expiresAt',d.expires_at,
  'audience',d.audience,'paidMembersOnly',d.paid_members_only,'active',d.active,'version',d.version,
  'used',coalesce(stats.used,0),'reserved',coalesce(stats.reserved,0),
  'remaining',greatest(0,d.maximum-coalesce(stats.used,0)-coalesce(stats.reserved,0)),
  'totalDiscountPence',coalesce(stats.given,0)
 ) order by d.created_at,d.id)
 from public.icsh_event_discounts d
 left join lateral (
   select coalesce(sum(units) filter(where status='redeemed'),0)::integer used,
     coalesce(sum(units) filter(where status='reserved'),0)::integer reserved,
     coalesce(sum(discount_pence) filter(where status='redeemed'),0)::bigint given
   from public.icsh_event_discount_redemptions r where r.discount_id=d.id
 ) stats on true
 where d.scope_kind=kind and d.scope_id=p_form
 ),'[]'::jsonb);
end $$;

create or replace function public.icsh_discount_hub_save(
 p_token text,p_event uuid,p_form uuid,p_discount jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare kind text;old public.icsh_event_discounts;c text;v integer;max_use integer;
used integer; new_audience text;
begin
 kind:=public.icsh_discount_hub_scope(p_token,p_event,p_form);
 if p_discount is null or jsonb_typeof(p_discount)<>'object'
   or length(p_discount::text)>5000 then raise exception using errcode='22023',message='Invalid offer settings';end if;
 new_audience:=coalesce(p_discount->>'audience',case when (p_discount->>'paidMembersOnly')::boolean then 'active' else 'all' end);
 if new_audience not in ('all','active','inactive') then
  raise exception using errcode='22023',message='Invalid discount membership audience';
 end if;
 c:=upper(nullif(btrim(p_discount->>'code'),''));
 if c is not null and c!~'^[A-Z0-9][A-Z0-9_-]{2,31}$' then raise exception using errcode='22023',message='Use 3–32 letters or numbers for the code';end if;
 if coalesce((p_discount->>'active')::boolean,false) and
    (c is null or coalesce((p_discount->>'value')::integer,0)<=0 or coalesce((p_discount->>'maximum')::integer,0)<=0)
 then raise exception using errcode='22023',message='Add a code, discount and redemption limit before activation';end if;
 if (p_discount->>'id') is not null then
   select * into old from public.icsh_event_discounts where id=(p_discount->>'id')::uuid and scope_kind=kind and scope_id=p_form for update;
   if old.id is null then raise exception using errcode='42501',message='Offer not linked to this form';end if;
   if old.audience='inactive' and not (p_discount ? 'audience') then new_audience:=old.audience;end if;
   if old.version is distinct from (p_discount->>'version')::integer then raise exception using errcode='40001',message='Offer changed elsewhere';end if;
   select coalesce(sum(units),0)::integer into used from public.icsh_event_discount_redemptions
   where discount_id=old.id and status<>'released';
   if used>0 and (
      old.code is distinct from c
      or old.basis is distinct from p_discount->>'basis'
      or old.value is distinct from (p_discount->>'value')::integer
      or old.categories is distinct from p_discount->>'categories'
      or old.application is distinct from p_discount->>'application'
      or old.redemption_basis is distinct from p_discount->>'redemptionBasis'
      or old.audience is distinct from new_audience
   ) then raise exception using errcode='22023',message='Deactivate this offer and create a new code to change the value or eligibility after booking activity';end if;
 else
   if c is null then raise exception using errcode='22023',message='Enter a code for an additional offer';end if;
 end if;
 if old.id is null then used:=0;end if;
 max_use:=(p_discount->>'maximum')::integer;
 if max_use is null or max_use<used or max_use>1000000 then raise exception using errcode='22023',message='Redemption limit cannot be lower than existing paid and reserved uses';end if;
 if (p_discount->>'id') is not null then
   update public.icsh_event_discounts set
    code=c,name=p_discount->>'name',basis=p_discount->>'basis',value=(p_discount->>'value')::integer,
    categories=p_discount->>'categories',application=p_discount->>'application',
    redemption_basis=p_discount->>'redemptionBasis',maximum=max_use,
    per_customer_maximum=(p_discount->>'perCustomerMaximum')::integer,
    starts_at=(p_discount->>'startsAt')::timestamptz,expires_at=(p_discount->>'expiresAt')::timestamptz,
    audience=new_audience,paid_members_only=(new_audience<>'all'),
    active=(p_discount->>'active')::boolean,version=version+1,updated_at=now()
    where id=old.id;
 else
   insert into public.icsh_event_discounts(scope_kind,scope_id,code,name,basis,value,categories,application,redemption_basis,maximum,per_customer_maximum,starts_at,expires_at,audience,paid_members_only,active)
   values(kind,p_form,c,p_discount->>'name',p_discount->>'basis',(p_discount->>'value')::integer,p_discount->>'categories',p_discount->>'application',p_discount->>'redemptionBasis',max_use,(p_discount->>'perCustomerMaximum')::integer,(p_discount->>'startsAt')::timestamptz,(p_discount->>'expiresAt')::timestamptz,new_audience,(new_audience<>'all'),(p_discount->>'active')::boolean);
 end if;
 perform public.icsh_hub_audit(p_token,p_event,'event.discount.updated',jsonb_build_object('form',p_form,'code',c,'active',(p_discount->>'active')::boolean));
 return public.icsh_discount_hub_list(p_token,p_event,p_form);
end $$;

create or replace function public.icsh_discount_ticket_reserve()
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
 if d.audience<>'all' and d.audience is distinct from coalesce(
    promo->>'membershipProof',case when promo->'paidMemberVerified'='true'::jsonb then 'active' end
 ) then
  raise exception using errcode='P2913',message='Membership does not match this offer';
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
 select coalesce(sum(red.units),0)::integer into in_use from public.icsh_event_discount_redemptions red
 where discount_id=d.id and status in ('reserved','redeemed');
 if in_use+units>d.maximum then raise exception using errcode='P2914',message='Discount use limit reached';end if;
 customer:=promo->>'customerHash';
 if d.per_customer_maximum is not null then
  select coalesce(sum(red.units),0)::integer into for_customer from public.icsh_event_discount_redemptions red
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

create or replace function public.icsh_iftari_reserve_discount(
 p_id uuid,p_request_hash text,p_capability_hash text,
 p_contact jsonb,p_quantities jsonb,p_member_emails text[],p_donation integer,
 p_expected_version integer,p_expected_gross integer,p_expected_net integer,
 p_account text,p_mode text,p_discount_code text,p_customer_hash text,
 p_membership_proof text
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
 if d.audience<>'all' and d.audience is distinct from p_membership_proof then
  raise exception using errcode='P2913',message='Membership does not match this offer';
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
 select coalesce(sum(red.units),0)::integer into used from public.icsh_event_discount_redemptions red
 where discount_id=d.id and status in ('reserved','redeemed');
 if used+units>d.maximum then raise exception using errcode='P2914',message='Discount fully redeemed';end if;
 if d.per_customer_maximum is not null then
  select coalesce(sum(red.units),0)::integer into own from public.icsh_event_discount_redemptions red
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

-- Retain the original signature for any checkout running on the previous build.
create or replace function public.icsh_iftari_reserve_discount(
 p_id uuid,p_request_hash text,p_capability_hash text,p_contact jsonb,
 p_quantities jsonb,p_member_emails text[],p_donation integer,p_expected_version integer,
 p_expected_gross integer,p_expected_net integer,p_account text,p_mode text,
 p_discount_code text,p_customer_hash text,p_paid_member_verified boolean
) returns jsonb language sql security invoker set search_path='' as $$
 select public.icsh_iftari_reserve_discount(
  p_id,p_request_hash,p_capability_hash,p_contact,p_quantities,p_member_emails,p_donation,
  p_expected_version,p_expected_gross,p_expected_net,p_account,p_mode,p_discount_code,
  p_customer_hash,case when p_paid_member_verified then 'active'::text else null::text end
 );
$$;

revoke all on function public.icsh_iftari_reserve_discount(uuid,text,text,jsonb,jsonb,text[],integer,integer,integer,integer,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.icsh_iftari_reserve_discount(uuid,text,text,jsonb,jsonb,text[],integer,integer,integer,integer,text,text,text,text,text) to service_role;
notify pgrst, 'reload schema';
