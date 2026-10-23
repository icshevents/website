do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();r jsonb;raised boolean:=false;
begin
 insert into public.icsh_membership_applications(id,request_hash,capability_hash,answers,category,fee_pence,mode,test_data,payment_status)
 select id,repeat('a',64),repeat('b',64),jsonb_build_object('kind','new','firstName','Tricia','lastName','Hilario','dob','01/01/1990','email',id::text||'@example.invalid','mobile','+44'||(7700900000+row_number() over())::text,'education','no','studentDeclaration',false,'terms',true,'accuracy',true),'standard',2000,'live',false,'awaiting_payment' from unnest(array[a,b]) id;
 r:=public.icsh_member_id_reserve(a,'999990000001','TRHI1254');if r->>'member_id'<>'TRHI1254' then raise exception 'format reserve';end if;
 r:=public.icsh_member_id_reserve(a,'999990000001','TRHI9999');if r->>'member_id'<>'TRHI1254' then raise exception 'unstable reservation';end if;
 if public.icsh_member_id_reserve(b,'999990000002','TRHI1254') is not null then raise exception 'duplicate identifier';end if;
 r:=public.icsh_member_id_reserve(a,'999990000001','TRHI1111','TRHI1254');if r->>'member_id'<>'TRHI1111' then raise exception 'collision retry';end if;
 if not public.icsh_member_id_start('999990000001','TRHI1111') then raise exception 'write start';end if;
 r:=public.icsh_member_id_reserve(a,'999990000001','TRHI2222','TRHI1111');if r->>'member_id'<>'TRHI1111' then raise exception 'uncertain write changed ID';end if;
 perform public.icsh_member_id_confirm(a,'999990000001','TRHI1111');perform public.icsh_member_id_confirm(a,'999990000001','TRHI1111');
 if (select count(*) from public.icsh_member_ids where contact_id='999990000001')<>1 then raise exception 'duplicate contact ID';end if;
 begin perform public.icsh_member_id_confirm(a,'999990000001','TRHI2222');exception when sqlstate '40001' then raised:=true;end;if not raised then raise exception 'replaced confirmed ID';end if;
 update public.icsh_membership_applications set deleted_at=now() where id=b;
 raised:=false;begin perform public.icsh_member_id_reserve(b,'999990000002','TRHI3333');exception when sqlstate '22023' then raised:=true;end;if not raised then raise exception 'deleted source';end if;
 if has_table_privilege('anon','public.icsh_member_ids','select') or has_function_privilege('authenticated','public.icsh_member_id_reserve(uuid,text,text,text)','execute') then raise exception 'public access';end if;
end $$;
select 'passed: stable IDs, collisions, uncertain writes, no replacement, deleted sources and private access' as verification;
