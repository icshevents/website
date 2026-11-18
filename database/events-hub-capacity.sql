begin;
-- One event limit shared by linked forms; ticket attendees each count once.
create function public.icsh_event_capacity(p_event uuid,p_mode text default 'live') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e public.icsh_events;maximum integer;used integer:=0;n integer:=0;
begin
 select * into e from public.icsh_events where id=p_event;if e.id is null then return null;end if;
 if p_mode not in ('live','test') then raise exception using errcode='22023',message='Invalid booking mode';end if;
 maximum:=(e.published->>'capacity')::integer;
 select coalesce(sum(case when f.kind='tickets' then jsonb_array_length(coalesce(s.answers->'record'->'attendees','[]'::jsonb)) else 1 end),0)::integer into used
 from public.icsh_submissions s join public.icsh_forms f on f.id=s.form_id
 where s.form_id=any(e.form_ids) and s.mode=p_mode and coalesce(s.answers->'record'->>'status','new') not in ('failed','cancelled','expired','refunded');
 if e.source_type='iftari' then
  select coalesce(sum(guests),0)::integer into n from public.icsh_iftari_bookings where event_slug=e.source_key and mode=p_mode and status not in ('failed','expired','refunded');used:=used+n;
 end if;
 return jsonb_build_object('maximum',maximum,'used',used,'remaining',case when maximum is null then null else greatest(0,maximum-used) end,'limitReached',maximum is not null and used>=maximum);
end $$;
create function public.icsh_hub_capacity(p_token text,p_event uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin perform public.icsh_hub_require(p_token);return public.icsh_event_capacity(p_event,'live');end $$;
create or replace function public.icsh_events_booking_access(p_type text,p_key text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e public.icsh_events;c jsonb;at_limit boolean;
begin select * into e from public.icsh_events where (source_type=p_type and (source_key=p_key or (p_type='tickets' and slug=p_key) or (p_type='festival' and p_key=any(select unnest(form_ids)::text)))) or (p_type='form' and exists(select 1 from public.icsh_forms f where f.id=any(form_ids) and f.slug=p_key));
 if e.id is null then return jsonb_build_object('managed',false,'visible',true,'canBook',true,'cancelled',false);end if;
 c:=e.published;at_limit:=coalesce((public.icsh_event_capacity(e.id)->>'limitReached')::boolean,false);return jsonb_build_object('limitReached',at_limit,'managed',true,'slug',e.slug,'visible',e.visible and c is not null,'cancelled',e.published_status='cancelled',
 'canBook',not at_limit and e.visible and c is not null and e.published_status='published' and (c->>'bookingEnabled')::boolean and (c->>'startsAt')::timestamptz>now()
 and (nullif(c->>'bookingOpens','')::timestamptz is null or (c->>'bookingOpens')::timestamptz<=now())
 and (nullif(c->>'bookingCloses','')::timestamptz is null or (c->>'bookingCloses')::timestamptz>now()));end $$;
create or replace function public.icsh_custom_form_public(p_slug text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.icsh_forms;e public.icsh_events;open boolean;at_limit boolean;
begin select * into f from public.icsh_forms where slug=p_slug and kind='custom' and status='published';if f.id is null then return null;end if;
 select * into e from public.icsh_events where f.id=any(form_ids) and visible and published is not null and published_status not in ('completed','cancelled');if e.id is null then return null;end if;
 at_limit:=coalesce((public.icsh_event_capacity(e.id)->>'limitReached')::boolean,false);
 open:=not at_limit and ((e.published->>'startsAt')::timestamptz>now() and (nullif(e.published->>'bookingOpens','')::timestamptz is null or (e.published->>'bookingOpens')::timestamptz<=now()) and (nullif(e.published->>'bookingCloses','')::timestamptz is null or (e.published->>'bookingCloses')::timestamptz>now()));
 return jsonb_build_object('id',f.id,'slug',f.slug,'title',f.title,'description',f.configuration->>'description','fields',f.configuration->'fields','version',f.configuration->'version','limitReached',at_limit,'eventTitle',e.published->>'title','eventSlug',e.slug,'open',open);end $$;
create or replace function public.icsh_hub_booking_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare e public.icsh_events;c jsonb;custom_form boolean:=false;form_kind text;state jsonb;places integer;
begin
 if tg_table_name='icsh_iftari_bookings' then
  if tg_op='UPDATE' then return new;end if;
  select * into e from public.icsh_events where source_type='iftari' and source_key=new.event_slug;
 else
  if tg_op='UPDATE' then return new;end if;
  select * into e from public.icsh_events where new.form_id=any(form_ids);
  select f.kind into form_kind from public.icsh_forms f where f.id=new.form_id;custom_form:=form_kind='custom';
 end if;
 if e.id is null then return new;end if;c:=e.published;
 if not e.visible or e.published_status in ('cancelled','completed') or c is null or (not (c->>'bookingEnabled')::boolean and not coalesce(custom_form,false))
 or (nullif(c->>'bookingOpens','')::timestamptz>now()) or (nullif(c->>'bookingCloses','')::timestamptz<=now()) or (c->>'startsAt')::timestamptz<=now() then
 raise exception using errcode='P0001',message='Bookings are closed for this event';end if;
 if new.mode='live' and c->>'capacity' is not null then
  if not pg_try_advisory_xact_lock(hashtextextended('icsh-event-capacity:'||e.id::text,0)) then raise exception using errcode='40001',message='Another booking is being saved. Please retry.';end if;
  state:=public.icsh_event_capacity(e.id,'live');
  if tg_table_name='icsh_iftari_bookings' then places:=new.guests;elsif form_kind='tickets' then places:=jsonb_array_length(coalesce(new.answers->'record'->'attendees','[]'::jsonb));else places:=1;end if;
  if (state->>'used')::integer+places>(state->>'maximum')::integer then raise exception using errcode='P2801',message='Maximum event bookings reached';end if;
 end if;return new;
end $$;

create or replace function public.icsh_custom_form_submit(p_slug text,p_id uuid,p_version integer,p_answers jsonb,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.icsh_forms;e public.icsh_events;field jsonb;value jsonb;r jsonb;old public.icsh_submissions;ref text;contact jsonb:='{}';key text;
begin
 select * into f from public.icsh_forms where slug=p_slug and kind='custom' for update;
 if f.id is null then raise exception 'Form unavailable';end if;
 select * into old from public.icsh_submissions where id=p_id and form_id=f.id;
 if old.id is not null then if old.answers->>'requestHash'<>p_hash then raise exception using errcode='40001',message='Submission changed';end if;return jsonb_build_object('reference',old.answers->'record'->>'reference');end if;
 if coalesce((public.icsh_custom_form_public(p_slug)->>'limitReached')::boolean,false) then raise exception using errcode='P2801',message='Maximum event bookings reached';end if;
 if f.status<>'published' or (f.configuration->>'version')::integer<>p_version or not coalesce((public.icsh_custom_form_public(p_slug)->>'open')::boolean,false) then raise exception using errcode='P0001',message='This form is closed or has changed. Reload before submitting';end if;
 if jsonb_typeof(p_answers) is distinct from 'object' or octet_length(p_answers::text)>64000 or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid answers';end if;
 for key in select jsonb_object_keys(p_answers) loop if not exists(select 1 from jsonb_array_elements(f.configuration->'fields') x where x->>'id'=key) then raise exception 'Unknown question';end if;end loop;
 for field in select item.value from jsonb_array_elements(f.configuration->'fields') item loop
  value:=p_answers->(field->>'id');
  if coalesce((field->>'required')::boolean,false) and (value is null or value='null'::jsonb or (field->>'type'='checkbox' and value<>'true'::jsonb) or (field->>'type'<>'checkbox' and nullif(btrim(value#>>'{}'),'') is null)) then raise exception using errcode='22023',message='Answer every required question';end if;
  if value is not null and value<>'null'::jsonb then
   if (field->>'type'='checkbox' and jsonb_typeof(value)<>'boolean') or (field->>'type'<>'checkbox' and (jsonb_typeof(value)<>'string' or length(value#>>'{}')>4000)) then raise exception 'Invalid answer';end if;
   if field->>'type' in ('select','radio') and (value#>>'{}')<>'' and not (field->'options' ? (value#>>'{}')) then raise exception 'Choose a listed answer';end if;
   if field->>'type'='email' and (value#>>'{}')<>'' and (value#>>'{}') !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' then raise exception 'Enter a valid email';end if;
   if field->>'type' in ('name','email','mobile') then contact:=contact||jsonb_build_object(case field->>'type' when 'mobile' then 'phone' else field->>'type' end,value);end if;
  end if;
 end loop;
 ref:='FORM-'||upper(left(replace(p_id::text,'-',''),12));
 r:=jsonb_build_object('id',p_id,'reference',ref,'contact',contact,'answers',p_answers,'questionSnapshot',f.configuration->'fields','status','new','createdAt',now(),'mode','live','version',1);
 insert into public.icsh_submissions(id,form_id,status,answers,mode,request_key) values(p_id,f.id,'new',jsonb_build_object('record',r,'requestHash',p_hash),'live',p_id::text);
 return jsonb_build_object('reference',ref);
end $$;
create function public.icsh_event_capacity_update_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare used integer;maximum integer;
begin
 if new.published is not distinct from old.published then return new;end if;
 if not pg_try_advisory_xact_lock(hashtextextended('icsh-event-capacity:'||new.id::text,0)) then raise exception using errcode='40001',message='A booking is being saved. Please retry.';end if;
 maximum:=(new.published->>'capacity')::integer;used:=(public.icsh_event_capacity(new.id)->>'used')::integer;
 if maximum is not null and maximum<used then raise exception using errcode='P0001',message='Maximum bookings cannot be below existing tickets, sign-ups and reservations';end if;return new;
end $$;
create trigger icsh_event_capacity_on_save before update of published on public.icsh_events for each row execute function public.icsh_event_capacity_update_guard();
revoke all on function public.icsh_event_capacity(uuid,text),public.icsh_hub_capacity(text,uuid),public.icsh_event_capacity_update_guard() from public,anon,authenticated;
grant execute on function public.icsh_event_capacity(uuid,text),public.icsh_hub_capacity(text,uuid),public.icsh_event_capacity_update_guard() to service_role;
commit;
