do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();claim uuid:=gen_random_uuid();r jsonb;starts date:=(now() at time zone 'Europe/London')::date;
begin
 insert into public.icsh_membership_applications(id,request_hash,capability_hash,answers,category,fee_pence,mode,test_data,payment_status,bigin_sync_status,bigin_record_id,bigin_synced_at)
 select id,repeat('c',64),repeat('d',64),jsonb_build_object('kind','new','firstName','Free','lastName','Fixture','dob',to_char(starts-interval '20 years','DD/MM/YYYY'),'email',id::text||'@example.invalid','mobile','+44'||(7700980000+row_number() over())::text,'education','yes','studentDeclaration',true,'terms',true,'accuracy',true),'student',0,'live',false,'not_required','synced','999990000008',now() from unnest(array[a,b,c]) id;
 if not public.icsh_free_membership_eligible(a) then raise exception 'free eligibility failed';end if;
 if public.icsh_membership_activation_claim(a,'acct_fixture',claim) is not null then raise exception 'free treated as paid';end if;
 r:=public.icsh_free_membership_activation_claim(a,claim);
 if not (r->>'claimed')::boolean or r->'activation'->>'activation_kind'<>'free' then raise exception 'free claim failed';end if;
 if r->'activation'->>'payment_intent_id' is not null or r->'activation'->>'paid_at' is not null then raise exception 'fake payment evidence';end if;
 if (r->'activation'->>'start_date')::date<>starts or (r->'activation'->>'expiry_date')::date<>(starts+interval '1 year')::date then raise exception 'wrong free term';end if;
 if (public.icsh_free_membership_activation_claim(a,gen_random_uuid())->>'claimed')::boolean then raise exception 'concurrent free claim';end if;
 if public.icsh_membership_activation_bind(a,gen_random_uuid(),'999990000008') then raise exception 'unowned free claim';end if;
 if not public.icsh_membership_activation_bind(a,claim,'999990000008') then raise exception 'free bind failed';end if;
 r:=public.icsh_membership_activation_finish(a,claim,'active');if r->>'status'<>'active' then raise exception 'free finish failed';end if;
 if (public.icsh_free_membership_activation_claim(a,gen_random_uuid())->>'claimed')::boolean then raise exception 'free replay extended';end if;
 update public.icsh_membership_applications set answers=jsonb_set(answers,'{studentDeclaration}','false') where id=b;
 if public.icsh_free_membership_activation_claim(b,claim) is not null then raise exception 'missing declaration activated';end if;
 r:=public.icsh_free_membership_activation_claim(c,claim);update public.icsh_membership_applications set deleted_at=now() where id=c;
 if public.icsh_membership_activation_bind(c,claim,'999990000008') then raise exception 'deleted application bound';end if;
 r:=public.icsh_membership_activation_finish(c,claim,'active');if r->>'status'<>'review_required' then raise exception 'deleted application activated';end if;
 if has_function_privilege('anon','public.icsh_free_membership_activation_claim(uuid,uuid)','execute') or has_function_privilege('authenticated','public.icsh_free_membership_activation_candidates()','execute') then raise exception 'public free activation permission';end if;
end $$;
