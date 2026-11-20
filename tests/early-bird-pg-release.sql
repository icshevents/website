-- Synthetic PostgreSQL fixture: checkout expiry, abandoned booking reclaim,
-- and rejection of a new Stripe session after a discount reservation is released.
do $release$
declare
 fid uuid:='40000000-0000-4000-8000-000000000002';
 one uuid:='40000000-0000-4000-8000-000000000003';
 two uuid:='40000000-0000-4000-8000-000000000004';
 three uuid:='40000000-0000-4000-8000-000000000005';
 record_json jsonb; n integer;
begin
 insert into public.icsh_events(id,slug,source_type,form_ids)
 values('40000000-0000-4000-8000-000000000001','synthetic-release','tickets',array[fid]);
 insert into public.icsh_forms(id,slug,title,kind,status,configuration,mode)
 values(fid,'synthetic-release-tickets','Fictional failure and expiry form','tickets','published',
 '{"mode":"live","status":"published","capacity":10,"startsAt":"2028-12-20T13:00:00Z","version":1,"prototype":false}'::jsonb,'live');
 update public.icsh_event_discounts set
  code='EXPIRE',name='Fictional expiry',basis='fixed',value=300,
  maximum=1,application='per_booking',categories='all',active=true
 where scope_kind='tickets' and scope_id=fid;
 record_json:=jsonb_build_object(
  'mode','live','status','pending','currency','gbp','total',1500,
  'reference','EVT-SYN-EXP','eventTitle','Fictional test event',
  'eventStartsAt','2028-12-20T13:00:00Z','capabilityHash',repeat('a',64),
  'contact',jsonb_build_object('email','example@example.org'),
  'attendees',jsonb_build_array(jsonb_build_object('unitAmount',1800,'ticket','member')),
  'booking',jsonb_build_object('promotion',jsonb_build_object(
   'code','EXPIRE','grossPence',1800,'discountPence',300,'netPence',1500,
   'units',1,'paidMemberVerified',false,'customerHash',repeat('f',64)
  ))
 );
 insert into public.icsh_submissions(id,form_id,status,answers,mode)
 values(one,fid,'new',jsonb_build_object('record',record_json),'live');
 insert into public.icsh_form_payments(source_kind,source_id,account_id,mode,amount,status)
 values('event',one,'acct_TEST','live',1500,'pending');
 update public.icsh_form_payments set session_id='cs_test_expiration' where source_id=one;
 update public.icsh_form_payments set status='expired' where source_id=one;
 if (select status from public.icsh_event_discount_redemptions where booking_id=one)<>'released'
 then raise exception 'Expired Stripe checkout did not release reserved use';end if;
 if not public.icsh_discount_public_available('tickets',fid)
 then raise exception 'Released discount not available for new checkout';end if;
 insert into public.icsh_submissions(id,form_id,status,answers,mode)
 values(two,fid,'new',jsonb_build_object('record',record_json),'live');
 if (select status from public.icsh_event_discount_redemptions where booking_id=two)<>'reserved'
 then raise exception 'Released capacity not reusable';end if;
 update public.icsh_event_discount_redemptions
 set reserved_at=now()-interval '31 minutes' where booking_id=two;
 -- The public form must reopen automatically when the stale hold runs out.
 -- The server also refreshes holds before validating a submitted code.
 if not public.icsh_discount_public_available('tickets',fid)
 then raise exception 'A stale unclaimed checkout incorrectly hid the discount field';end if;
 if (select status from public.icsh_event_discount_redemptions where booking_id=two)<>'released'
 then raise exception 'The public availability check did not expire an unclaimed hold';end if;
 insert into public.icsh_submissions(id,form_id,status,answers,mode)
 values(three,fid,'new',jsonb_build_object('record',record_json),'live');
 if (select status from public.icsh_event_discount_redemptions where booking_id=two)<>'released'
    or (select status from public.icsh_event_discount_redemptions where booking_id=three)<>'reserved'
 then raise exception 'Abandoned discount hold not reclaimed correctly';end if;
 insert into public.icsh_form_payments(source_kind,source_id,account_id,mode,amount,status)
 values('event',two,'acct_TEST','live',1500,'pending');
 begin
  update public.icsh_form_payments set session_id='cs_test_stale' where source_id=two;
  raise exception 'Released booking could create a new Stripe session';
 exception when sqlstate 'P2916' then null;end;
 if (select session_id from public.icsh_form_payments where source_id=two) is not null
 then raise exception 'Blocked stale booking incorrectly attached Stripe session';end if;
 raise notice 'Synthetic checkout expiry, abandoned reclamation, failed continuation checks passed';
end $release$;
