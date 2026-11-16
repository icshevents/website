-- REVIEW MIGRATION ONLY. Apply to an isolated database first. Never apply during a UI preview.
begin;
alter table public.icsh_forms drop constraint if exists icsh_forms_kind_check;
alter table public.icsh_forms add constraint icsh_forms_kind_check check(kind in ('tickets','participation','stall','custom'));
create table public.icsh_portal_access (
 user_id uuid not null references auth.users(id), portal text not null check(portal in ('membership','events','administrator')),
 primary key(user_id,portal)
);
insert into public.icsh_portal_access(user_id,portal) select user_id,'membership' from public.icsh_organisers;
create table public.icsh_events_credentials (
 id uuid primary key default gen_random_uuid(),first_name text not null check(length(btrim(first_name)) between 1 and 60),
 password_hash text not null check(password_hash ~ '^scrypt-v1\$[a-f0-9]{64}\$[a-f0-9]{128}$'),lookup_key text not null unique check(lookup_key ~ '^[a-f0-9]{64}$'),
 enabled boolean not null default true,version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index icsh_events_first_name_idx on public.icsh_events_credentials(lower(btrim(first_name)));
create table public.icsh_portal_sessions (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),user_id uuid references auth.users(id),credential_id uuid references public.icsh_events_credentials(id),
 portal text not null check(portal in ('membership','events')),display_name text not null default '' check(length(display_name)<=80),
 auth_session_id uuid,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '8 hours',revoked_at timestamptz,
 check((portal='membership' and user_id is not null and credential_id is null) or (portal='events' and user_id is null and credential_id is not null))
);
create index on public.icsh_portal_sessions(user_id,portal,expires_at);
create table public.icsh_events (
 id uuid primary key default gen_random_uuid(),slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 source_type text not null check(source_type in ('tickets','festival','iftari','none','archive')),source_key text,
 form_ids uuid[] not null default '{}',draft jsonb not null,published jsonb,
 status text not null default 'draft' check(status in ('draft','ready_for_review','published','cancelled','completed')),
 published_status text not null default 'published' check(published_status in ('published','cancelled','completed')),draft_image text,published_image text,
 visible boolean not null default false,archived boolean not null default false,version integer not null default 1,
 updated_at timestamptz not null default now(),unique(source_type,source_key)
);
create table public.icsh_event_planning (
 event_id uuid primary key references public.icsh_events(id),notes text not null default '',requirements text not null default '',version integer not null default 1,
 check(length(notes)<=10000 and length(requirements)<=10000)
);
create table public.icsh_event_tasks (
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.icsh_events(id),title text not null check(length(title) between 1 and 240),
 assignee_ids uuid[] not null default '{}',description text not null default '' check(length(description)<=10000),updates jsonb not null default '[]'::jsonb,assignee text not null default '' check(length(assignee)<=120),due_date date,status text not null default 'not_started' check(status in ('not_started','in_progress','completed')),version integer not null default 1
);
create index on public.icsh_event_tasks(event_id,due_date);
alter table public.icsh_audit_events add column event_id uuid references public.icsh_events(id),add column actor text,add column actor_credential_id uuid references public.icsh_events_credentials(id),add column changes jsonb;
create index on public.icsh_audit_events(event_id,occurred_at desc);
-- All new tables are server-only. No event identity is added to icsh_organisers.
do $$ declare t text;begin foreach t in array array['icsh_events_credentials','icsh_portal_access','icsh_portal_sessions','icsh_events','icsh_event_planning','icsh_event_tasks'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to service_role',t);
end loop;end $$;

create function public.icsh_portal_check(p_token text,p_portal text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.icsh_portal_sessions;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null;end if;
 select ps.* into s from public.icsh_portal_sessions ps
 where ps.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and ps.portal=p_portal and ps.revoked_at is null and ps.expires_at>now()
 and ((ps.portal='membership' and exists(select 1 from public.icsh_portal_access a where a.user_id=ps.user_id and a.portal='membership'))
 or (ps.portal='events' and exists(select 1 from public.icsh_events_credentials c where c.id=ps.credential_id and c.enabled)));
 if s.token_hash is null then return null;end if;
 return jsonb_build_object('user_id',s.user_id,'credential_id',s.credential_id,'display_name',case when s.portal='events' then (select first_name from public.icsh_events_credentials where id=s.credential_id) else 'Admin' end,'expires_at',s.expires_at);
end $$;
create function public.icsh_portal_start(p_user uuid,p_portal text,p_hash text,p_display_name text,p_auth_session uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if p_portal<>'membership' or not exists(select 1 from public.icsh_portal_access where user_id=p_user and portal=p_portal)
 or (p_portal='events' and exists(select 1 from public.icsh_organisers where user_id=p_user)) then raise exception using errcode='42501',message='Portal access denied';end if;
 insert into public.icsh_portal_sessions(token_hash,user_id,portal,display_name,auth_session_id) values(p_hash,p_user,p_portal,p_display_name,p_auth_session);return true;
end $$;
create function public.icsh_portal_end(p_token text,p_portal text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin update public.icsh_portal_sessions set revoked_at=now() where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and portal=p_portal;return true;end $$;
create function public.icsh_hub_require(p_token text) returns text
language plpgsql security invoker set search_path='' as $$
declare s jsonb;
begin s:=public.icsh_portal_check(p_token,'events');if s is null then raise exception using errcode='42501',message='Sign in to the Events Hub';end if;
 return coalesce(nullif(s->>'display_name',''),'Events team');end $$;
create function public.icsh_hub_audit(p_token text,p_event uuid,p_action text,p_changes jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin insert into public.icsh_audit_events(event_id,actor,actor_credential_id,action,record_id,changes) values(p_event,public.icsh_hub_require(p_token),(public.icsh_portal_check(p_token,'events')->>'credential_id')::uuid,p_action,p_event::text,p_changes);end $$;

-- Live public projection deliberately excludes drafts, planning, tasks and form entries.
create function public.icsh_events_public(p_slug text default null) returns jsonb
language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'slug',slug,'content',published,'status',published_status,'sourceType',source_type,'sourceKey',source_key,'forms',(select coalesce(jsonb_agg(jsonb_build_object('title',f.title,'url',case f.kind when 'participation' then '/harrow-food-festival-2026/get-involved' when 'stall' then '/stall-hire/'||f.slug else '/event-forms/'||f.slug end)),'[]') from public.icsh_forms f where f.id=any(form_ids) and f.kind in ('custom','participation','stall') and f.status='published')) order by (published->>'startsAt')::timestamptz),'[]'::jsonb)
 from public.icsh_events where visible and published is not null and published_status<>'completed' and not archived and (p_slug is null or slug=p_slug)
$$;
create function public.icsh_hub_dashboard(p_token text) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin perform public.icsh_hub_require(p_token);return jsonb_build_object(
 'events',(select coalesce(jsonb_agg(to_jsonb(e) order by (draft->>'startsAt')::timestamptz),'[]') from public.icsh_events e),
 'tasks',(select coalesce(jsonb_agg(to_jsonb(t) order by due_date nulls last),'[]') from public.icsh_event_tasks t),
 'team',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'first_name',first_name,'enabled',enabled) order by first_name),'[]') from public.icsh_events_credentials));end $$;
create function public.icsh_hub_event(p_token text,p_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e public.icsh_events;
begin perform public.icsh_hub_require(p_token);select * into e from public.icsh_events where id=p_id;if e.id is null then raise exception using errcode='P0002',message='Event not found';end if;
 return jsonb_build_object('event',to_jsonb(e),'planning',coalesce((select to_jsonb(p) from public.icsh_event_planning p where event_id=p_id),jsonb_build_object('notes','','requirements','','version',0)),
 'tasks',(select coalesce(jsonb_agg(to_jsonb(t) order by due_date nulls last),'[]') from public.icsh_event_tasks t where event_id=p_id),
 'forms',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'kind',kind)),'[]') from public.icsh_forms where id=any(e.form_ids)),
 'history',(select coalesce(jsonb_agg(h),'[]') from (select action,actor,occurred_at,changes from public.icsh_audit_events where event_id=p_id order by occurred_at desc limit 50) h));end $$;

-- Defence in depth for JSON passed through the server schema.
create function public.icsh_hub_validate(c jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare k text;n integer;
begin
 if c is null or jsonb_typeof(c)<>'object' or octet_length(c::text)>24000 or length(coalesce(c->>'title','')) not between 1 and 140
 or length(coalesce(c->>'description','')) not between 1 and 6000 or length(coalesce(c->>'venue','')) not between 1 and 240
 or c->>'bookingType' is null or c->>'bookingType' not in ('information','free','paid','external')
 or c->>'startsAt' is null or c->>'endsAt' is null or (c->>'endsAt')::timestamptz<=(c->>'startsAt')::timestamptz
 or jsonb_typeof(c->'childTickets') is distinct from 'boolean'
 or jsonb_typeof(c->'bookingEnabled') is distinct from 'boolean'
 or ((c->>'capacity') is not null and (c->>'capacity')::integer not between 1 and 10000)
 or (c->>'bookingType' in ('paid','free') and (c->>'bookingEnabled')::boolean and c->>'capacity' is null)
 or (nullif(c->>'bookingOpens','')::timestamptz>=nullif(c->>'bookingCloses','')::timestamptz)
 or (nullif(c->>'bookingCloses','')::timestamptz>(c->>'startsAt')::timestamptz)
 then raise exception using errcode='22023',message='Check the event details';end if;
 foreach k in array array['member','nonmember','child','childNonmember','under5'] loop
 n:=(c->'prices'->>k)::integer;
 if n is null or n<0 or n>1000000 or (n>0 and n<30) or (c->>'bookingType'='free' and n<>0) then raise exception using errcode='22023',message='Check ticket prices';end if;
 end loop;
end $$;
create function public.icsh_hub_save(p_token text,p_id uuid,p_version integer,p_slug text,p_content jsonb,p_status text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e public.icsh_events;f uuid;newtype text;
begin
 perform public.icsh_hub_require(p_token);perform public.icsh_hub_validate(p_content);
 if p_status is null or p_status not in ('draft','ready_for_review') or p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug)>80 then raise exception using errcode='22023',message='Invalid event';end if;
 if p_id is null then
  newtype:=case when p_content->>'bookingType' in ('paid','free') then 'tickets' else 'none' end;
  if newtype='tickets' then
   f:=gen_random_uuid();
   insert into public.icsh_forms(id,slug,title,status,kind,mode,configuration) values(f,p_slug,p_content->>'title','draft','tickets','live',jsonb_build_object(
    'id',f,'slug',p_slug,'title',p_content->>'title','description',p_content->>'description','venue',p_content->>'venue','startsAt',p_content->>'startsAt','endsAt',p_content->>'endsAt',
    'capacity',(p_content->>'capacity')::integer,'status','draft','mode','live','version',1,'rates',(case when (p_content->>'childTickets')::boolean then p_content->'prices' else (p_content->'prices')-'child'-'childNonmember'-'under5' end)||jsonb_build_object('pensioner',p_content->'prices'->'member','student',p_content->'prices'->'member'),
    'questions','[]'::jsonb,'membershipPricingRule','active','membershipCheckRequired',true,'pricingStrategy','booking_email','eventTerms',p_content->>'instructions','prototype',false));
  end if;
  insert into public.icsh_events(slug,source_type,source_key,form_ids,draft,status) values(p_slug,newtype,f::text,case when f is null then '{}'::uuid[] else array[f] end,p_content,p_status) returning * into e;
 else
  select * into e from public.icsh_events where id=p_id for update;
  if e.id is null or e.version<>p_version then raise exception using errcode='40001',message='Event changed elsewhere. Reload before saving';end if;
  if e.source_type='iftari' and ((p_content->'prices'->>'member')::integer<30 or (p_content->'prices'->>'nonmember')::integer<30 or (p_content->'prices'->>'child')::integer<30 or (p_content->'prices'->>'childNonmember')::integer<>(p_content->'prices'->>'child')::integer or (p_content->'prices'->>'member')::integer>100000 or (p_content->'prices'->>'nonmember')::integer>100000 or (p_content->'prices'->>'child')::integer>100000 or (p_content->'prices'->>'under5')::integer>100000) then raise exception using errcode='22023',message='Iftari supports one child price and ticket prices up to £1,000';end if;
  if e.slug<>p_slug then raise exception using errcode='22023',message='Keep the existing event link';end if;
  if (e.source_type='tickets' and p_content->>'bookingType' not in ('paid','free')) or (e.source_type='iftari' and p_content->>'bookingType'<>'paid') or (e.source_type not in ('tickets','iftari') and p_content->>'bookingType' in ('paid','free')) then raise exception using errcode='22023',message='Keep the existing booking system. Create a new event for another booking type';end if;
  update public.icsh_events set draft=p_content,status=p_status,version=version+1,updated_at=now() where id=p_id returning * into e;
 end if;
 perform public.icsh_hub_audit(p_token,e.id,'event.draft.saved',jsonb_build_object('version',e.version,'fields',p_content));return to_jsonb(e);
end $$;

-- Publish content and booking settings atomically under the same locks used by existing reservations.
create function public.icsh_hub_publish(p_token text,p_id uuid,p_version integer,p_action text) returns jsonb
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
  if occupied>(c->>'capacity')::integer then raise exception using errcode='P0001',message='Capacity cannot be lower than existing bookings and reservations';end if;
  cfg:=f.configuration||jsonb_build_object('title',c->>'title','description',c->>'description','startsAt',c->>'startsAt','endsAt',c->>'endsAt','venue',concat_ws(', ',c->>'venue',nullif(c->>'address','')),
   'capacity',(c->>'capacity')::integer,'rates',((f.configuration->'rates')-'child'-'childNonmember')||(case when (c->>'childTickets')::boolean then c->'prices' else (c->'prices')-'child'-'childNonmember'-'under5' end)||jsonb_build_object('pensioner',c->'prices'->'member','student',c->'prices'->'member'),
   'bookingOpens',c->'bookingOpens','bookingCloses',c->'bookingCloses','status',legacy_status,'eventTerms',c->>'instructions','version',coalesce((f.configuration->>'version')::integer,0)+1);
  update public.icsh_forms set title=c->>'title',status=legacy_status,configuration=cfg where id=f.id;
 elsif e.source_type='iftari' then
  select configuration into cfg from public.icsh_iftari_settings where slug=e.source_key for update;
  cfg:=cfg||jsonb_build_object('title',c->>'title','venue',concat_ws(', ',c->>'venue',nullif(c->>'address','')),'date',to_char((c->>'startsAt')::timestamptz at time zone 'Europe/London','YYYY-MM-DD'),
   'time',to_char((c->>'startsAt')::timestamptz at time zone 'Europe/London','HH24:MI'),'capacity',c->'capacity','prices',(c->'prices')-'childNonmember','status',legacy_status);
  perform public.icsh_iftari_configure(cfg,(cfg->>'version')::integer);
 elsif e.source_type='festival' then
  for f in select * from public.icsh_forms where id=any(e.form_ids) and kind in ('participation','stall') order by id for update loop
   cfg:=f.configuration||jsonb_build_object('eventName',c->>'title','venue',concat_ws(', ',c->>'venue',nullif(c->>'address','')),'startsAt',c->>'startsAt','endsAt',c->>'endsAt','status',case when coalesce((f.configuration->>'hubManualClosed')::boolean,false) then 'closed' else legacy_status end,'version',coalesce((f.configuration->>'version')::integer,0)+1);
   update public.icsh_forms set status=cfg->>'status',configuration=cfg where id=f.id;
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
create function public.icsh_hub_planning(p_token text,p_event uuid,p_version integer,p_notes text,p_requirements text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p public.icsh_event_planning;
begin perform public.icsh_hub_require(p_token);perform 1 from public.icsh_events where id=p_event for update;if not found then raise exception 'Event not found';end if;
 select * into p from public.icsh_event_planning where event_id=p_event for update;
 if coalesce(p.version,0)<>p_version then raise exception using errcode='40001',message='Planning changed elsewhere';end if;
 insert into public.icsh_event_planning(event_id,notes,requirements) values(p_event,p_notes,p_requirements) on conflict(event_id) do update set notes=excluded.notes,requirements=excluded.requirements,version=icsh_event_planning.version+1 returning * into p;
 perform public.icsh_hub_audit(p_token,p_event,'event.planning.updated',jsonb_build_object('version',p.version));return to_jsonb(p);end $$;
create function public.icsh_hub_task(p_token text,p_event uuid,p_id uuid,p_version integer,p_title text,p_assignee_ids uuid[],p_due date,p_status text,p_description text,p_note text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t public.icsh_event_tasks;assigned text;actor text;updates jsonb;ids uuid[];
begin actor:=public.icsh_hub_require(p_token);
 if p_id is not null then select * into t from public.icsh_event_tasks where id=p_id and event_id=p_event for update;if t.id is null or t.version<>p_version then raise exception using errcode='40001',message='Task changed elsewhere';end if;end if;
 ids:=array(select distinct unnest(coalesce(p_assignee_ids,'{}'::uuid[])));
 if exists(select 1 from unnest(ids) v where not exists(select 1 from public.icsh_events_credentials c where c.id=v and (c.enabled or v=any(coalesce(t.assignee_ids,'{}'::uuid[]))))) then raise exception using errcode='22023',message='Choose an active team member';end if;
 select coalesce(string_agg(first_name,', ' order by first_name),'') into assigned from public.icsh_events_credentials where id=any(ids);
 updates:=coalesce(t.updates,'[]'::jsonb);
 if nullif(btrim(p_note),'') is not null then
  if length(p_note)>4000 or jsonb_array_length(updates)>=500 then raise exception using errcode='22023',message='Task update is too long';end if;
  updates:=updates||jsonb_build_array(jsonb_build_object('name',actor,'at',now(),'note',p_note,'credentialId',public.icsh_portal_check(p_token,'events')->>'credential_id'));
 end if;
 if p_id is null then insert into public.icsh_event_tasks(event_id,title,assignee_ids,assignee,description,due_date,status,updates) values(p_event,p_title,ids,assigned,p_description,p_due,p_status,updates) returning * into t;
 else update public.icsh_event_tasks set title=p_title,assignee_ids=ids,assignee=assigned,description=p_description,due_date=p_due,status=p_status,updates=updates,version=version+1 where id=p_id returning * into t;end if;
 perform public.icsh_hub_audit(p_token,p_event,'event.task.updated',jsonb_build_object('task',t.id,'title',t.title,'status',t.status,'assigned',t.assignee));return to_jsonb(t);end $$;

-- Explicit field projection: no capabilities, private receipt links, CRM IDs or membership proofs.
create function public.icsh_hub_entry_details(r jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('contact',r->'contact','personal',r->'personal','business',r->'business','answers',case when jsonb_typeof(r->'questionSnapshot')='array' then coalesce((select jsonb_object_agg(q->>'label',r->'answers'->(q->>'id')) from jsonb_array_elements(r->'questionSnapshot') q where r->'answers' ? (q->>'id')),r->'answers') else r->'answers' end,
 'attendees',(select coalesce(jsonb_agg(jsonb_build_object('name',a->>'name','ticket',a->>'ticket','unitAmount',a->'unitAmount')),'[]') from jsonb_array_elements(coalesce(r->'attendees','[]')) a),
 'involvement',r->'involvement','cooking',r->'cooking','volunteering',r->'volunteering','donation',r->'donation',
 'customAnswers',r->'customAnswers','package',r->'packageSnapshot','requirements',r->'requirements','additionalNotes',r->'additionalNotes','total',r->'total','fee',r->'fee')
$$;
create function public.icsh_hub_entries(p_token text,p_event uuid,p_page integer default 0,p_form uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e public.icsh_events;rows jsonb;total integer;
begin perform public.icsh_hub_require(p_token);select * into e from public.icsh_events where id=p_event;
 if e.id is null or p_page<0 or p_page>10000 or (p_form is not null and not p_form=any(e.form_ids)) then raise exception using errcode='42501',message='Event form access denied';end if;
 if e.source_type='iftari' then
  select count(*) into total from public.icsh_iftari_bookings where event_slug=e.source_key and mode='live';
  select coalesce(jsonb_agg(v),'[]') into rows from (select jsonb_build_object('id',id,'formId',null,'formTitle','Iftari bookings','kind','iftari','reference',reference,'submittedAt',created_at,
   'status',status,'reviewStatus','read_only','notes','','version',0,'details',jsonb_build_object('contact',contact,'quantities',quantities,'quote',quote,'guests',guests,'needsReview',needs_review)) v
   from public.icsh_iftari_bookings where event_slug=e.source_key and mode='live' order by created_at desc,id limit 100 offset p_page*100) q;
 else
  select count(*) into total from public.icsh_submissions where form_id=any(e.form_ids) and mode='live' and (p_form is null or form_id=p_form);
  select coalesce(jsonb_agg(v),'[]') into rows from (select jsonb_build_object('id',s.id,'formId',s.form_id,'formTitle',f.title,'kind',f.kind,'reference',s.answers->'record'->>'reference','submittedAt',s.submitted_at,
   'status',s.answers->'record'->>'status','reviewStatus',s.status,'notes',coalesce(s.answers->>'hubNotes',''),'version',coalesce((s.answers->>'hubVersion')::integer,0),'details',public.icsh_hub_entry_details(s.answers->'record')) v
   from public.icsh_submissions s join public.icsh_forms f on f.id=s.form_id where s.form_id=any(e.form_ids) and s.mode='live' and (p_form is null or s.form_id=p_form)
   order by s.submitted_at desc,s.id limit 100 offset p_page*100) q;
 end if;return jsonb_build_object('entries',rows,'total',total,'page',p_page);end $$;
create function public.icsh_hub_entry_review(p_token text,p_event uuid,p_entry uuid,p_version integer,p_status text,p_notes text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin perform public.icsh_hub_require(p_token);
 if p_status not in ('new','reviewed','archived') or length(p_notes)>5000 then raise exception 'Invalid review';end if;
 update public.icsh_submissions s set status=p_status,answers=answers||jsonb_build_object('hubNotes',p_notes,'hubVersion',p_version+1)
 where id=p_entry and mode='live' and form_id=any((select form_ids from public.icsh_events where id=p_event)::uuid[]) and coalesce((answers->>'hubVersion')::integer,0)=p_version;
 if not found then raise exception using errcode='40001',message='Entry unavailable or changed elsewhere';end if;
 perform public.icsh_hub_audit(p_token,p_event,'event.entry.reviewed',jsonb_build_object('entry',p_entry,'status',p_status));return true;end $$;
create function public.icsh_hub_booking_overview(p_token text,p_event uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e public.icsh_events;bookings integer;sold integer;reserved integer;
begin perform public.icsh_hub_require(p_token);select * into e from public.icsh_events where id=p_event;if e.id is null then raise exception 'Event not found';end if;
 if e.source_type='iftari' then
 select count(*),coalesce(sum(guests) filter(where status='paid'),0),coalesce(sum(guests) filter(where status not in ('paid','expired','failed','refunded')),0) into bookings,sold,reserved from public.icsh_iftari_bookings where event_slug=e.source_key and mode='live';
 elsif e.source_type='tickets' then
 select count(*),coalesce(sum(jsonb_array_length(answers->'record'->'attendees')) filter(where answers->'record'->>'status' in ('confirmed_paid','confirmed_free')),0),
 coalesce(sum(jsonb_array_length(answers->'record'->'attendees')) filter(where coalesce(answers->'record'->>'status','') not in ('confirmed_paid','confirmed_free','failed','cancelled')),0)
 into bookings,sold,reserved from public.icsh_submissions where form_id=e.source_key::uuid and mode='live';
 else return null;end if;
 return jsonb_build_object('bookings',bookings,'sold',sold,'reserved',reserved,'remaining',case when coalesce(e.published,e.draft)->>'capacity' is null then null else greatest(0,(coalesce(e.published,e.draft)->>'capacity')::integer-sold-reserved) end);
end $$;

create function public.icsh_hub_image(p_token text,p_event uuid,p_version integer,p_key text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin perform public.icsh_hub_require(p_token);
 if p_key is null or p_key not like p_event::text||'/%' or p_key !~ '^[a-f0-9-]+/[a-f0-9-]+\.(png|jpg|webp)$' then raise exception 'Invalid image';end if;
 update public.icsh_events set draft_image=p_key,draft=jsonb_set(draft,'{image}',to_jsonb('/api/events-image/'||p_event::text)),version=version+1,updated_at=now() where id=p_event and version=p_version;
 if not found then raise exception using errcode='40001',message='Event changed elsewhere';end if;
 perform public.icsh_hub_audit(p_token,p_event,'event.poster.updated','{}');return true;end $$;
create function public.icsh_events_image(p_id uuid) returns text language sql security invoker set search_path='' as $$
 select published_image from public.icsh_events where id=p_id and visible and published is not null
$$;
revoke all on function public.icsh_events_image(uuid) from public,anon,authenticated;grant execute on function public.icsh_events_image(uuid) to service_role;

create function public.icsh_events_booking_access(p_type text,p_key text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e public.icsh_events;c jsonb;
begin select * into e from public.icsh_events where (source_type=p_type and (source_key=p_key or (p_type='tickets' and slug=p_key) or (p_type='festival' and p_key=any(select unnest(form_ids)::text)))) or (p_type='form' and exists(select 1 from public.icsh_forms f where f.id=any(form_ids) and f.slug=p_key));
 if e.id is null then return jsonb_build_object('managed',false,'visible',true,'canBook',true,'cancelled',false);end if;
 c:=e.published;return jsonb_build_object('managed',true,'slug',e.slug,'visible',e.visible and c is not null,'cancelled',e.published_status='cancelled',
 'canBook',e.visible and c is not null and e.published_status='published' and (c->>'bookingEnabled')::boolean and (c->>'startsAt')::timestamptz>now()
 and (nullif(c->>'bookingOpens','')::timestamptz is null or (c->>'bookingOpens')::timestamptz<=now())
 and (nullif(c->>'bookingCloses','')::timestamptz is null or (c->>'bookingCloses')::timestamptz>now()));end $$;
revoke all on function public.icsh_events_booking_access(text,text) from public,anon,authenticated;grant execute on function public.icsh_events_booking_access(text,text) to service_role;

-- Admin password management: require the independent Admin Hub session inside the database.
create function public.icsh_admin_require(p_token text) returns uuid language plpgsql security invoker set search_path='' as $$
declare s jsonb;begin s:=public.icsh_portal_check(p_token,'membership');if s is null then raise exception using errcode='42501',message='Sign in to the Admin Hub';end if;return (s->>'user_id')::uuid;end $$;
create function public.icsh_admin_events_access(p_token text) returns jsonb language plpgsql security invoker set search_path='' as $$
begin perform public.icsh_admin_require(p_token);return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'first_name',first_name,'enabled',enabled,'version',version) order by first_name),'[]') from public.icsh_events_credentials);end $$;
create function public.icsh_admin_save_events_access(p_token text,p_id uuid,p_version integer,p_name text,p_hash text,p_lookup text,p_enabled boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor uuid;c public.icsh_events_credentials;
begin actor:=public.icsh_admin_require(p_token);
 if p_name is null or length(btrim(p_name)) not between 1 and 60 or p_enabled is null then raise exception using errcode='22023',message='Enter a first name';end if;
 if p_id is null then
  if p_hash is null or p_lookup is null then raise exception using errcode='22023',message='Enter a password';end if;
  insert into public.icsh_events_credentials(first_name,password_hash,lookup_key,enabled) values(btrim(p_name),p_hash,p_lookup,p_enabled) returning * into c;
 else
  select * into c from public.icsh_events_credentials where id=p_id for update;
  if c.id is null or c.version<>p_version then raise exception using errcode='40001',message='Password entry changed elsewhere';end if;
  update public.icsh_events_credentials set first_name=btrim(p_name),password_hash=coalesce(p_hash,password_hash),lookup_key=coalesce(p_lookup,lookup_key),enabled=p_enabled,version=version+1,updated_at=now() where id=p_id returning * into c;
  update public.icsh_portal_sessions set revoked_at=now() where credential_id=p_id and revoked_at is null;
 end if;
 insert into public.icsh_audit_events(action,record_id,actor,changes) values('events.access.updated',c.id::text,actor::text,jsonb_build_object('firstName',c.first_name,'enabled',c.enabled));
 return jsonb_build_object('id',c.id,'first_name',c.first_name,'enabled',c.enabled,'version',c.version);
end $$;
create function public.icsh_events_session_start(p_credential uuid,p_version integer,p_hash text) returns boolean language plpgsql security invoker set search_path='' as $$
declare c public.icsh_events_credentials;begin
 select * into c from public.icsh_events_credentials where id=p_credential and enabled for update;
 if c.id is null or c.version<>p_version then raise exception using errcode='42501',message='Password changed';end if;
 insert into public.icsh_portal_sessions(token_hash,credential_id,portal,display_name) values(p_hash,p_credential,'events',c.first_name);return true;end $$;
revoke all on function public.icsh_admin_require(text),public.icsh_admin_events_access(text),public.icsh_admin_save_events_access(text,uuid,integer,text,text,text,boolean),public.icsh_events_session_start(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.icsh_admin_require(text),public.icsh_admin_events_access(text),public.icsh_admin_save_events_access(text,uuid,integer,text,text,text,boolean),public.icsh_events_session_start(uuid,integer,text) to service_role;

-- Extend the existing forms/submissions store for simple event-specific forms.
create function public.icsh_hub_forms(p_token text,p_event uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.icsh_events;begin perform public.icsh_hub_require(p_token);select * into e from public.icsh_events where id=p_event;if e.id is null then raise exception 'Event not found';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'slug',slug,'status',status,'kind',kind,'version',coalesce((configuration->>'version')::integer,0),'configuration',case when kind='custom' then configuration else null end) order by created_at),'[]') from public.icsh_forms where id=any(e.form_ids));end $$;
create function public.icsh_hub_form_save(p_token text,p_form jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
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
 c:=p_form||jsonb_build_object('id',id,'version',coalesce((f.configuration->>'version')::integer,0)+1);
 if f.id is null then
  insert into public.icsh_forms(id,slug,title,kind,status,configuration,mode) values(id,c->>'slug',c->>'title','custom',c->>'status',c,'live');
  update public.icsh_events set form_ids=array_append(form_ids,hub_form.id),version=version+1,updated_at=now() where icsh_events.id=e.id;
 else update public.icsh_forms set title=c->>'title',status=c->>'status',configuration=c where icsh_forms.id=hub_form.id;end if;
 perform public.icsh_hub_audit(p_token,e.id,'event.form.saved',jsonb_build_object('form',id,'title',c->>'title','status',c->>'status'));return c;
end $$;
create function public.icsh_hub_form_state(p_token text,p_event uuid,p_form uuid,p_version integer,p_status text) returns boolean language plpgsql security invoker set search_path='' as $$
declare e public.icsh_events;f public.icsh_forms;c jsonb;enabled boolean;
begin perform public.icsh_hub_require(p_token);select * into e from public.icsh_events where id=p_event for update;
 select * into f from public.icsh_forms where id=p_form and id=any(e.form_ids) for update;
 if f.id is null or coalesce((f.configuration->>'version')::integer,0)<>p_version then raise exception using errcode='40001',message='Form changed elsewhere';end if;
 if p_status is null or p_status not in ('published','closed') then raise exception 'Invalid status';end if;
 c:=f.configuration||jsonb_build_object('status',p_status,'hubManualClosed',p_status='closed','version',p_version+1);
 update public.icsh_forms set status=p_status,configuration=c where id=p_form;
 if f.kind='tickets' then enabled:=p_status='published';update public.icsh_events set draft=jsonb_set(draft,'{bookingEnabled}',to_jsonb(enabled)),published=case when published is null then null else jsonb_set(published,'{bookingEnabled}',to_jsonb(enabled)) end,version=version+1 where id=p_event;end if;
 perform public.icsh_hub_audit(p_token,p_event,'event.form.status',jsonb_build_object('form',p_form,'status',p_status));return true;end $$;
create function public.icsh_custom_form_public(p_slug text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.icsh_forms;e public.icsh_events;open boolean;
begin select * into f from public.icsh_forms where slug=p_slug and kind='custom' and status='published';if f.id is null then return null;end if;
 select * into e from public.icsh_events where f.id=any(form_ids) and visible and published is not null and published_status not in ('completed','cancelled');if e.id is null then return null;end if;
 open:=((e.published->>'startsAt')::timestamptz>now() and (nullif(e.published->>'bookingOpens','')::timestamptz is null or (e.published->>'bookingOpens')::timestamptz<=now()) and (nullif(e.published->>'bookingCloses','')::timestamptz is null or (e.published->>'bookingCloses')::timestamptz>now()));
 return jsonb_build_object('id',f.id,'slug',f.slug,'title',f.title,'description',f.configuration->>'description','fields',f.configuration->'fields','version',f.configuration->'version','eventTitle',e.published->>'title','eventSlug',e.slug,'open',open);end $$;
create function public.icsh_custom_form_submit(p_slug text,p_id uuid,p_version integer,p_answers jsonb,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.icsh_forms;e public.icsh_events;field jsonb;value jsonb;r jsonb;old public.icsh_submissions;ref text;contact jsonb:='{}';key text;
begin
 select * into f from public.icsh_forms where slug=p_slug and kind='custom' for update;
 if f.id is null then raise exception 'Form unavailable';end if;
 select * into old from public.icsh_submissions where id=p_id and form_id=f.id;
 if old.id is not null then if old.answers->>'requestHash'<>p_hash then raise exception using errcode='40001',message='Submission changed';end if;return jsonb_build_object('reference',old.answers->'record'->>'reference');end if;
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
revoke all on function public.icsh_custom_form_public(text),public.icsh_custom_form_submit(text,uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.icsh_custom_form_public(text),public.icsh_custom_form_submit(text,uuid,integer,jsonb,text) to service_role;

-- Every new function is callable only by the server, and Hub RPCs recheck their portal token inside Postgres.
do $$ declare r record;begin for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'icsh_hub_%' or p.proname like 'icsh_portal_%' or p.proname='icsh_events_public') loop
 execute format('revoke all on function %s from public,anon,authenticated',r.signature);execute format('grant execute on function %s to service_role',r.signature);
end loop;end $$;

-- Booking windows and publication state are enforced in the database for both booking engines.
create function public.icsh_hub_booking_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare e public.icsh_events;c jsonb;f public.icsh_forms;custom_form boolean:=false;
begin
 if tg_table_name='icsh_iftari_bookings' then
  if tg_op='UPDATE' then return new;end if;
  select * into e from public.icsh_events where source_type='iftari' and source_key=new.event_slug;
 else
  if tg_op='UPDATE' then return new;end if;
  select * into e from public.icsh_events where new.form_id=any(form_ids);
  select kind='custom' into custom_form from public.icsh_forms where id=new.form_id;
 end if;
 if e.id is null then return new;end if;c:=e.published;
 if not e.visible or e.published_status in ('cancelled','completed') or c is null or (not (c->>'bookingEnabled')::boolean and not coalesce(custom_form,false))
 or (nullif(c->>'bookingOpens','')::timestamptz>now()) or (nullif(c->>'bookingCloses','')::timestamptz<=now()) or (c->>'startsAt')::timestamptz<=now() then
 raise exception using errcode='P0001',message='Bookings are closed for this event';end if;return new;
end $$;
revoke all on function public.icsh_hub_booking_guard() from public,anon,authenticated;
create trigger icsh_hub_submission_guard before insert on public.icsh_submissions for each row execute function public.icsh_hub_booking_guard();
create trigger icsh_hub_iftari_guard before insert on public.icsh_iftari_bookings for each row execute function public.icsh_hub_booking_guard();

-- Private images. Public bytes are served only after checking the published event projection.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('icsh-event-images','icsh-event-images',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
commit;
