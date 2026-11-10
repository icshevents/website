begin;
do $$
declare fixture uuid:=gen_random_uuid();r jsonb;raised boolean:=false;marker text:='reconcile_'||repeat('a',64);
begin
 insert into public.icsh_membership_applications(id,request_hash,capability_hash,answers,category,fee_pence,mode,test_data,payment_status)
 values(fixture,repeat('a',64),repeat('b',64),jsonb_build_object('kind','new','firstName','Fictional','lastName','Return Check','dob','01/01/1990','email',fixture::text||'@example.invalid','mobile','07700900998','education','no','studentDeclaration',false,'terms',true,'accuracy',true),'standard',2000,'test',true,'awaiting_payment');
 perform public.icsh_membership_payment_prepare(fixture,'acct_fixture','test');
 perform public.icsh_membership_payment_attach(fixture,'cs_test_returnfixture','acct_fixture','test');
 begin perform public.icsh_membership_payment_record(fixture,'acct_fixture','test','cs_test_returnfixture',marker,'checkout.session.completed','paid',2000,'pi_returnfixture','py_returnfixture',now(),0);exception when sqlstate '22023' then raised:=true;end;if not raised then raise exception 'Internal marker impersonated a Stripe event';end if;
 raised:=false;begin perform public.icsh_membership_payment_record(fixture,'acct_fixture','test','cs_test_returnfixture','evt_wrongsource','internal.checkout.reconciled','paid',2000,'pi_returnfixture','py_returnfixture',now(),0);exception when sqlstate '22023' then raised:=true;end;if not raised then raise exception 'Native event impersonated reconciliation';end if;
 r:=public.icsh_membership_payment_record(fixture,'acct_fixture','test','cs_test_returnfixture',marker,'internal.checkout.reconciled','paid',2000,'pi_returnfixture','py_returnfixture',now(),0);
 if r->>'status'<>'paid' then raise exception 'Verified return not recorded';end if;
 perform public.icsh_membership_payment_record(fixture,'acct_fixture','test','cs_test_returnfixture',marker,'internal.checkout.reconciled','paid',2000,'pi_returnfixture','py_returnfixture',now(),0);
 if (select count(*) from public.icsh_membership_payment_events where application_id=fixture)<>1 then raise exception 'Duplicate return event';end if;
 perform public.icsh_membership_payment_record(fixture,'acct_fixture','test','cs_test_returnfixture','evt_laterwebhook','checkout.session.completed','paid',2000,'pi_returnfixture','py_returnfixture',now(),0);
 r:=public.icsh_membership_payment_record(fixture,'acct_fixture','test','cs_test_returnfixture','evt_refundreturn','charge.refunded','partially_refunded',2000,'pi_returnfixture','py_returnfixture',now(),100);
 r:=public.icsh_membership_payment_record(fixture,'acct_fixture','test','cs_test_returnfixture','reconcile_'||repeat('b',64),'internal.checkout.reconciled','paid',2000,'pi_returnfixture','py_returnfixture',now(),0);
 if r->>'status'<>'partially_refunded' then raise exception 'Stale return undid refund';end if;
 if has_function_privilege('anon','public.icsh_membership_payment_record(uuid,text,text,text,text,text,text,integer,text,text,timestamptz,integer)','execute') or has_function_privilege('authenticated','public.icsh_membership_payment_record(uuid,text,text,text,text,text,text,integer,text,text,timestamptz,integer)','execute') then raise exception 'Browser payment mutation granted';end if;
end $$;
select 'passed: source separation, non-card evidence, idempotent return, later webhook, refund precedence and private RPC' as verification;
rollback;
