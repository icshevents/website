-- Run after the schema in the SAME transaction and roll back afterwards.
do $$
declare fixture uuid:=gen_random_uuid(); r jsonb; raised boolean:=false;
begin
 insert into public.icsh_membership_applications(id,request_hash,capability_hash,answers,category,fee_pence,mode,test_data,payment_status)
 values(fixture,repeat('a',64),repeat('b',64),jsonb_build_object('kind','new','firstName','Fictional','lastName','Stripe Ledger Fixture','dob','01/01/1990','email',fixture::text||'@example.invalid','mobile','07700900998','education','no','studentDeclaration',false,'terms',true,'accuracy',true),'standard',2000,'test',true,'awaiting_payment');
 r:=public.icsh_membership_payment_prepare(fixture,'acct_fixture','test');
 if r->>'status'<>'pending' or (r->>'amount')::int<>2000 then raise exception 'prepare failed';end if;
 r:=public.icsh_membership_payment_prepare(fixture,'acct_fixture','test');
 if (select count(*) from public.icsh_membership_payments where application_id=fixture)<>1 then raise exception 'duplicate preparation';end if;
 begin perform public.icsh_membership_payment_prepare(fixture,'acct_other','test');exception when sqlstate '40001' then raised:=true;end;
 if not raised then raise exception 'account mismatch accepted';end if;
 r:=public.icsh_membership_payment_attach(fixture,'cs_test_ledgerfixture','acct_fixture','test');
 r:=public.icsh_membership_payment_record(fixture,'acct_fixture','test','cs_test_ledgerfixture','evt_ledgerpending','checkout.session.completed','pending',2000);
 if r->>'status'<>'pending' then raise exception 'unpaid checkout claimed paid';end if;
 raised:=false;begin perform public.icsh_membership_payment_record(fixture,'acct_fixture','test','cs_test_ledgerfixture','evt_badamount','checkout.session.completed','paid',1,'pi_ledgerfixture','ch_ledgerfixture',now(),0);exception when sqlstate '22023' then raised:=true;end;
 if not raised then raise exception 'wrong amount accepted';end if;
 r:=public.icsh_membership_payment_record(fixture,'acct_fixture','test','cs_test_ledgerfixture','evt_ledgerpaid','checkout.session.async_payment_succeeded','paid',2000,'pi_ledgerfixture','ch_ledgerfixture',now(),0);
 if r->>'status'<>'paid' or r->>'paid_at' is null then raise exception 'verified payment not recorded';end if;
 r:=public.icsh_membership_payment_record(fixture,'acct_fixture','test','cs_test_ledgerfixture','evt_ledgerpaid','checkout.session.async_payment_succeeded','paid',2000,'pi_ledgerfixture','ch_ledgerfixture',now(),0);
 if (select count(*) from public.icsh_membership_payment_events where event_id='evt_ledgerpaid')<>1 then raise exception 'duplicate event';end if;
 r:=public.icsh_membership_payment_record(fixture,'acct_fixture','test','cs_test_ledgerfixture','evt_stalefailure','checkout.session.async_payment_failed','failed',2000);
 if r->>'status'<>'paid' then raise exception 'stale failure overwrote payment';end if;
 r:=public.icsh_membership_payment_record(fixture,'acct_fixture','test','cs_test_ledgerfixture','evt_partialrefund','charge.refunded','partially_refunded',2000,'pi_ledgerfixture','ch_ledgerfixture',now(),500);
 if r->>'status'<>'partially_refunded' then raise exception 'partial refund not recorded';end if;
 r:=public.icsh_membership_payment_record(fixture,'acct_fixture','test','cs_test_ledgerfixture','evt_stalesuccess','checkout.session.completed','paid',2000,'pi_ledgerfixture','ch_ledgerfixture',now(),0);
 if r->>'status'<>'partially_refunded' then raise exception 'stale success erased refund';end if;
 r:=public.icsh_membership_payment_record(fixture,'acct_fixture','test','cs_test_ledgerfixture','evt_fullrefund','charge.refunded','refunded',2000,'pi_ledgerfixture','ch_ledgerfixture',now(),2000);
 if r->>'status'<>'refunded' then raise exception 'full refund not recorded';end if;
 if exists(select 1 from public.icsh_membership_applications where id=fixture and (payment_status<>'awaiting_payment' or start_date is not null or expiry_date is not null)) then raise exception 'payment changed activation fields';end if;
 if has_table_privilege('anon','public.icsh_membership_payments','select') or has_table_privilege('authenticated','public.icsh_membership_payment_events','select') then raise exception 'browser access granted';end if;
 if has_function_privilege('anon','public.icsh_membership_payment_record(uuid,text,text,text,text,text,text,integer,text,text,timestamptz,integer)','execute') then raise exception 'public webhook mutation privilege';end if;
end $$;
select 'passed: prepare, account isolation, mapping, pending/paid, amount checks, replay, stale events, refunds, activation isolation and browser access denial' as verification;
