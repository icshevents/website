-- Run with the pricing migration in a transaction, then roll back all fixtures.
do $$
declare fixture uuid:=gen_random_uuid();r jsonb;raised boolean;
begin
 insert into public.icsh_membership_applications(id,request_hash,capability_hash,answers,category,fee_pence,mode,test_data,payment_status)
 values(fixture,repeat('a',64),repeat('b',64),jsonb_build_object('kind','new','firstName','Test','lastName','TEST','dob','01/01/2020','email',fixture::text||'@example.invalid','mobile','07700900997','education','no','studentDeclaration',false,'terms',true,'accuracy',true),'standard',100,'test',true,'awaiting_payment');
 r:=public.icsh_membership_payment_prepare(fixture,'acct_fixture','test');
 if (r->>'amount')::int<>100 then raise exception 'Test Test did not prepare GBP 1';end if;
 perform public.icsh_membership_payment_attach(fixture,'cs_test_poundfixture','acct_fixture','test');
 raised:=false;
 begin perform public.icsh_membership_payment_record(fixture,'acct_fixture','test','cs_test_poundfixture','evt_poundwrongamount','checkout.session.completed','paid',2000,'pi_poundfixture','ch_poundfixture',now(),0);exception when sqlstate '22023' then raised:=true;end;
 if not raised then raise exception 'Test checkout accepted the normal membership amount';end if;
 r:=public.icsh_membership_payment_record(fixture,'acct_fixture','test','cs_test_poundfixture','evt_poundpaid','checkout.session.completed','paid',100,'pi_poundfixture','ch_poundfixture',now(),0);
 if r->>'status'<>'paid' then raise exception 'Test payment could not be recorded';end if;
 update public.icsh_membership_applications set answers=jsonb_set(answers,'{firstName}','"Alex"') where id=fixture;
 raised:=false;
 begin perform public.icsh_membership_payment_prepare(fixture,'acct_fixture','test');exception when sqlstate '22023' then raised:=true;end;
 if not raised then raise exception 'GBP 1 accepted for a non-test name';end if;
 update public.icsh_membership_applications set answers=answers-'firstName' where id=fixture;
 raised:=false;
 begin perform public.icsh_membership_payment_prepare(fixture,'acct_fixture','test');exception when sqlstate '22023' then raised:=true;end;
 if not raised then raise exception 'GBP 1 accepted without both names';end if;
 if has_table_privilege('anon','public.icsh_membership_payments','select') then raise exception 'Browser payment access was granted';end if;
end $$;
select 'passed: GBP 1 prepare and verified recording, wrong-amount denial, exact-name guard, missing-name denial and private access' as verification;
