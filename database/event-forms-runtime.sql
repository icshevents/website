-- Main website event forms: private server-side writes, rate limits and audit history.
-- Existing organiser access and anonymous restrictions remain in place.
begin;

alter table public.icsh_submissions add column if not exists request_key text;
create unique index if not exists icsh_submission_request_idx
  on public.icsh_submissions (form_id, request_key) where request_key is not null;

create table if not exists public.icsh_request_limits (
  key text primary key,
  attempts integer not null check (attempts > 0),
  expires_at timestamptz not null
);
create index if not exists icsh_request_limits_expiry_idx on public.icsh_request_limits(expires_at);
create table if not exists public.icsh_audit_events (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  record_id text not null,
  occurred_at timestamptz not null default now()
);
create index if not exists icsh_audit_events_time_idx on public.icsh_audit_events(occurred_at desc);
alter table public.icsh_request_limits enable row level security;
alter table public.icsh_audit_events enable row level security;
revoke all on public.icsh_request_limits, public.icsh_audit_events from public, anon, authenticated;
grant select, insert, update, delete on public.icsh_request_limits to service_role;
grant select, insert on public.icsh_audit_events to service_role;
grant select, insert, update on public.icsh_forms, public.icsh_submissions to service_role;

create or replace function public.icsh_event_rate_limit(p_key text, p_max integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  if length(p_key) > 200 or p_max < 1 or p_max > 1000 then raise exception 'Invalid rate limit'; end if;
  delete from public.icsh_request_limits where key in
    (select key from public.icsh_request_limits where expires_at < now() limit 100);
  insert into public.icsh_request_limits(key, attempts, expires_at)
    values(p_key, 1, now() + interval '10 minutes')
    on conflict(key) do update set
      attempts = case when public.icsh_request_limits.expires_at < now() then 1 else public.icsh_request_limits.attempts + 1 end,
      expires_at = case when public.icsh_request_limits.expires_at < now() then now() + interval '10 minutes' else public.icsh_request_limits.expires_at end
    returning attempts into n;
  return n <= p_max;
end $$;

create or replace function public.icsh_event_write(p_changes jsonb, p_audit jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
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
      select * into previous from public.icsh_forms where id = (d->>'id')::uuid for update;
      if expected is null then
        insert into public.icsh_forms(id,slug,title,status,kind,configuration,mode,created_at)
          values((d->>'id')::uuid,d->>'slug',d->>'title',d->>'status',d->>'kind',d->'configuration','test',(d->>'created_at')::timestamptz);
      else
        if previous.id is null or coalesce((previous.configuration->>'version')::integer,0) <> expected then
          raise exception using errcode = '40001', message = 'Form changed elsewhere. Reload before saving.';
        end if;
        if previous.kind = 'tickets' then
          select coalesce(sum(jsonb_array_length(answers->'record'->'attendees')),0)::integer into active_places
            from public.icsh_submissions where form_id = previous.id
            and coalesce(answers->'record'->>'status','') not in ('failed','cancelled');
          if active_places > (d->'configuration'->>'capacity')::integer then
            raise exception using errcode = 'P0001', message = 'Capacity cannot be below existing attendees.';
          end if;
        end if;
        update public.icsh_forms set slug=d->>'slug',title=d->>'title',status=d->>'status',
          configuration=d->'configuration' where id=previous.id;
      end if;
    elsif c->>'table' = 'submissions' then
      select * into parent from public.icsh_forms where id=(d->>'form_id')::uuid for update;
      if parent.id is null then raise exception 'Form unavailable'; end if;
      if expected is null then
        if parent.status <> 'published' or parent.configuration->>'status' <> 'published'
          or (parent.configuration->>'startsAt')::timestamptz <= now()
          or (nullif(parent.configuration->>'deadline',''))::timestamptz <= now()
          or coalesce((parent.configuration->>'version')::integer,0) <> (c->>'form_version')::integer then
          raise exception using errcode = 'P0001', message = 'The form changed or closed. Reload before submitting.';
        end if;
      end if;
      if parent.kind = 'tickets' and coalesce(d->'answers'->'record'->>'status','') not in ('failed','cancelled') then
        select coalesce(sum(jsonb_array_length(answers->'record'->'attendees')),0)::integer into active_places
          from public.icsh_submissions where form_id=parent.id and id<>(d->>'id')::uuid
          and coalesce(answers->'record'->>'status','') not in ('failed','cancelled');
        new_places := jsonb_array_length(d->'answers'->'record'->'attendees');
        if active_places + new_places > (parent.configuration->>'capacity')::integer then
          raise exception using errcode='P0001', message='There are not enough places remaining.';
        end if;
      end if;
      if expected is null then
        insert into public.icsh_submissions(id,form_id,submitted_at,status,answers,mode,request_key)
          values((d->>'id')::uuid,parent.id,(d->>'submitted_at')::timestamptz,d->>'status',d->'answers','test',d->>'request_key');
      else
        update public.icsh_submissions set status=d->>'status',answers=d->'answers'
          where id=(d->>'id')::uuid and form_id=parent.id
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
end $$;

revoke execute on function public.icsh_event_rate_limit(text,integer) from public, anon, authenticated;
revoke execute on function public.icsh_event_write(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.icsh_event_rate_limit(text,integer) to service_role;
grant execute on function public.icsh_event_write(jsonb,jsonb) to service_role;
commit;
