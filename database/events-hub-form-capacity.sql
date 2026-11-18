begin;

-- Capacity belongs to a form/year. Existing configurations and booking records are retained.
-- Keep the existing trigger in place while retiring its shared-event limit check.
create or replace function public.icsh_event_capacity_update_guard() returns trigger
language plpgsql security invoker set search_path='' as $$begin return new;end $$;
create function public.icsh_form_capacity(p_form uuid,p_mode text default 'live') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare f public.icsh_forms;e public.icsh_events;maximum integer;used integer:=0;c jsonb;
begin
 if p_mode not in ('live','test') then raise exception using errcode='22023',message='Invalid booking mode';end if;
 select * into f from public.icsh_forms where id=p_form;
 if f.id is not null then
  maximum:=(f.configuration->>'capacity')::integer;
  select coalesce(sum(case when f.kind='tickets' then jsonb_array_length(coalesce(s.answers->'record'->'attendees','[]'::jsonb)) else 1 end),0)::integer into used
  from public.icsh_submissions s where s.form_id=f.id and s.mode=p_mode and coalesce(s.answers->'record'->>'status','new') not in ('failed','cancelled','expired','refunded');
 else
  select * into e from public.icsh_events where id=p_form and source_type='iftari';if e.id is null then return null;end if;
  select configuration into c from public.icsh_iftari_settings where slug=e.source_key;maximum:=(c->>'capacity')::integer;
  select coalesce(sum(guests),0)::integer into used from public.icsh_iftari_bookings where event_slug=e.source_key and mode=p_mode and status not in ('failed','expired','refunded');
 end if;
 return jsonb_build_object('maximum',maximum,'used',used,'remaining',case when maximum is null then null else greatest(0,maximum-used) end,'limitReached',maximum is not null and used>=maximum);
end $$;
-- Compatibility for catalogue availability: only the primary booking form, never a shared allowance.
create or replace function public.icsh_event_capacity(p_event uuid,p_mode text default 'live') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e public.icsh_events;
begin select * into e from public.icsh_events where id=p_event;if e.id is null then return null;end if;
 if e.source_type='iftari' then return public.icsh_form_capacity(e.id,p_mode);end if;
 if e.source_type='tickets' then return public.icsh_form_capacity(e.source_key::uuid,p_mode);end if;
 return jsonb_build_object('maximum',null,'used',0,'remaining',null,'limitReached',false);
end $$;
create or replace function public.icsh_events_booking_access(p_type text,p_key text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e public.icsh_events;f public.icsh_forms;c jsonb;cfg jsonb;at_limit boolean:=false;enabled boolean:=true;
begin
 if p_type<>'iftari' then
  select * into f from public.icsh_forms where ((p_type='tickets' and kind='tickets') or p_type in ('festival','form')) and (id::text=p_key or slug=p_key);
 end if;
 if f.id is not null then select * into e from public.icsh_events where f.id=any(form_ids);
 else select * into e from public.icsh_events where (source_type=p_type and (source_key=p_key or slug=p_key));
  if e.source_type='tickets' then select * into f from public.icsh_forms where id=e.source_key::uuid;end if;
 end if;
 if e.id is null then return jsonb_build_object('managed',false,'visible',true,'canBook',true,'cancelled',false);end if;
 c:=e.published;
 if f.id is not null then cfg:=f.configuration;at_limit:=coalesce((public.icsh_form_capacity(f.id)->>'limitReached')::boolean,false);enabled:=f.status='published';
 elsif e.source_type='iftari' then select configuration into cfg from public.icsh_iftari_settings where slug=e.source_key;at_limit:=coalesce((public.icsh_form_capacity(e.id)->>'limitReached')::boolean,false);enabled:=cfg->>'status'='published';
 else cfg:=c;end if;
 return jsonb_build_object('limitReached',at_limit,'managed',true,'slug',e.slug,'visible',e.visible and c is not null,'cancelled',e.published_status='cancelled',
 'canBook',not at_limit and enabled and e.visible and c is not null and e.published_status='published'
 and (f.kind='custom' or coalesce((c->>'bookingEnabled')::boolean,false))
 and coalesce((cfg->>'startsAt')::timestamptz,(c->>'startsAt')::timestamptz)>now()
 and (nullif(cfg->>'bookingOpens','')::timestamptz is null or (cfg->>'bookingOpens')::timestamptz<=now())
 and (nullif(cfg->>'bookingCloses','')::timestamptz is null or (cfg->>'bookingCloses')::timestamptz>now()));
end $$;
create or replace function public.icsh_custom_form_public(p_slug text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.icsh_forms;e public.icsh_events;a jsonb;
begin select * into f from public.icsh_forms where slug=p_slug and kind='custom' and status='published';if f.id is null then return null;end if;
 select * into e from public.icsh_events where f.id=any(form_ids) and visible and published is not null and published_status not in ('completed','cancelled');if e.id is null then return null;end if;
 a:=public.icsh_events_booking_access('form',p_slug);
 return jsonb_build_object('id',f.id,'slug',f.slug,'title',f.title,'description',f.configuration->>'description','fields',f.configuration->'fields','version',f.configuration->'version','limitReached',a->'limitReached','eventTitle',e.published->>'title','eventSlug',e.slug,'open',a->'canBook');end $$;
create or replace function public.icsh_hub_booking_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare e public.icsh_events;f public.icsh_forms;a jsonb;state jsonb;places integer;form_id uuid;
begin
 if tg_op='UPDATE' then return new;end if;
 if tg_table_name='icsh_iftari_bookings' then
  select * into e from public.icsh_events where source_type='iftari' and source_key=new.event_slug;if e.id is null then return new;end if;
  form_id:=e.id;a:=public.icsh_events_booking_access('iftari',new.event_slug);places:=new.guests;
 else
  select * into f from public.icsh_forms where id=new.form_id;
  select * into e from public.icsh_events where f.id=any(form_ids);if e.id is null then return new;end if;
  form_id:=f.id;a:=public.icsh_events_booking_access('form',f.slug);
  places:=case when f.kind='tickets' then jsonb_array_length(coalesce(new.answers->'record'->'attendees','[]'::jsonb)) else 1 end;
 end if;
 if new.mode='live' then
  if not pg_try_advisory_xact_lock(hashtextextended('icsh-form-capacity:'||form_id::text,0)) then raise exception using errcode='40001',message='Another booking is being saved. Please retry.';end if;
  state:=public.icsh_form_capacity(form_id,'live');
  if state->>'maximum' is not null and (state->>'used')::integer+places>(state->>'maximum')::integer then raise exception using errcode='P2801',message='Maximum event bookings reached';end if;
 end if;
 if not coalesce((a->>'canBook')::boolean,false) then raise exception using errcode='P0001',message='Bookings are closed for this form';end if;
 return new;
end $$;
create function public.icsh_form_capacity_update_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare state jsonb;
begin
 if new.configuration->'capacity' is not distinct from old.configuration->'capacity' then return new;end if;
 if new.configuration->>'capacity' is not null and ((new.configuration->>'capacity')::integer not between 1 and 10000) then raise exception using errcode='22023',message='Enter a booking limit between 1 and 10,000';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('icsh-form-capacity:'||new.id::text,0)) then raise exception using errcode='40001',message='A booking is being saved. Please retry.';end if;
 state:=public.icsh_form_capacity(new.id,'live');
 if new.configuration->>'capacity' is not null and (new.configuration->>'capacity')::integer<(state->>'used')::integer then raise exception using errcode='P0001',message='Maximum bookings cannot be below this form’s existing bookings and reservations';end if;return new;
end $$;
create trigger icsh_form_capacity_on_save before update of configuration on public.icsh_forms for each row execute function public.icsh_form_capacity_update_guard();
create or replace function public.icsh_hub_forms(p_token text,p_event uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.icsh_events;items jsonb;cfg jsonb;
begin perform public.icsh_hub_require(p_token);select * into e from public.icsh_events where id=p_event;if e.id is null then raise exception 'Event not found';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'title',f.title,'slug',f.slug,'status',f.status,'kind',f.kind,'version',coalesce((f.configuration->>'version')::integer,0),'configuration',case when f.kind='custom' then f.configuration else null end,'settings',jsonb_build_object('title',f.title,'capacity',f.configuration->'capacity','startsAt',coalesce(f.configuration->'startsAt',e.draft->'startsAt'),'endsAt',coalesce(f.configuration->'endsAt',e.draft->'endsAt'),'venue',coalesce(f.configuration->'venue',e.draft->'venue'),'bookingOpens',f.configuration->'bookingOpens','bookingCloses',f.configuration->'bookingCloses','rates',f.configuration->'rates'),'capacityState',public.icsh_form_capacity(f.id)) order by f.created_at,f.id),'[]') into items from public.icsh_forms f where f.id=any(e.form_ids);
 if e.source_type='iftari' then
  select configuration into cfg from public.icsh_iftari_settings where slug=e.source_key;
  items:=items||jsonb_build_array(jsonb_build_object('id',e.id,'title',cfg->>'title','slug',e.source_key,'status',cfg->>'status','kind','iftari','version',(cfg->>'version')::integer,'configuration',null,'capacityState',public.icsh_form_capacity(e.id),'settings',jsonb_build_object('title',cfg->>'title','capacity',cfg->'capacity','startsAt',coalesce(cfg->'startsAt',e.draft->'startsAt'),'endsAt',coalesce(cfg->'endsAt',e.draft->'endsAt'),'venue',cfg->>'venue','bookingOpens',cfg->'bookingOpens','bookingCloses',cfg->'bookingCloses','rates',cfg->'prices')));
 end if;return items;
end $$;
create function public.icsh_hub_form_settings(p_token text,p_event uuid,p_form uuid,p_version integer,p_settings jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
declare e public.icsh_events;f public.icsh_forms;c jsonb;k text;n integer;
begin
 perform public.icsh_hub_require(p_token);select * into e from public.icsh_events where id=p_event for update;if e.id is null then raise exception using errcode='42501',message='Event form access denied';end if;
 if length(btrim(coalesce(p_settings->>'title',''))) not between 1 and 140 or length(btrim(coalesce(p_settings->>'venue',''))) not between 1 and 240
 or p_settings->>'startsAt' is null or p_settings->>'endsAt' is null or (p_settings->>'endsAt')::timestamptz<=(p_settings->>'startsAt')::timestamptz
 or (p_settings->>'capacity' is not null and (p_settings->>'capacity')::integer not between 1 and 10000)
 or nullif(p_settings->>'bookingOpens','')::timestamptz>=nullif(p_settings->>'bookingCloses','')::timestamptz
 or nullif(p_settings->>'bookingCloses','')::timestamptz>(p_settings->>'startsAt')::timestamptz then raise exception using errcode='22023',message='Check the form date, venue and booking limit';end if;
 if e.source_type='iftari' and p_form=e.id then
  select configuration into c from public.icsh_iftari_settings where slug=e.source_key for update;
  if (c->>'version')::integer<>p_version then raise exception using errcode='40001',message='Form changed elsewhere';end if;
  c:=c||(p_settings-'rates')||jsonb_build_object('hubIndependent',true,'date',to_char((p_settings->>'startsAt')::timestamptz at time zone 'Europe/London','YYYY-MM-DD'),'time',to_char((p_settings->>'startsAt')::timestamptz at time zone 'Europe/London','HH24:MI'));
  if p_settings->'rates' is not null then c:=c||jsonb_build_object('prices',p_settings->'rates');end if;
  perform public.icsh_iftari_configure(c,p_version);
 else
  select * into f from public.icsh_forms where id=p_form and id=any(e.form_ids) for update;
  if f.id is null then raise exception using errcode='42501',message='Event form access denied';end if;
  if coalesce((f.configuration->>'version')::integer,0)<>p_version then raise exception using errcode='40001',message='Form changed elsewhere';end if;
  if f.kind='tickets' and p_settings->>'capacity' is null then raise exception using errcode='22023',message='Enter the maximum ticket bookings for this form';end if;
  c:=f.configuration||(p_settings-'rates')||jsonb_build_object('hubIndependent',true,'version',p_version+1);
  if p_settings->'rates' is not null and f.kind='tickets' then
   foreach k in array array['member','nonmember','pensioner','student'] loop
    n:=(p_settings->'rates'->>k)::integer;if n is null or n<0 or n>1000000 or (n>0 and n<30) then raise exception using errcode='22023',message='Check ticket prices';end if;
   end loop;
   if exists(select 1 from jsonb_each_text(p_settings->'rates') x where x.value::integer<0 or x.value::integer>1000000 or (x.value::integer>0 and x.value::integer<30)) then raise exception using errcode='22023',message='Check ticket prices';end if;
   c:=c||jsonb_build_object('rates',p_settings->'rates');
  end if;
  update public.icsh_forms set title=p_settings->>'title',configuration=c where id=f.id;
 end if;
 perform public.icsh_hub_audit(p_token,e.id,'event.form.settings',jsonb_build_object('form',p_form,'settings',p_settings));return true;
end $$;
create or replace function public.icsh_hub_form_state(p_token text,p_event uuid,p_form uuid,p_version integer,p_status text) returns boolean language plpgsql security invoker set search_path='' as $$
declare e public.icsh_events;f public.icsh_forms;c jsonb;
begin perform public.icsh_hub_require(p_token);select * into e from public.icsh_events where id=p_event for update;
 if p_status is null or p_status not in ('published','closed') then raise exception 'Invalid status';end if;
 if e.source_type='iftari' and p_form=e.id then
  select configuration into c from public.icsh_iftari_settings where slug=e.source_key for update;if (c->>'version')::integer<>p_version then raise exception using errcode='40001',message='Form changed elsewhere';end if;
  perform public.icsh_iftari_configure(c||jsonb_build_object('status',p_status),p_version);
 else
  select * into f from public.icsh_forms where id=p_form and id=any(e.form_ids) for update;
  if f.id is null or coalesce((f.configuration->>'version')::integer,0)<>p_version then raise exception using errcode='40001',message='Form changed elsewhere';end if;
  if p_status='published' and f.kind='tickets' and f.configuration->>'capacity' is null then raise exception using errcode='22023',message='Set this form’s maximum ticket bookings before publishing';end if;
  c:=f.configuration||jsonb_build_object('status',p_status,'hubManualClosed',p_status='closed','version',p_version+1);
  update public.icsh_forms set status=p_status,configuration=c where id=p_form;
 end if;
 if p_status='published' and coalesce(f.kind,'iftari')<>'custom' then
  update public.icsh_events set draft=jsonb_set(draft,'{bookingEnabled}','true'),published=case when published is null then null else jsonb_set(published,'{bookingEnabled}','true') end,version=version+1 where id=p_event;
 end if;
 perform public.icsh_hub_audit(p_token,p_event,'event.form.status',jsonb_build_object('form',p_form,'status',p_status));return true;end $$;

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

create or replace function public.icsh_hub_form_save(p_token text,p_form jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
<<hub_form>>
declare e public.icsh_events;f public.icsh_forms;c jsonb;id uuid;
begin perform public.icsh_hub_require(p_token);select * into e from public.icsh_events where icsh_events.id=(p_form->>'eventId')::uuid for update;if e.id is null then raise exception 'Event not found';end if;
 if length(coalesce(p_form->>'title','')) not between 1 and 180 or p_form->>'status' is null or p_form->>'status' not in ('draft','published','closed') or p_form->>'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or jsonb_typeof(p_form->'fields') is distinct from 'array' or jsonb_array_length(p_form->'fields') not between 1 and 30 then raise exception using errcode='22023',message='Check the form details';end if;
 id:=(p_form->>'id')::uuid;
 if id is not null then
  select * into f from public.icsh_forms where icsh_forms.id=hub_form.id and icsh_forms.id=any(e.form_ids) and kind='custom' for update;
  if f.id is null or coalesce((f.configuration->>'version')::integer,0)<>(p_form->>'version')::integer then raise exception using errcode='40001',message='Form changed elsewhere';end if;
  if f.slug<>p_form->>'slug' then raise exception using errcode='22023',message='Keep the existing form link';end if;
 else id:=gen_random_uuid();end if;
 c:=coalesce(f.configuration,'{}'::jsonb)||jsonb_build_object('hubIndependent',true,'startsAt',coalesce(f.configuration->'startsAt',e.draft->'startsAt'),'endsAt',coalesce(f.configuration->'endsAt',e.draft->'endsAt'),'venue',coalesce(f.configuration->'venue',e.draft->'venue'),'bookingOpens',coalesce(f.configuration->'bookingOpens',e.draft->'bookingOpens'),'bookingCloses',coalesce(f.configuration->'bookingCloses',e.draft->'bookingCloses'))||p_form||jsonb_build_object('id',id,'version',coalesce((f.configuration->>'version')::integer,0)+1);
 if f.id is null then
  insert into public.icsh_forms(id,slug,title,kind,status,configuration,mode) values(id,c->>'slug',c->>'title','custom',c->>'status',c,'live');
  update public.icsh_events set form_ids=array_append(form_ids,hub_form.id),version=version+1,updated_at=now() where icsh_events.id=e.id;
 else update public.icsh_forms set title=c->>'title',status=c->>'status',configuration=c where icsh_forms.id=hub_form.id;end if;
 perform public.icsh_hub_audit(p_token,e.id,'event.form.saved',jsonb_build_object('form',id,'title',c->>'title','status',c->>'status'));return c;
end $$;

create or replace function public.icsh_hub_publish(p_token text,p_id uuid,p_version integer,p_action text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e public.icsh_events;c jsonb;f public.icsh_forms;custom_form boolean:=false;cfg jsonb;legacy_status text;live boolean;occupied integer;
begin
 perform public.icsh_hub_require(p_token);select * into e from public.icsh_events where id=p_id for update;
 if e.id is null or e.version<>p_version then raise exception using errcode='40001',message='Event changed elsewhere. Reload before publishing';end if;
 if p_action is null or p_action not in ('publish','unpublish','cancel','complete','archive','restore') then raise exception using errcode='22023',message='Invalid publication action';end if;
 if p_action='restore' and e.published is null then raise exception using errcode='22023',message='Publish the event before restoring it';end if;
 c:=case when p_action='publish' then e.draft else coalesce(e.published,e.draft) end;perform public.icsh_hub_validate(c);
 live:=p_action in ('publish','restore') and (c->>'bookingEnabled')::boolean;
 legacy_status:=case when live then 'published' else 'closed' end;
 if e.source_type='tickets' then
  select * into f from public.icsh_forms where id=e.source_key::uuid for update;
  if f.id is null then raise exception 'Booking form unavailable';end if;
  select coalesce(sum(jsonb_array_length(answers->'record'->'attendees')),0)::integer into occupied from public.icsh_submissions where form_id=f.id and mode='live' and coalesce(answers->'record'->>'status','') not in ('cancelled','failed');
  if e.published is null and occupied>(c->>'capacity')::integer then raise exception using errcode='P0001',message='Capacity cannot be lower than existing bookings and reservations';end if;
  if e.published is null then
  cfg:=f.configuration||jsonb_build_object('title',c->>'title','description',c->>'description','startsAt',c->>'startsAt','endsAt',c->>'endsAt','venue',concat_ws(', ',c->>'venue',nullif(c->>'address','')),
   'hubIndependent',true,'capacity',(c->>'capacity')::integer,'rates',((f.configuration->'rates')-'child'-'childNonmember')||(case when (c->>'childTickets')::boolean then c->'prices' else (c->'prices')-'child'-'childNonmember'-'under5' end)||jsonb_build_object('pensioner',c->'prices'->'member','student',c->'prices'->'member'),
   'bookingOpens',c->'bookingOpens','bookingCloses',c->'bookingCloses','status',legacy_status,'eventTerms',c->>'instructions','version',coalesce((f.configuration->>'version')::integer,0)+1);
  update public.icsh_forms set title=c->>'title',status=legacy_status,configuration=cfg where id=f.id;
  end if;
 elsif e.source_type='iftari' then
  select configuration into cfg from public.icsh_iftari_settings where slug=e.source_key for update;
  if e.published is null then
  cfg:=cfg||jsonb_build_object('title',c->>'title','venue',concat_ws(', ',c->>'venue',nullif(c->>'address','')),'date',to_char((c->>'startsAt')::timestamptz at time zone 'Europe/London','YYYY-MM-DD'),
   'time',to_char((c->>'startsAt')::timestamptz at time zone 'Europe/London','HH24:MI'),'hubIndependent',true,'capacity',c->'capacity','prices',(c->'prices')-'childNonmember','status',legacy_status);
  perform public.icsh_iftari_configure(cfg,(cfg->>'version')::integer);
  end if;
 elsif e.source_type='festival' then
  for f in select * from public.icsh_forms where id=any(e.form_ids) and kind in ('participation','stall') order by id for update loop
   if e.published is null then
   cfg:=f.configuration||jsonb_build_object('hubIndependent',true,'eventName',c->>'title','venue',concat_ws(', ',c->>'venue',nullif(c->>'address','')),'startsAt',c->>'startsAt','endsAt',c->>'endsAt','status',case when coalesce((f.configuration->>'hubManualClosed')::boolean,false) then 'closed' else legacy_status end,'version',coalesce((f.configuration->>'version')::integer,0)+1);
   update public.icsh_forms set status=cfg->>'status',configuration=cfg where id=f.id;
   end if;
  end loop;
 end if;
 update public.icsh_events set published=case when p_action='publish' then c else published end,
  visible=case when p_action in ('unpublish','archive','complete') then false when p_action in ('publish','restore') then true else visible end,
  archived=case when p_action='archive' then true when p_action in ('publish','restore') then false else archived end,
  status=case p_action when 'publish' then 'published' when 'cancel' then 'cancelled' when 'complete' then 'completed' when 'restore' then 'published' else status end,
  published_status=case p_action when 'cancel' then 'cancelled' when 'complete' then 'completed' when 'publish' then 'published' when 'restore' then 'published' else published_status end,
  published_image=case when p_action='publish' then draft_image else published_image end,
  version=version+1,updated_at=now() where id=p_id returning * into e;
 perform public.icsh_hub_audit(p_token,p_id,'event.'||p_action,jsonb_build_object('version',e.version,'public',e.published,'visible',e.visible));return to_jsonb(e);
end $$;

create or replace function public.icsh_hub_form_duplicate(p_token text,p_source_event uuid,p_source_form uuid,p_source_version integer,p_target_event uuid,p_target_version integer,p_title text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare source public.icsh_events;target public.icsh_events;f public.icsh_forms;existing public.icsh_forms;c jsonb;newid uuid;newslug text;
begin perform public.icsh_hub_require(p_token);
 perform 1 from public.icsh_events where id in (p_source_event,p_target_event) order by id for update;
 select * into source from public.icsh_events where id=p_source_event;select * into target from public.icsh_events where id=p_target_event;
 select * into f from public.icsh_forms where id=p_source_form and id=any(source.form_ids);
 if f.id is null or target.id is null then raise exception using errcode='42501',message='Event form access denied';end if;
 if coalesce((f.configuration->>'version')::integer,0)<>p_source_version or target.version<>p_target_version then raise exception using errcode='40001',message='Event or form changed elsewhere';end if;
 if length(btrim(coalesce(p_title,''))) not between 1 and 140 then raise exception using errcode='22023',message='Enter a form title up to 140 characters';end if;
 newid:=gen_random_uuid();newslug:=left(target.slug,60)||'-form-'||left(replace(newid::text,'-',''),12);
 c:=(f.configuration-'hubManualClosed')||jsonb_build_object('id',newid,'slug',newslug,'version',1,'hubIndependent',true,'status','draft','mode','live','prototype',false);
 if f.kind='custom' then c:=c||jsonb_build_object('eventId',target.id,'title',btrim(p_title));
 else c:=c||jsonb_build_object('title',btrim(p_title),'formTitle',btrim(p_title));end if;
 insert into public.icsh_forms(id,slug,title,kind,status,configuration,mode) values(newid,newslug,btrim(p_title),f.kind,'draft',c,'live');
 update public.icsh_events set form_ids=array_append(form_ids,newid) where id=target.id;
 update public.icsh_events set version=version+1,updated_at=now() where id=target.id;
 perform public.icsh_hub_audit(p_token,target.id,'event.form.duplicated',jsonb_build_object('form',newid,'sourceForm',f.id,'sourceEvent',source.id,'title',p_title));
 return jsonb_build_object('id',newid,'eventId',target.id,'title',p_title,'status','draft');
end $$;

create or replace function public.icsh_events_public(p_slug text default null) returns jsonb
language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'slug',slug,'content',published,'status',published_status,'sourceType',source_type,'sourceKey',source_key,'bookingSlug',(select b.slug from public.icsh_forms b where b.id=any(form_ids) and b.kind='tickets' and b.status='published' and (b.configuration->>'startsAt')::timestamptz>now() order by (b.configuration->>'startsAt')::timestamptz,b.created_at limit 1),'bookingKey',(select b.id from public.icsh_forms b where b.id=any(form_ids) and b.kind='tickets' and b.status='published' and (b.configuration->>'startsAt')::timestamptz>now() order by (b.configuration->>'startsAt')::timestamptz,b.created_at limit 1),'forms',(select coalesce(jsonb_agg(jsonb_build_object('title',f.title,'url',case f.kind when 'participation' then case when f.id='500893f1-5724-547a-bd5c-8eae0e648890' then '/harrow-food-festival-2026/get-involved' else '/event-participation/'||f.slug end when 'stall' then '/stall-hire/'||f.slug when 'tickets' then '/event-tickets/'||f.slug else '/event-forms/'||f.slug end)),'[]') from public.icsh_forms f where f.id=any(form_ids) and f.kind in ('custom','participation','stall','tickets') and f.status='published')) order by (published->>'startsAt')::timestamptz),'[]'::jsonb)
 from public.icsh_events where visible and published is not null and published_status<>'completed' and not archived and (p_slug is null or slug=p_slug)
$$;

revoke all on function public.icsh_form_capacity(uuid,text),public.icsh_form_capacity_update_guard(),public.icsh_hub_form_settings(text,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.icsh_form_capacity(uuid,text),public.icsh_form_capacity_update_guard(),public.icsh_hub_form_settings(text,uuid,uuid,integer,jsonb) to service_role;
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
        if expected is null then
          active_places:=(public.icsh_form_capacity(parent.id,d->>'mode')->>'used')::integer;
          if active_places >= (parent.configuration->>'capacity')::integer then raise exception using errcode='P2801',message='Maximum event bookings reached';end if;
        end if;
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
end $function$;
revoke all on function public.icsh_event_write(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.icsh_event_write(jsonb,jsonb) to service_role;
commit;
