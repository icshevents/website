-- Live public forms; retain historical tests, RLS, private receipts and pending activation.
-- Compatible with the prior deployment: omitted p_mode remains test.
BEGIN;
ALTER TABLE public.icsh_forms DROP CONSTRAINT icsh_forms_mode_check;
ALTER TABLE public.icsh_forms ADD CONSTRAINT icsh_forms_mode_check CHECK (mode IN ('test','live'));
ALTER TABLE public.icsh_submissions DROP CONSTRAINT icsh_submissions_mode_check;
ALTER TABLE public.icsh_submissions ADD CONSTRAINT icsh_submissions_mode_check CHECK (mode IN ('test','live'));
ALTER TABLE public.icsh_membership_applications DROP CONSTRAINT icsh_membership_applications_answers_check2;
ALTER TABLE public.icsh_membership_applications ADD CONSTRAINT icsh_membership_applications_answers_check2 CHECK (answers->>'email' IS NOT NULL AND answers->>'email' ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' AND (mode='live' OR answers->>'email' ~ '^[^[:space:]@<>]+@example\.invalid$'));
ALTER TABLE public.icsh_membership_applications DROP CONSTRAINT icsh_membership_applications_mode_check;
ALTER TABLE public.icsh_membership_applications ADD CONSTRAINT icsh_membership_applications_mode_check CHECK (mode IN ('test','live'));
ALTER TABLE public.icsh_membership_applications DROP CONSTRAINT icsh_membership_applications_test_data_check;
ALTER TABLE public.icsh_membership_applications ADD CONSTRAINT icsh_membership_applications_test_data_check CHECK (test_data = (mode = 'test'));
DROP INDEX public.icsh_membership_application_email_unique;
DROP INDEX public.icsh_membership_application_phone_unique;
CREATE UNIQUE INDEX icsh_membership_application_email_unique ON public.icsh_membership_applications (mode,lower(btrim(answers->>'email')));
CREATE UNIQUE INDEX icsh_membership_application_phone_unique ON public.icsh_membership_applications (mode,public.icsh_membership_mobile_key(answers->>'mobile'));
DROP FUNCTION public.icsh_membership_application_save(uuid,text,text,jsonb,text,integer,text);
CREATE OR REPLACE FUNCTION public.icsh_membership_application_save(p_id uuid, p_request_hash text, p_capability_hash text, p_answers jsonb, p_category text, p_fee_pence integer, p_payment_status text, p_mode text DEFAULT 'test'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare saved public.icsh_membership_applications; inserted boolean; duplicate_constraint text;
begin
  if p_id is null or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$'
    or p_capability_hash is null or p_capability_hash !~ '^[a-f0-9]{64}$'
    or p_answers is null or jsonb_typeof(p_answers) <> 'object' or octet_length(p_answers::text) > 12000
    or p_answers->>'kind' is null or p_answers->>'kind' not in ('new', 'renewal')
    or p_mode is null or p_mode not in ('test','live')
    or p_answers->>'email' is null or p_answers->>'email' !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
    or (p_mode='test' and p_answers->>'email' !~ '^[^[:space:]@<>]+@example\.invalid$')
    or p_category is null or p_category not in ('standard', 'pensioner', 'student')
    or p_fee_pence is null or p_fee_pence < 0 or p_fee_pence > 1000000
    or p_payment_status is null
    or not ((p_fee_pence = 0 and p_payment_status = 'not_required') or (p_fee_pence > 0 and p_payment_status = 'awaiting_payment')) then
    raise exception using errcode = '22023', message = 'Invalid membership application';
  end if;
  begin
    insert into public.icsh_membership_applications(id, request_hash, capability_hash, answers, category, fee_pence, payment_status, mode, test_data)
      values(p_id, p_request_hash, p_capability_hash, p_answers, p_category, p_fee_pence, p_payment_status, p_mode, p_mode='test')
      on conflict(id) do nothing returning * into saved;
    inserted := found;
  exception when unique_violation then
    get stacked diagnostics duplicate_constraint = CONSTRAINT_NAME;
    if duplicate_constraint = 'icsh_membership_application_email_unique' then
      raise exception using errcode = 'P2001', message = 'Membership application email already in use';
    elsif duplicate_constraint = 'icsh_membership_application_phone_unique' then
      raise exception using errcode = 'P2002', message = 'Membership application phone already in use';
    end if;
    raise;
  end;
  if not inserted then
    select * into saved from public.icsh_membership_applications where id = p_id for update;
    if saved.id is null or saved.request_hash <> p_request_hash or saved.capability_hash <> p_capability_hash or saved.mode <> p_mode then
      raise exception using errcode = '23505', message = 'Membership request conflict';
    end if;
  else
    insert into public.icsh_audit_events(action, record_id)
      values('membership.application.saved', saved.id::text);
  end if;
  return jsonb_build_object('application', to_jsonb(saved), 'created', inserted);
end $function$
;
CREATE OR REPLACE FUNCTION public.icsh_event_write(p_changes jsonb, p_audit jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c jsonb; d jsonb; a jsonb; previous public.icsh_forms;
  parent public.icsh_forms; changed integer; expected integer; active_places integer; new_places integer;
begin
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 20
    or jsonb_typeof(p_audit) <> 'array' or jsonb_array_length(p_audit) > 30 then
    raise exception 'Invalid event transaction';
  end if;
  for c in select value from jsonb_array_elements(p_changes) loop
    d := c->'data'; expected := (c->>'expected_version')::integer;
    if c->>'table' = 'forms' then
      if d->>'mode' is null or d->>'mode' not in ('test','live') or d->'configuration'->>'mode' is distinct from d->>'mode' then raise exception 'Invalid form mode'; end if;
      select * into previous from public.icsh_forms where id = (d->>'id')::uuid for update;
      if expected is null then
        insert into public.icsh_forms(id,slug,title,status,kind,configuration,mode,created_at)
          values((d->>'id')::uuid,d->>'slug',d->>'title',d->>'status',d->>'kind',d->'configuration',d->>'mode',(d->>'created_at')::timestamptz);
      else
        if previous.id is null or coalesce((previous.configuration->>'version')::integer,0) <> expected then
          raise exception using errcode = '40001', message = 'Form changed elsewhere. Reload before saving.';
        end if;
        if previous.kind = 'tickets' then
          select coalesce(sum(jsonb_array_length(answers->'record'->'attendees')),0)::integer into active_places
            from public.icsh_submissions where form_id = previous.id and mode = d->>'mode'
            and coalesce(answers->'record'->>'status','') not in ('failed','cancelled');
          if active_places > (d->'configuration'->>'capacity')::integer then
            raise exception using errcode = 'P0001', message = 'Capacity cannot be below existing attendees.';
          end if;
        end if;
        update public.icsh_forms set slug=d->>'slug',title=d->>'title',status=d->>'status',
          configuration=d->'configuration',mode=d->>'mode' where id=previous.id;
      end if;
    elsif c->>'table' = 'submissions' then
      select * into parent from public.icsh_forms where id=(d->>'form_id')::uuid for update;
      if parent.id is null then raise exception 'Form unavailable'; end if;
      if d->>'mode' is null or d->>'mode' not in ('test','live') or d->'answers'->'record'->>'mode' is distinct from d->>'mode' then raise exception 'Invalid submission mode'; end if;
      if expected is null then
        if d->>'mode' is distinct from parent.mode then raise exception 'Form mode changed'; end if;
        if parent.status <> 'published' or parent.configuration->>'status' <> 'published'
          or (parent.configuration->>'startsAt')::timestamptz <= now()
          or (nullif(parent.configuration->>'deadline',''))::timestamptz <= now()
          or coalesce((parent.configuration->>'version')::integer,0) <> (c->>'form_version')::integer then
          raise exception using errcode = 'P0001', message = 'The form changed or closed. Reload before submitting.';
        end if;
      end if;
      if parent.kind = 'tickets' and coalesce(d->'answers'->'record'->>'status','') not in ('failed','cancelled') then
        select coalesce(sum(jsonb_array_length(answers->'record'->'attendees')),0)::integer into active_places
          from public.icsh_submissions where form_id=parent.id and mode=d->>'mode' and id<>(d->>'id')::uuid
          and coalesce(answers->'record'->>'status','') not in ('failed','cancelled');
        new_places := jsonb_array_length(d->'answers'->'record'->'attendees');
        if active_places + new_places > (parent.configuration->>'capacity')::integer then
          raise exception using errcode='P0001', message='There are not enough places remaining.';
        end if;
      end if;
      if expected is null then
        insert into public.icsh_submissions(id,form_id,submitted_at,status,answers,mode,request_key)
          values((d->>'id')::uuid,parent.id,(d->>'submitted_at')::timestamptz,d->>'status',d->'answers',parent.mode,d->>'request_key');
      else
        update public.icsh_submissions set status=d->>'status',answers=d->'answers'
          where id=(d->>'id')::uuid and form_id=parent.id and mode=d->>'mode'
          and coalesce((answers->'record'->>'version')::integer,0)=expected;
        get diagnostics changed = row_count;
        if changed <> 1 then raise exception using errcode='40001',message='Registration changed elsewhere. Reload before saving.'; end if;
      end if;
    else raise exception 'Invalid event table';
    end if;
  end loop;
  for a in select value from jsonb_array_elements(p_audit) loop
    insert into public.icsh_audit_events(action,record_id,occurred_at)
      values(a->>'action',a->>'id',(a->>'at')::timestamptz);
  end loop;
  return true;
end $function$
;
REVOKE ALL ON FUNCTION public.icsh_membership_application_save(uuid,text,text,jsonb,text,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.icsh_membership_application_save(uuid,text,text,jsonb,text,integer,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.icsh_event_write(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.icsh_event_write(jsonb,jsonb) TO service_role;
COMMIT;
