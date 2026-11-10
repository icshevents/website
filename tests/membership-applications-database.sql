-- Run intentionally after database/membership-applications.sql.
-- Every fixture and audit entry is rolled back; no Bigin/provider calls occur.
begin;

do $$
declare role_name text;
begin
  assert (select c.relrowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'icsh_membership_applications'), 'Membership RLS must be enabled';
  foreach role_name in array array['anon', 'authenticated'] loop
    assert not has_table_privilege(role_name, 'public.icsh_membership_applications', 'SELECT,INSERT,UPDATE,DELETE'), 'Browser role has table privileges';
    assert not has_function_privilege(role_name, 'public.icsh_membership_application_save(uuid,text,text,jsonb,text,integer,text)', 'EXECUTE'), 'Browser role can save applications';
    assert not has_function_privilege(role_name, 'public.icsh_membership_bigin_claim(uuid,uuid)', 'EXECUTE'), 'Browser role can claim sync work';
    assert not has_function_privilege(role_name, 'public.icsh_membership_bigin_complete(uuid,uuid,text,text,text)', 'EXECUTE'), 'Browser role can complete sync work';
  end loop;
  assert has_table_privilege('service_role', 'public.icsh_membership_applications', 'SELECT'), 'Server SELECT missing';
  assert has_table_privilege('service_role', 'public.icsh_membership_applications', 'INSERT'), 'Server INSERT missing';
  assert has_table_privilege('service_role', 'public.icsh_membership_applications', 'UPDATE'), 'Server UPDATE missing';
  assert not has_table_privilege('service_role', 'public.icsh_membership_applications', 'DELETE'), 'Unneeded server DELETE granted';
  assert not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('icsh_membership_application_save', 'icsh_membership_bigin_claim', 'icsh_membership_bigin_complete') and p.prosecdef), 'Membership functions must be invoker';
end $$;

set local role service_role;
do $$
declare
  id_one uuid := gen_random_uuid(); id_two uuid := gen_random_uuid(); id_three uuid := gen_random_uuid();
  claim_one uuid := gen_random_uuid(); claim_two uuid := gen_random_uuid(); r jsonb;
  payload jsonb := '{"kind":"new","firstName":"Test","lastName":"Rollback","dob":"01/01/1990","mobile":"07700900000","email":"sql-verification@example.invalid","education":"no","studentDeclaration":false,"terms":true,"accuracy":true}';
begin
  r := public.icsh_membership_application_save(id_one, repeat('a',64), repeat('b',64), payload, 'standard', 2000, 'awaiting_payment');
  assert (r->>'created')::boolean, 'First application must be created';
  assert r->'application'->>'reference' = 'TEST-MEM-' || upper(replace(id_one::text, '-', '')), 'Reference must derive from request ID';
  assert r->'application'->>'mode' = 'test' and (r->'application'->>'test_data')::boolean, 'Only test records allowed';
  assert r->'application'->>'start_date' is null and r->'application'->>'expiry_date' is null, 'Saving must not activate membership';
  assert r->'application'->>'bigin_sync_status' = 'awaiting_authorisation', 'Saving must not claim Bigin delivery';
  r := public.icsh_membership_application_save(id_one, repeat('a',64), repeat('b',64), payload, 'standard', 2000, 'awaiting_payment');
  assert not (r->>'created')::boolean, 'Retry must reuse the original application';
  assert (select count(*) from public.icsh_membership_applications where id = id_one) = 1, 'Retry created duplicate rows';
  begin
    perform public.icsh_membership_application_save(id_one, repeat('c',64), repeat('b',64), payload, 'standard', 2000, 'awaiting_payment');
    raise exception 'A changed request hash was accepted';
  exception when unique_violation then null; end;
  begin
    perform public.icsh_membership_application_save(id_one, repeat('a',64), repeat('c',64), payload, 'standard', 2000, 'awaiting_payment');
    raise exception 'A changed capability was accepted';
  exception when unique_violation then null; end;
  begin
    perform public.icsh_membership_application_save(gen_random_uuid(), repeat('a',64), repeat('b',64), payload || '{"email":"real@example.com"}'::jsonb, 'standard', 2000, 'awaiting_payment');
    raise exception 'A non-test email was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.icsh_membership_application_save(gen_random_uuid(), repeat('a',64), repeat('b',64), payload, 'standard', 2000, 'not_required');
    raise exception 'A paid fee was allowed without payment outstanding';
  exception when invalid_parameter_value then null; end;

  r := public.icsh_membership_bigin_claim(id_one, claim_one);
  assert r->>'bigin_sync_status' = 'syncing' and r->>'sync_claim_id' = claim_one::text, 'Sync claim missing';
  assert public.icsh_membership_bigin_claim(id_one, claim_two) is null, 'Concurrent worker claimed the same application';
  begin
    perform public.icsh_membership_bigin_complete(id_one, claim_two, 'failed', null, 'ZOHO_UNAVAILABLE');
    raise exception 'A different worker completed the claim';
  exception when serialization_failure then null; end;
  r := public.icsh_membership_bigin_complete(id_one, claim_one, 'outcome_unknown', null, 'ZOHO_WRITE_OUTCOME_UNKNOWN');
  assert r->>'bigin_sync_status' = 'outcome_unknown', 'Uncertain result was not preserved';
  assert public.icsh_membership_bigin_claim(id_one, claim_two) is null, 'Unknown create outcome was automatically retried';

  payload := payload || '{"education":"yes","studentDeclaration":true,"dob":"01/01/2006"}'::jsonb;
  r := public.icsh_membership_application_save(id_two, repeat('a',64), repeat('b',64), payload, 'student', 0, 'not_required');
  assert r->'application'->>'payment_status' = 'not_required' and r->'application'->>'start_date' is null, 'Free application was marked paid/active';
  perform public.icsh_membership_bigin_claim(id_two, claim_one);
  r := public.icsh_membership_bigin_complete(id_two, claim_one, 'outcome_unknown', '9000000000001', 'ZOHO_UNAVAILABLE');
  r := public.icsh_membership_bigin_claim(id_two, claim_two);
  assert r->>'bigin_record_id' = '9000000000001', 'Verification-only retry lost known Contact ID';
  begin
    perform public.icsh_membership_bigin_complete(id_two, claim_two, 'synced', '9000000000002', null);
    raise exception 'Known Bigin ID was overwritten';
  exception when serialization_failure then null; end;
  r := public.icsh_membership_bigin_complete(id_two, claim_two, 'synced', null, null);
  assert r->>'bigin_record_id' = '9000000000001' and r->>'bigin_synced_at' is not null, 'Verified delivery not recorded';
  assert public.icsh_membership_bigin_claim(id_two, claim_one) is null, 'Synced application was sent again';

  payload := payload || '{"kind":"renewal","education":"no","studentDeclaration":false,"dob":"01/01/1990"}'::jsonb;
  perform public.icsh_membership_application_save(id_three, repeat('a',64), repeat('b',64), payload, 'standard', 2000, 'awaiting_payment');
  perform public.icsh_membership_bigin_claim(id_three, claim_one);
  update public.icsh_membership_applications set sync_lease_until = now() - interval '1 second' where id = id_three;
  assert public.icsh_membership_bigin_claim(id_three, claim_two) is null, 'Expired worker was replaced with another create';
  assert (select bigin_sync_status = 'outcome_unknown' from public.icsh_membership_applications where id = id_three), 'Expired claim was not marked uncertain';
  assert public.icsh_membership_bigin_claim(id_three, claim_two) is null, 'Expired unknown create outcome was retried';
  r := public.icsh_membership_bigin_complete(id_three, claim_one, 'synced', '9000000000003', null);
  assert r->>'bigin_record_id' = '9000000000003', 'Original worker could not record its late confirmed result';
  assert r->>'application_status' = 'received' and r->>'start_date' is null and r->>'expiry_date' is null, 'Sync changed membership status/dates';
end $$;

rollback;
select 'Membership application storage checks passed; all fixtures rolled back.' as verification;
