begin;
-- Workspace-only entry administration. Original answers, payment evidence and
-- ticket reservations are retained; these actions do not call Stripe or Bigin.
create table public.icsh_entry_management (
 kind text not null check(kind in ('membership','donation','rishta','event','iftari')),
 entry_id uuid not null, event_id uuid references public.icsh_events(id),
 status text check(status in ('cancelled','refunded')), deleted_at timestamptz,
 version integer not null default 1, updated_at timestamptz not null default now(),
 primary key(kind,entry_id),
 check((kind in ('event','iftari') and event_id is not null) or (kind not in ('event','iftari') and event_id is null))
);
alter table public.icsh_entry_management enable row level security;
revoke all on public.icsh_entry_management from public,anon,authenticated;
grant select,insert,update on public.icsh_entry_management to service_role;
create function public.icsh_entry_access(p_token text,p_kind text,p_event uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s jsonb;
begin
 if p_kind in ('event','iftari') then
  s:=public.icsh_portal_check(p_token,'events');
  if s is null or p_event is null or not exists(select 1 from public.icsh_events where id=p_event) then raise exception using errcode='42501',message='Events Hub access required';end if;
 elsif p_kind in ('membership','donation','rishta') then
  s:=public.icsh_portal_check(p_token,'membership');
  if s is null or p_event is not null then raise exception using errcode='42501',message='Admin Hub access required';end if;
 else raise exception using errcode='22023',message='Choose a valid entry type';end if;
 return s;
end $$;
create function public.icsh_entry_states(p_token text,p_kind text,p_event uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 perform public.icsh_entry_access(p_token,p_kind,p_event);
 return (select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from public.icsh_entry_management m where kind=p_kind and event_id is not distinct from p_event);
end $$;
create function public.icsh_entry_manage(p_token text,p_kind text,p_id uuid,p_event uuid,p_version integer,p_action text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s jsonb; m public.icsh_entry_management; valid boolean:=false;
begin
 s:=public.icsh_entry_access(p_token,p_kind,p_event);
 if p_action is null or p_action not in ('cancelled','refunded','reset','delete','restore') or p_version is null or p_version<0 then raise exception using errcode='22023',message='Choose a valid entry action';end if;
 -- Lock the source entry so concurrent first edits cannot bypass version checks.
 case p_kind
 when 'event' then perform 1 from public.icsh_submissions a join public.icsh_events e on a.form_id=any(e.form_ids) where a.id=p_id and e.id=p_event for update of a;valid:=found;
 when 'iftari' then perform 1 from public.icsh_iftari_bookings a join public.icsh_events e on e.source_type='iftari' and e.source_key=a.event_slug where a.id=p_id and e.id=p_event for update of a;valid:=found;
 when 'membership' then perform 1 from public.icsh_membership_applications where id=p_id and deleted_at is null for update;valid:=found;
 when 'donation' then perform 1 from public.icsh_donations where id=p_id for update;valid:=found;
 when 'rishta' then perform 1 from public.icsh_rishta_profiles where id=p_id for update;valid:=found;
 else null;
 end case;
 if not valid then raise exception using errcode='42501',message='Entry is unavailable in this hub';end if;
 select * into m from public.icsh_entry_management where kind=p_kind and entry_id=p_id for update;
 if coalesce(m.version,0)<>p_version then raise exception using errcode='40001',message='Entry changed elsewhere. Refresh before trying again';end if;
 if m.entry_id is not null and m.event_id is distinct from p_event then raise exception using errcode='42501',message='Entry event changed';end if;
 if m.deleted_at is not null and p_action<>'restore' then raise exception using errcode='22023',message='Restore the deleted entry first';end if;
 insert into public.icsh_entry_management(kind,entry_id,event_id,status,deleted_at) values(p_kind,p_id,p_event,case when p_action in ('cancelled','refunded') then p_action else null end,case when p_action='delete' then now() else null end)
 on conflict(kind,entry_id) do update set status=case when p_action='reset' then null when p_action in ('cancelled','refunded') then p_action else icsh_entry_management.status end,
 deleted_at=case when p_action='delete' then now() when p_action='restore' then null else icsh_entry_management.deleted_at end,
 version=icsh_entry_management.version+1,updated_at=now() returning * into m;
 insert into public.icsh_audit_events(action,record_id,event_id,actor,actor_credential_id,changes)
 values('entry.'||p_action,p_id::text,p_event,coalesce(s->>'display_name','Admin'),(s->>'credential_id')::uuid,jsonb_build_object('kind',p_kind,'version',m.version,'status',m.status,'deleted',m.deleted_at is not null));
 return to_jsonb(m);
end $$;
revoke execute on function public.icsh_entry_access(text,text,uuid),public.icsh_entry_states(text,text,uuid),public.icsh_entry_manage(text,text,uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.icsh_entry_access(text,text,uuid),public.icsh_entry_states(text,text,uuid),public.icsh_entry_manage(text,text,uuid,uuid,integer,text) to service_role;
commit;
