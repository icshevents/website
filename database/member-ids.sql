begin;
create table public.icsh_member_ids(
 contact_id text primary key check(contact_id ~ '^[1-9][0-9]{0,29}$'),
 application_id uuid not null references public.icsh_membership_applications(id),
 member_id text not null unique check(length(member_id) between 1 and 100),
 write_started boolean not null default false,confirmed_at timestamptz,updated_at timestamptz not null default now()
);
create unique index icsh_member_ids_casefold_unique on public.icsh_member_ids(upper(member_id));
alter table public.icsh_member_ids enable row level security;
revoke all on public.icsh_member_ids from public,anon,authenticated,service_role;
grant select,insert,update on public.icsh_member_ids to service_role;
create function public.icsh_member_id_reserve(p_application uuid,p_contact text,p_candidate text,p_rejected text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.icsh_membership_applications;r public.icsh_member_ids;
begin
 select * into a from public.icsh_membership_applications where id=p_application for update;
 if a.id is null or a.mode<>'live' or a.deleted_at is not null or p_contact is null or p_contact !~ '^[1-9][0-9]{0,29}$' or (a.bigin_record_id is not null and a.bigin_record_id<>p_contact) or p_candidate is null or p_candidate !~ '^[[:alpha:]]{4}[0-9]{4}$' then raise exception using errcode='22023',message='Invalid member ID reservation';end if;
 begin
  insert into public.icsh_member_ids(contact_id,application_id,member_id) values(p_contact,p_application,p_candidate) on conflict(contact_id) do nothing;
  select * into r from public.icsh_member_ids where contact_id=p_contact for update;
  if p_rejected is not null and r.member_id=p_rejected and not r.write_started and r.confirmed_at is null then update public.icsh_member_ids set member_id=p_candidate,updated_at=now() where contact_id=p_contact returning * into r;end if;
 exception when unique_violation then return null;
 end;
 return to_jsonb(r);
end $$;
create function public.icsh_member_id_start(p_contact text,p_member_id text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.icsh_member_ids m set write_started=true,updated_at=now() from public.icsh_membership_applications a where m.contact_id=p_contact and m.member_id=p_member_id and a.id=m.application_id and a.deleted_at is null and a.mode='live';return found;
end $$;
create function public.icsh_member_id_confirm(p_application uuid,p_contact text,p_member_id text)
returns void language plpgsql security invoker set search_path='' as $$
declare a public.icsh_membership_applications;r public.icsh_member_ids;
begin
 select * into a from public.icsh_membership_applications where id=p_application for update;
 if a.id is null or a.deleted_at is not null or a.mode<>'live' or p_contact is null or p_contact !~ '^[1-9][0-9]{0,29}$' or (a.bigin_record_id is not null and a.bigin_record_id<>p_contact) or p_member_id is null or length(p_member_id) not between 1 and 100 or p_member_id ~ '[[:cntrl:]]' then raise exception using errcode='22023',message='Invalid member ID confirmation';end if;
 select * into r from public.icsh_member_ids where contact_id=p_contact for update;
 if r.confirmed_at is not null and r.member_id<>p_member_id then raise exception using errcode='40001',message='Confirmed member ID changed';end if;
 if r.confirmed_at is not null and r.member_id=p_member_id then return;end if;
 insert into public.icsh_member_ids(contact_id,application_id,member_id,write_started,confirmed_at) values(p_contact,p_application,p_member_id,true,now()) on conflict(contact_id) do update set member_id=p_member_id,write_started=true,confirmed_at=coalesce(public.icsh_member_ids.confirmed_at,now()),updated_at=now();
 insert into public.icsh_audit_events(action,record_id) values('membership.member_id.confirmed',p_application::text);
end $$;
create function public.icsh_member_id_candidates()
returns table(application_id uuid,contact_id text) language sql security invoker set search_path='' as $$
 select distinct on(a.bigin_record_id) a.id,a.bigin_record_id from public.icsh_membership_applications a left join public.icsh_member_ids m on m.contact_id=a.bigin_record_id where a.mode='live' and a.deleted_at is null and a.bigin_record_id is not null and m.confirmed_at is null order by a.bigin_record_id,a.created_at limit 5;
$$;
revoke execute on function public.icsh_member_id_reserve(uuid,text,text,text),public.icsh_member_id_start(text,text),public.icsh_member_id_confirm(uuid,text,text),public.icsh_member_id_candidates() from public,anon,authenticated;
grant execute on function public.icsh_member_id_reserve(uuid,text,text,text),public.icsh_member_id_start(text,text),public.icsh_member_id_confirm(uuid,text,text),public.icsh_member_id_candidates() to service_role;
commit;
