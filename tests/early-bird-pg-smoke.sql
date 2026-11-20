-- Synthetic migrations smoke test. Data never leaves this CI container.
DO $test$
declare
 eid uuid:='10000000-0000-4000-8000-000000000001';
 fid uuid:='10000000-0000-4000-8000-000000000002';
 bid uuid:='10000000-0000-4000-8000-000000000003';
 copyid uuid:='10000000-0000-4000-8000-000000000004';
 eid2 uuid:='20000000-0000-4000-8000-000000000001';
 iid uuid:='20000000-0000-4000-8000-000000000002';
 original jsonb; data jsonb; payout jsonb;
begin
 insert into public.icsh_events(id,slug,source_type,form_ids)
 values(eid,'synthetic-tickets','tickets',array[fid]);
 insert into public.icsh_forms(id,slug,title,kind,status,configuration,mode)
 values(fid,'test-tickets','Synthetic tickets','tickets','published',
  '{"mode":"live","status":"published","capacity":12,"startsAt":"2028-12-20T13:00:00Z","version":1,"prototype":false}'::jsonb,'live');
 if (select count(*) from public.icsh_event_discounts where scope_kind='tickets' and scope_id=fid and not active and code is null)<>1
 then raise exception 'New ticket form did not get inactive placeholder';end if;
 if public.icsh_discount_public_available('tickets',fid) then raise exception 'Inactive code visible';end if;
 update public.icsh_event_discounts set code='EARLY5',name='Early Bird Offer',basis='fixed',value=500,
 categories='all',application='per_booking',redemption_basis='booking',maximum=1,active=true where scope_id=fid;
 if not public.icsh_discount_public_available('tickets',fid) then raise exception 'Active discount not visible';end if;
 original:=jsonb_build_object(
  'mode','live','status','pending','currency','gbp','total',2275,
  'reference','EVT-FICTION','eventTitle','Synthetic Winter Lunch',
  'eventStartsAt','2028-12-20T13:00:00Z','capabilityHash',repeat('a',64),
  'contact',jsonb_build_object('email','customer@example.org'),
  'attendees',jsonb_build_array(jsonb_build_object('unitAmount',1850,'ticket','member'),
                                jsonb_build_object('unitAmount',925,'ticket','child')),
  'booking',jsonb_build_object('promotion',jsonb_build_object(
      'code','EARLY5','grossPence',2775,'discountPence',500,'netPence',2275,
      'units',1,'paidMemberVerified',false,'customerHash',repeat('b',64))));
 insert into public.icsh_submissions(id,form_id,status,answers,mode)
 values(bid,fid,'new',jsonb_build_object('record',original),'live');
 if (select count(*) from public.icsh_event_discount_redemptions where booking_id=bid and status='reserved')<>1
 then raise exception 'Discount was not reserved at booking save';end if;
 payout:=public.icsh_form_payment_source('event',bid);
 if (payout->>'amount')::integer<>2275 then raise exception 'Payment amount did not use net discounted total';end if;
 -- Existing undiscounted free bookings remain readable by the payment source.
 insert into public.icsh_submissions(id,form_id,status,answers,mode)
 values('10000000-0000-4000-8000-000000000006',fid,'new',
  jsonb_build_object('record',(original - 'booking') || jsonb_build_object(
   'total',0,'status','confirmed_free',
   'attendees',jsonb_build_array(jsonb_build_object('unitAmount',0,'ticket','child')))), 'live');
 payout:=public.icsh_form_payment_source('event','10000000-0000-4000-8000-000000000006');
 if (payout->>'amount')::integer is distinct from 0 or (payout->>'eligible')::boolean is distinct from false
 then raise exception 'Existing free booking could not be read';end if;
 -- The last remaining code cannot be reserved by another checkout.
 begin
  insert into public.icsh_submissions(id,form_id,status,answers,mode)
   values('10000000-0000-4000-8000-000000000005',fid,'new',
      jsonb_build_object('record',original),'live');
  raise exception 'Over-limit discount was incorrectly accepted';
 exception when sqlstate 'P2914' then null;end;
 insert into public.icsh_form_payments(source_kind,source_id,account_id,mode,amount,status)
 values('event',bid,'acct_TEST','live',2275,'pending');
 update public.icsh_form_payments set session_id='cs_test_staging' where source_id=bid;
 update public.icsh_form_payments set status='paid' where source_id=bid;
 if (select status from public.icsh_event_discount_redemptions where booking_id=bid)<>'redeemed'
 then raise exception 'Webhook-equivalent verified payment did not redeem';end if;
 update public.icsh_form_payments set status='refunded' where source_id=bid;
 if (select status from public.icsh_event_discount_redemptions where booking_id=bid)<>'redeemed'
 then raise exception 'Refund restored a redeemed coupon';end if;
 if public.icsh_discount_public_available('tickets',fid) then raise exception 'Used-up discount still shown as available';end if;
 -- The authenticated form editor can duplicate a form without inheriting
 -- access to the private discount tables or the previous form's offer.
 grant insert on public.icsh_forms to authenticated;
 set local role authenticated;
 insert into public.icsh_forms(id,slug,title,kind,status,configuration,mode)
 values(copyid,'test-tickets-next-year','Synthetic tickets 2029','tickets','draft',
  '{"mode":"live","status":"draft","capacity":12,"startsAt":"2029-12-20T13:00:00Z","version":1}'::jsonb,'live');
 reset role;
 if has_table_privilege('authenticated','public.icsh_event_discounts','INSERT')
    or has_schema_privilege('authenticated','icsh_discount_internal','USAGE')
 then raise exception 'Form editor has direct access to discounts';end if;
 if not exists(select 1 from public.icsh_event_discounts where scope_kind='tickets' and scope_id=copyid and not active and code is null)
 then raise exception 'Duplicated form inherited an active discount';end if;
 -- Iftari is independently scoped, with donation still undiscouned.
 insert into public.icsh_events(id,slug,source_type,source_key,archived)
 values(eid2,'synthetic-iftari','iftari','ramadan-iftari-2027',false);
 insert into public.icsh_iftari_settings(slug,configuration)
 values('ramadan-iftari-2027',
 '{"version":1,"status":"published","prices":{"member":2550,"nonmember":2800,"child":1300,"under5":0}}');
 if not exists(select 1 from public.icsh_event_discounts where scope_kind='iftari' and scope_id=eid2 and not active and code is null)
 then raise exception 'Iftari did not get separate inactive placeholder';end if;
 update public.icsh_event_discounts set code='IFT500',value=500,maximum=2,active=true
 where scope_kind='iftari' and scope_id=eid2;
 select public.icsh_iftari_reserve_discount(
  iid,repeat('c',64),repeat('d',64),
  jsonb_build_object('email','iftari@example.org','firstName','Test','lastName','Guest','mobile','+447700900000'),
  '{"member":0,"nonmember":2,"child":1,"under5":0}'::jsonb,
  array[]::text[],500,1,7400,6900,'acct_TEST','live','ift500',repeat('e',64),false
 ) into data;
 if (data->>'total')::integer<>6900 or (data->'quote'->'promotion'->>'discountPence')::integer<>500
    or (data->'quote'->>'donation')::integer<>500 then
  raise exception 'Iftari coupon changed donation or missed net total';end if;
 if not exists(select 1 from public.icsh_event_discount_redemptions where booking_id=iid and status='reserved')
 then raise exception 'Iftari code not reserved';end if;
 update public.icsh_iftari_bookings set session_id='cs_test_iftari' where id=iid;
 update public.icsh_iftari_bookings set status='paid' where id=iid;
 if not exists(select 1 from public.icsh_event_discount_redemptions where booking_id=iid and status='redeemed')
 then raise exception 'Iftari successful payment did not settle';end if;
 update public.icsh_iftari_bookings set status='refunded' where id=iid;
 if (select status from public.icsh_event_discount_redemptions where booking_id=iid)<>'redeemed'
 then raise exception 'Iftari refund restored a redemption';end if;
 raise notice 'Synthetic Early Bird ticket and Iftari SQL smoke tests passed';
end $test$;
