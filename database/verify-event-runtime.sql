-- Transactional verification with fictional records. All test data is rolled back.
begin;
set local role service_role;
do $$
declare f uuid := gen_random_uuid(); r uuid := gen_random_uuid(); second_id uuid := gen_random_uuid();
  cfg jsonb; form_data jsonb; record_data jsonb; request_data jsonb; blocked boolean;
begin
  cfg := jsonb_build_object('id',f,'slug','runtime-test-'||f,'title','Fictional runtime check','status','published','version',1,'startsAt','2099-12-01T12:00:00Z','endsAt','2099-12-01T17:00:00Z','capacity',1);
  form_data := jsonb_build_object('id',f,'slug',cfg->>'slug','title',cfg->>'title','kind','tickets','status','published','configuration',cfg,'mode','test','created_at',now());
  perform public.icsh_event_write(jsonb_build_array(jsonb_build_object('table','forms','expected_version',null,'data',form_data)),'[]');
  record_data := jsonb_build_object('id',r,'form_id',f,'submitted_at',now(),'status','new','mode','test','request_key','runtime-duplicate-check','answers',jsonb_build_object('record',jsonb_build_object('id',r,'version',1,'status','confirmed_free','attendees',jsonb_build_array(jsonb_build_object('name','Fictional tester')))));
  request_data := jsonb_build_object('table','submissions','expected_version',null,'form_version',1,'data',record_data);
  perform public.icsh_event_write(jsonb_build_array(request_data),'[]');

  blocked := false;
  begin
    perform public.icsh_event_write(jsonb_build_array(request_data || jsonb_build_object('data',record_data || jsonb_build_object('id',second_id,'request_key','another-request'))),'[]');
  exception when sqlstate 'P0001' then
    if sqlerrm like '%not enough places%' then blocked:=true; else raise; end if;
  end;
  if not blocked then raise exception 'Capacity protection did not reject the second attendee'; end if;

  blocked := false;
  begin
    perform public.icsh_event_write(jsonb_build_array(request_data || jsonb_build_object('expected_version',99)),'[]');
  exception when sqlstate '40001' then blocked := true;
  end;
  if not blocked then raise exception 'Stale-version protection did not reject the update'; end if;

  blocked := false;
  begin
    perform public.icsh_event_write(jsonb_build_array(request_data || jsonb_build_object('data',record_data || jsonb_build_object('id',second_id,'answers',jsonb_build_object('record',jsonb_build_object('version',1,'status','failed','attendees','[]'::jsonb))))),'[]');
  exception when unique_violation then blocked := true;
  end;
  if not blocked then raise exception 'Duplicate-request protection did not reject the insert'; end if;

  if not public.icsh_event_rate_limit('transactional-runtime-check-'||f,1)
    or public.icsh_event_rate_limit('transactional-runtime-check-'||f,1) then raise exception 'Persistent rate limiter failed'; end if;

  cfg := cfg || jsonb_build_object('status','closed','version',2);
  perform public.icsh_event_write(jsonb_build_array(jsonb_build_object('table','forms','expected_version',1,'data',form_data || jsonb_build_object('status','closed','configuration',cfg))),'[]');
  blocked := false;
  begin
    perform public.icsh_event_write(jsonb_build_array(request_data || jsonb_build_object('form_version',2,'data',record_data || jsonb_build_object('id',second_id,'request_key','closed-request'))),'[]');
  exception when sqlstate 'P0001' then blocked := true;
  end;
  if not blocked then raise exception 'Closed-form protection did not reject the insert'; end if;
end $$;
rollback;

select 'capacity, version conflict, idempotency, rate limit and closed-form checks passed' as runtime_checks;
select tablename, rowsecurity from pg_tables where schemaname='public' and tablename like 'icsh_%';
select has_function_privilege('anon','public.icsh_event_write(jsonb,jsonb)','execute') as anonymous_write_allowed,
  has_function_privilege('authenticated','public.icsh_event_write(jsonb,jsonb)','execute') as signed_in_write_allowed,
  has_function_privilege('service_role','public.icsh_event_write(jsonb,jsonb)','execute') as server_write_allowed;
