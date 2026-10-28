-- Isolated PostgreSQL only: run after the launch/renewal fixtures and retirement SQL.
do $$
declare fixture uuid:='e13e0d4e-f40f-4bb6-995b-c1d4dd888705';a jsonb;r jsonb;blocked boolean:=false;
begin
 assert not public.icsh_free_membership_eligible('e13e0d4e-f40f-4bb6-995b-c1d4dd888702'),'retired standard test eligibility';
 assert public.icsh_free_membership_activation_claim('e13e0d4e-f40f-4bb6-995b-c1d4dd888702',gen_random_uuid()) is null,'no free reactivation of standard test';
 assert (select status='active' and expiry_date='2027-10-28' from public.icsh_membership_activations where application_id='e13e0d4e-f40f-4bb6-995b-c1d4dd888702'),'completed renewal retained';
 assert (select count(*)=2 from public.icsh_form_emails where source_table='membership_active' and source_id in('e13e0d4e-f40f-4bb6-995b-c1d4dd888701','e13e0d4e-f40f-4bb6-995b-c1d4dd888702')),'historical emails retained without resend';
 a:='{"kind":"new","firstName":"Test","lastName":"Test","email":"retirement@example.invalid","mobile":"07700900111","dob":"01/01/1990","education":"no","studentDeclaration":false,"terms":true,"accuracy":true}'::jsonb;
 perform public.icsh_membership_application_save(fixture,repeat('8',64),repeat('9',64),a,'standard',100,'awaiting_payment','live');
 begin perform public.icsh_membership_payment_prepare(fixture,'acct_fixture','live');exception when sqlstate '22023' then blocked:=true;end;
 assert blocked,'new pound checkout blocked';
 update public.icsh_membership_applications set fee_pence=2000 where id=fixture;
 r:=public.icsh_membership_payment_prepare(fixture,'acct_fixture','live');assert (r->>'amount')::int=2000,'standard checkout retained';
 delete from public.icsh_membership_payments where application_id=fixture;
 update public.icsh_membership_applications set category='pensioner',fee_pence=1500 where id=fixture;
 r:=public.icsh_membership_payment_prepare(fixture,'acct_fixture','live');assert (r->>'amount')::int=1500,'senior checkout retained';
 delete from public.icsh_membership_payments where application_id=fixture;
 update public.icsh_membership_applications set category='student',fee_pence=0,payment_status='not_required',created_at=now(),bigin_sync_status='synced',bigin_record_id='887766554433221199',bigin_synced_at=now(),answers=jsonb_set(jsonb_set(jsonb_set(answers,'{dob}','"01/01/2006"'),'{education}','"yes"'),'{studentDeclaration}','true') where id=fixture;
 assert public.icsh_free_membership_eligible(fixture),'student free eligibility retained';
 r:=public.icsh_free_membership_activation_claim(fixture,gen_random_uuid());
 assert r->>'claimed'='true' and (r->'activation'->>'start_date')::date=(now() at time zone 'Europe/London')::date,'normal start date for Test Test student';
 assert (r->'activation'->>'expiry_date')::date=((now() at time zone 'Europe/London')::date+interval '1 year')::date,'normal twelve-month term';
 assert not has_function_privilege('anon','public.icsh_free_membership_activation_claim(uuid,uuid)','EXECUTE'),'free claim remains private';
 assert not has_function_privilege('authenticated','public.icsh_membership_payment_prepare(uuid,text,text)','EXECUTE'),'checkout preparation remains private';
end $$;
select json_build_object('status','PASS','checks',array['test pricing disabled','historical renewals preserved','normal standard and senior payments','student activation and rolling term','private permissions']);
