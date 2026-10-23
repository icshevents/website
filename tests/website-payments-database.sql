-- Execute after both migrations inside the same transaction, then ROLLBACK.
set local role service_role;
do $$
declare id uuid:=gen_random_uuid();r jsonb;raised boolean;actor uuid;member uuid:=gen_random_uuid();event_id uuid:=gen_random_uuid();booking_id uuid:=gen_random_uuid();late_id uuid:=gen_random_uuid();record jsonb;
begin
 r:=public.icsh_donation_save(id,repeat('a',64),repeat('b',64),1234,'','','','test');
 r:=public.icsh_form_payment_source('donation',id);if (r->>'amount')::integer<>1234 then raise exception 'Saved donation mismatch';end if;
 r:=public.icsh_form_payment_prepare('donation',id,'acct_fixture','test');
 raised:=false;begin perform public.icsh_form_payment_prepare('donation',id,'acct_wrong','test');exception when sqlstate '40001' then raised:=true;end;if not raised then raise exception 'Account isolation missing';end if;
 perform public.icsh_form_payment_attach('donation',id,'acct_fixture','test','cs_test_sharedfixture');
 raised:=false;begin perform public.icsh_form_payment_record('donation',id,'acct_fixture','test','cs_test_sharedfixture','evt_sharedwrong','checkout.session.completed','paid',1,'pi_sharedfixture','ch_sharedfixture',now(),0);exception when sqlstate '22023' then raised:=true;end;if not raised then raise exception 'Wrong amount accepted';end if;
 r:=public.icsh_form_payment_record('donation',id,'acct_fixture','test','cs_test_sharedfixture','evt_sharedpaid','checkout.session.completed','paid',1234,'pi_sharedfixture','ch_sharedfixture',now(),0);
 if r->>'status'<>'paid' then raise exception 'Payment not recorded';end if;
 perform public.icsh_form_payment_record('donation',id,'acct_fixture','test','cs_test_sharedfixture','evt_sharedpaid','checkout.session.completed','paid',1234,'pi_sharedfixture','ch_sharedfixture',now(),0);
 r:=public.icsh_form_payment_record('donation',id,'acct_fixture','test','cs_test_sharedfixture','evt_sharedstale','checkout.session.async_payment_failed','failed',1234);
 if r->>'status'<>'paid' then raise exception 'Stale failure overwrote paid';end if;
 r:=public.icsh_form_payment_record('donation',id,'acct_fixture','test','cs_test_sharedfixture','evt_sharedrefund','charge.refunded','refunded',1234,'pi_sharedfixture','ch_sharedfixture',now(),1234);
 if r->>'status'<>'refunded' then raise exception 'Refund not recorded';end if;
 select user_id into actor from public.icsh_organisers limit 1;if actor is null then raise exception 'Organiser fixture unavailable';end if;
 insert into public.icsh_membership_applications(id,request_hash,capability_hash,answers,category,fee_pence,mode,test_data,payment_status)
 values(member,repeat('c',64),repeat('d',64),jsonb_build_object('kind','new','firstName','Fixture','lastName','Deletion','dob','01/01/1990','email',member::text||'@example.invalid','mobile','07700900994','education','no','studentDeclaration',false,'terms',true,'accuracy',true),'standard',2000,'test',true,'awaiting_payment');
 perform public.icsh_membership_payment_prepare(member,'acct_fixture','test');
 raised:=false;begin perform public.icsh_membership_entries_delete(array[member],gen_random_uuid());exception when sqlstate '42501' then raised:=true;end;if not raised then raise exception 'Unauthorised deletion accepted';end if;
 if public.icsh_membership_entries_delete(array[member,member],actor)<>1 then raise exception 'Bulk deletion count incorrect';end if;
 if not exists(select 1 from public.icsh_membership_applications a where a.id=member and a.deleted_at is not null) or not exists(select 1 from public.icsh_membership_payments p where p.application_id=member) then raise exception 'Deletion erased payment audit';end if;
 if public.icsh_membership_entries_delete(array[member],actor)<>0 then raise exception 'Deletion retry not idempotent';end if;
 insert into public.icsh_forms(id,slug,title,status,kind,configuration,mode) values(event_id,'payment-fixture-'||event_id,'Payment fixture','published','tickets',jsonb_build_object('id',event_id,'title','Payment fixture','status','published','version',1,'startsAt',now()+interval '30 days','endsAt',now()+interval '30 days 2 hours','capacity',1,'prototype',false,'mode','test'),'test');
 record:=jsonb_build_object('id',booking_id,'reference','EVT-SHARED-FIXTURE','eventTitle','Payment fixture','mode','test','currency','gbp','total',1700,'status','pending','version',1,'capabilityHash',repeat('e',64),'contact',jsonb_build_object('email','shared@example.invalid'),'attendees',jsonb_build_array(jsonb_build_object('name','Fixture','unitAmount',1700)));
 insert into public.icsh_submissions(id,form_id,status,answers,mode) values(booking_id,event_id,'new',jsonb_build_object('record',record),'test');
 r:=public.icsh_form_payment_prepare('event',booking_id,'acct_fixture','test');if (r->>'amount')::integer<>1700 then raise exception 'Saved event amount mismatch';end if;
 perform public.icsh_form_payment_attach('event',booking_id,'acct_fixture','test','cs_test_eventfixture');
 perform public.icsh_form_payment_record('event',booking_id,'acct_fixture','test','cs_test_eventfixture','evt_eventpaid','checkout.session.completed','paid',1700,'pi_eventfixture','ch_eventfixture',now(),0);
 if (select s.answers->'record'->>'status' from public.icsh_submissions s where s.id=booking_id)<>'confirmed_paid' then raise exception 'Paid booking not confirmed';end if;
 record:=record||jsonb_build_object('id',late_id,'reference','EVT-LATE-FIXTURE');
 insert into public.icsh_submissions(id,form_id,status,answers,mode) values(late_id,event_id,'new',jsonb_build_object('record',record),'test');
 perform public.icsh_form_payment_prepare('event',late_id,'acct_fixture','test');perform public.icsh_form_payment_attach('event',late_id,'acct_fixture','test','cs_test_latefixture');
 perform public.icsh_form_payment_record('event',late_id,'acct_fixture','test','cs_test_latefixture','evt_eventlatepaid','checkout.session.completed','paid',1700,'pi_latefixture','ch_latefixture',now(),0);
 if (select s.answers->'record'->>'status' from public.icsh_submissions s where s.id=late_id)<>'cancelled' then raise exception 'Late payment overbooked capacity';end if;
 perform public.icsh_form_payment_record('event',booking_id,'acct_fixture','test','cs_test_eventfixture','evt_eventrefund','charge.refunded','refunded',1700,'pi_eventfixture','ch_eventfixture',now(),1700);
 if (select s.answers->'record'->>'status' from public.icsh_submissions s where s.id=booking_id)<>'cancelled' then raise exception 'Refunded booking did not release capacity';end if;
 if has_table_privilege('anon','public.icsh_donations','select') or has_function_privilege('anon','public.icsh_membership_entries_delete(uuid[],uuid)','execute') or has_function_privilege('authenticated','public.icsh_form_payment_prepare(text,uuid,text,text)','execute') then raise exception 'Private access leaked';end if;
end $$;
reset role;
select 'passed: service-role donation payment lifecycle, idempotency, account and amount isolation, guarded bulk deletion and retained audit, private access' as verification;
