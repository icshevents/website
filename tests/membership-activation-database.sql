do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();claim uuid:=gen_random_uuid();r jsonb;raised boolean:=false;
begin
 insert into public.icsh_membership_applications(id,request_hash,capability_hash,answers,category,fee_pence,mode,test_data,payment_status)
 select id,repeat('a',64),repeat('b',64),jsonb_build_object('kind','new','firstName','Activation','lastName','Fixture','dob','01/01/1990','email',id::text||'@example.invalid','mobile','+44'||(7700900000+row_number() over())::text,'education','no','studentDeclaration',false,'terms',true,'accuracy',true),'standard',2000,'live',false,'awaiting_payment' from unnest(array[a,b,c]) id;
 insert into public.icsh_membership_payments(application_id,account_id,mode,amount,currency,session_id,payment_intent_id,charge_id,status,paid_at)
 select id,'acct_fixture','live',2000,'gbp','cs_live_'||replace(id::text,'-',''),'pi_'||replace(id::text,'-',''),'ch_'||replace(id::text,'-',''),'paid',now()-interval '1 day' from unnest(array[a,b,c]) id;
 if public.icsh_membership_activation_claim(a,'acct_other',claim) is not null then raise exception 'wrong account';end if;
 r:=public.icsh_membership_activation_claim(a,'acct_fixture',claim);if not (r->>'claimed')::boolean then raise exception 'claim failed';end if;
 if (r->'activation'->>'start_date')::date<>((now()-interval '1 day') at time zone 'Europe/London')::date then raise exception 'wrong UK date';end if;
 if (r->'activation'->>'expiry_date')::date<>(((now()-interval '1 day') at time zone 'Europe/London')::date+interval '1 year')::date then raise exception 'wrong anniversary';end if;
 if (public.icsh_membership_activation_claim(a,'acct_fixture',gen_random_uuid())->>'claimed')::boolean then raise exception 'concurrent claim';end if;
 if public.icsh_membership_activation_bind(a,gen_random_uuid(),'999990000001') then raise exception 'wrong claim bound';end if;
 begin perform public.icsh_membership_activation_finish(a,claim,'active');exception when sqlstate '22023' then raised:=true;end;if not raised then raise exception 'active without contact';end if;
 if not public.icsh_membership_activation_bind(a,claim,'999990000001') then raise exception 'bind failed';end if;
 r:=public.icsh_membership_activation_finish(a,claim,'active');if r->>'status'<>'active' or r->>'activated_at' is null then raise exception 'finish failed';end if;
 if (public.icsh_membership_activation_claim(a,'acct_fixture',gen_random_uuid())->>'claimed')::boolean then raise exception 'active replay';end if;
 if not exists(select 1 from public.icsh_membership_applications where id=a and bigin_record_id='999990000001' and bigin_sync_status='synced') then raise exception 'contact association missing';end if;
 update public.icsh_membership_payments set status='pending',payment_intent_id=null,charge_id=null,paid_at=null where application_id=b;
 if public.icsh_membership_activation_claim(b,'acct_fixture',claim) is not null then raise exception 'unpaid activation';end if;
 r:=public.icsh_membership_activation_claim(c,'acct_fixture',claim);update public.icsh_membership_payments set status='refunded',refunded_amount=amount where application_id=c;
 if public.icsh_membership_activation_bind(c,claim,'999990000002') then raise exception 'refund bound';end if;
 r:=public.icsh_membership_activation_finish(c,claim,'active');if r->>'status'<>'review_required' then raise exception 'refund activated';end if;
 if has_table_privilege('anon','public.icsh_membership_activations','select') or has_function_privilege('authenticated','public.icsh_membership_activation_claim(uuid,text,uuid)','execute') then raise exception 'public activation access';end if;
end $$;
select 'passed: paid-only activation, account/claim isolation, UK dates, readback completion, idempotency, refund race and public denial' as verification;
