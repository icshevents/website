begin;
create or replace function public.icsh_hub_task(p_token text,p_event uuid,p_id uuid,p_version integer,p_title text,p_assignee_ids uuid[],p_due date,p_status text,p_description text,p_note text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t public.icsh_event_tasks;assigned text;actor text;task_updates jsonb;ids uuid[];
begin actor:=public.icsh_hub_require(p_token);
 if p_id is not null then select * into t from public.icsh_event_tasks where id=p_id and event_id=p_event for update;if t.id is null or t.version<>p_version then raise exception using errcode='40001',message='Task changed elsewhere';end if;end if;
 ids:=array(select distinct unnest(coalesce(p_assignee_ids,'{}'::uuid[])));
 if exists(select 1 from unnest(ids) v where not exists(select 1 from public.icsh_events_credentials c where c.id=v and (c.enabled or v=any(coalesce(t.assignee_ids,'{}'::uuid[]))))) then raise exception using errcode='22023',message='Choose an active team member';end if;
 select coalesce(string_agg(first_name,', ' order by first_name),'') into assigned from public.icsh_events_credentials where id=any(ids);
 task_updates:=coalesce(t.updates,'[]'::jsonb);
 if nullif(btrim(p_note),'') is not null then
  if length(p_note)>4000 or jsonb_array_length(task_updates)>=500 then raise exception using errcode='22023',message='Task update is too long';end if;
  task_updates:=task_updates||jsonb_build_array(jsonb_build_object('name',actor,'at',now(),'note',p_note,'credentialId',public.icsh_portal_check(p_token,'events')->>'credential_id'));
 end if;
 if p_id is null then insert into public.icsh_event_tasks(event_id,title,assignee_ids,assignee,description,due_date,status,updates) values(p_event,p_title,ids,assigned,p_description,p_due,p_status,task_updates) returning * into t;
 else update public.icsh_event_tasks set title=p_title,assignee_ids=ids,assignee=assigned,description=p_description,due_date=p_due,status=p_status,updates=task_updates,version=version+1 where id=p_id returning * into t;end if;
 perform public.icsh_hub_audit(p_token,p_event,'event.task.updated',jsonb_build_object('task',t.id,'title',t.title,'status',t.status,'assigned',t.assignee));return to_jsonb(t);end $$;


commit;
