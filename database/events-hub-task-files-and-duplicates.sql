begin;
create table public.icsh_task_files (
 id uuid primary key, task_id uuid not null references public.icsh_event_tasks(id),event_id uuid not null references public.icsh_events(id),
 storage_key text not null unique,name text not null check(length(name) between 1 and 180 and name !~ '[[:cntrl:]]'),
 size integer not null check(size between 1 and 10485760),mime text not null check(mime in ('application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain')),
 uploaded_by text not null,credential_id uuid references public.icsh_events_credentials(id),created_at timestamptz not null default now()
);
create index icsh_task_files_event_task_idx on public.icsh_task_files(event_id,task_id);
alter table public.icsh_task_files enable row level security;
revoke all on public.icsh_task_files from public,anon,authenticated;
grant select,insert on public.icsh_task_files to service_role;
create function public.icsh_hub_task_files(p_token text,p_event uuid,p_task uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
begin perform public.icsh_hub_require(p_token);if not exists(select 1 from public.icsh_event_tasks where id=p_task and event_id=p_event) then raise exception using errcode='42501',message='Task access denied';end if;
 return(select coalesce(jsonb_agg(to_jsonb(f) order by created_at),'[]') from public.icsh_task_files f where task_id=p_task and event_id=p_event);end $$;
create function public.icsh_hub_task_file_add(p_token text,p_event uuid,p_task uuid,p_id uuid,p_key text,p_name text,p_size integer,p_mime text) returns uuid language plpgsql security invoker set search_path='' as $$
declare s jsonb;begin perform public.icsh_hub_require(p_token);s:=public.icsh_portal_check(p_token,'events');
 perform 1 from public.icsh_event_tasks where id=p_task and event_id=p_event for update;if not found then raise exception using errcode='42501',message='Task access denied';end if;
 if p_key !~ ('^'||p_task::text||'/'||p_id::text||'\.(pdf|jpg|png|webp|docx|xlsx|pptx|txt)$') or p_key is null then raise exception 'Invalid file key';end if;
 if (select count(*) from public.icsh_task_files where task_id=p_task)>=20 then raise exception using errcode='22023',message='This task already has 20 files';end if;
 insert into public.icsh_task_files(id,task_id,event_id,storage_key,name,size,mime,uploaded_by,credential_id) values(p_id,p_task,p_event,p_key,p_name,p_size,p_mime,coalesce(s->>'display_name','Events team'),(s->>'credential_id')::uuid);
 perform public.icsh_hub_audit(p_token,p_event,'task.file.attached',jsonb_build_object('task',p_task,'file',p_id,'name',p_name));return p_id;
end $$;
revoke all on function public.icsh_hub_task_files(text,uuid,uuid),public.icsh_hub_task_file_add(text,uuid,uuid,uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.icsh_hub_task_files(text,uuid,uuid),public.icsh_hub_task_file_add(text,uuid,uuid,uuid,text,text,integer,text) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('icsh-task-files','icsh-task-files',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain']) on conflict(id) do nothing;
create function public.icsh_hub_form_duplicate(p_token text,p_source_event uuid,p_source_form uuid,p_source_version integer,p_target_event uuid,p_target_version integer,p_title text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare source public.icsh_events;target public.icsh_events;f public.icsh_forms;existing public.icsh_forms;c jsonb;newid uuid;newslug text;
begin perform public.icsh_hub_require(p_token);
 perform 1 from public.icsh_events where id in (p_source_event,p_target_event) order by id for update;
 select * into source from public.icsh_events where id=p_source_event;select * into target from public.icsh_events where id=p_target_event;
 select * into f from public.icsh_forms where id=p_source_form and id=any(source.form_ids);
 if f.id is null or target.id is null then raise exception using errcode='42501',message='Event form access denied';end if;
 if coalesce((f.configuration->>'version')::integer,0)<>p_source_version or target.version<>p_target_version then raise exception using errcode='40001',message='Event or form changed elsewhere';end if;
 if length(btrim(coalesce(p_title,''))) not between 1 and 140 then raise exception using errcode='22023',message='Enter a form title up to 140 characters';end if;
 newid:=gen_random_uuid();newslug:=left(target.slug,60)||'-form-'||left(replace(newid::text,'-',''),12);
 if f.kind='tickets' then
  if target.source_type<>'tickets' or target.published is not null or target.status not in ('draft','ready_for_review') or source.id=target.id then raise exception using errcode='22023',message='Choose a new unpublished ticket event for the copied booking form';end if;
  select * into existing from public.icsh_forms where id=target.source_key::uuid for update;
  if existing.id is null or exists(select 1 from public.icsh_submissions where form_id=existing.id) then raise exception using errcode='22023',message='The target booking form already has entries';end if;
  newid:=existing.id;newslug:=existing.slug;
 end if;
 c:=(f.configuration-'hubManualClosed')||jsonb_build_object('id',newid,'slug',newslug,'version',case when f.kind='tickets' then coalesce((existing.configuration->>'version')::integer,0)+1 else 1 end,'status','draft','mode','live','prototype',false);
 if f.kind='custom' then c:=c||jsonb_build_object('eventId',target.id,'title',btrim(p_title));
 else c:=c||jsonb_build_object('title',btrim(p_title),'formTitle',btrim(p_title),'eventName',target.draft->>'title','startsAt',target.draft->>'startsAt','endsAt',target.draft->>'endsAt','venue',concat_ws(', ',target.draft->>'venue',nullif(target.draft->>'address','')),'deadline','');end if;
 if f.kind='tickets' then
  c:=c||jsonb_build_object('capacity',(target.draft->>'capacity')::integer,'description',target.draft->>'description','rates',(case when (target.draft->>'childTickets')::boolean then target.draft->'prices' else (target.draft->'prices')-'child'-'childNonmember'-'under5' end)||jsonb_build_object('pensioner',target.draft->'prices'->'member','student',target.draft->'prices'->'member'),'bookingOpens',target.draft->'bookingOpens','bookingCloses',target.draft->'bookingCloses');
  update public.icsh_forms set title=btrim(p_title),configuration=c,status='draft' where id=newid;
 else
  insert into public.icsh_forms(id,slug,title,kind,status,configuration,mode) values(newid,newslug,btrim(p_title),f.kind,'draft',c,'live');
  update public.icsh_events set form_ids=array_append(form_ids,newid),source_type=case when source_type='none' and f.kind in ('participation','stall') then 'festival' else source_type end,source_key=case when source_type='none' and f.kind in ('participation','stall') then newid::text else source_key end where id=target.id;
 end if;
 update public.icsh_events set version=version+1,updated_at=now() where id=target.id;
 perform public.icsh_hub_audit(p_token,target.id,'event.form.duplicated',jsonb_build_object('form',newid,'sourceForm',f.id,'sourceEvent',source.id,'title',p_title));
 return jsonb_build_object('id',newid,'eventId',target.id,'title',p_title,'status','draft');
end $$;
revoke all on function public.icsh_hub_form_duplicate(text,uuid,uuid,integer,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.icsh_hub_form_duplicate(text,uuid,uuid,integer,uuid,integer,text) to service_role;
create or replace function public.icsh_events_public(p_slug text default null) returns jsonb
language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'slug',slug,'content',published,'status',published_status,'sourceType',source_type,'sourceKey',source_key,'forms',(select coalesce(jsonb_agg(jsonb_build_object('title',f.title,'url',case f.kind when 'participation' then case when f.id='500893f1-5724-547a-bd5c-8eae0e648890' then '/harrow-food-festival-2026/get-involved' else '/event-participation/'||f.slug end when 'stall' then '/stall-hire/'||f.slug else '/event-forms/'||f.slug end)),'[]') from public.icsh_forms f where f.id=any(form_ids) and f.kind in ('custom','participation','stall') and f.status='published')) order by (published->>'startsAt')::timestamptz),'[]'::jsonb)
 from public.icsh_events where visible and published is not null and published_status<>'completed' and not archived and (p_slug is null or slug=p_slug)
$$;

create or replace function public.icsh_hub_form_state(p_token text,p_event uuid,p_form uuid,p_version integer,p_status text) returns boolean language plpgsql security invoker set search_path='' as $$
declare e public.icsh_events;f public.icsh_forms;c jsonb;enabled boolean;
begin perform public.icsh_hub_require(p_token);select * into e from public.icsh_events where id=p_event for update;
 select * into f from public.icsh_forms where id=p_form and id=any(e.form_ids) for update;
 if f.id is null or coalesce((f.configuration->>'version')::integer,0)<>p_version then raise exception using errcode='40001',message='Form changed elsewhere';end if;
 if p_status is null or p_status not in ('published','closed') then raise exception 'Invalid status';end if;
 c:=f.configuration||jsonb_build_object('status',p_status,'hubManualClosed',p_status='closed','version',p_version+1);
 update public.icsh_forms set status=p_status,configuration=c where id=p_form;
 if f.kind='tickets' or (f.kind in ('participation','stall') and e.source_type='festival') then enabled:=case when f.kind='tickets' then p_status='published' else p_status='published' or exists(select 1 from public.icsh_forms where id=any(e.form_ids) and id<>p_form and kind in ('participation','stall') and status='published') end;update public.icsh_events set draft=jsonb_set(draft,'{bookingEnabled}',to_jsonb(enabled)),published=case when published is null then null else jsonb_set(published,'{bookingEnabled}',to_jsonb(enabled)) end,version=version+1 where id=p_event;end if;
 perform public.icsh_hub_audit(p_token,p_event,'event.form.status',jsonb_build_object('form',p_form,'status',p_status));return true;end $$;

commit;
