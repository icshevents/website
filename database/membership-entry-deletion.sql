begin;
alter table public.icsh_membership_applications add column deleted_at timestamptz;
drop index public.icsh_membership_application_email_unique;
drop index public.icsh_membership_application_phone_unique;
create unique index icsh_membership_application_email_unique on public.icsh_membership_applications(mode,lower(btrim(answers->>'email'))) where deleted_at is null;
create unique index icsh_membership_application_phone_unique on public.icsh_membership_applications(mode,public.icsh_membership_mobile_key(answers->>'mobile')) where deleted_at is null;
create function public.icsh_membership_entries_delete(p_ids uuid[],p_actor uuid)
returns integer language plpgsql security invoker set search_path='' as $$
declare item uuid;changed integer:=0;
begin
 if p_ids is null or cardinality(p_ids) not between 1 and 100 or not exists(select 1 from public.icsh_organisers where user_id=p_actor) then
  raise exception using errcode='42501',message='Approved organiser access required';end if;
 for item in select id from public.icsh_membership_applications where id=any(p_ids) and deleted_at is null order by id for update loop
  update public.icsh_membership_applications set deleted_at=now(),updated_at=now() where id=item;
  insert into public.icsh_audit_events(action,record_id) values('membership.application.deleted',item::text);changed:=changed+1;
 end loop;
 return changed;
end $$;
revoke execute on function public.icsh_membership_entries_delete(uuid[],uuid) from public,anon,authenticated;
grant execute on function public.icsh_membership_entries_delete(uuid[],uuid) to service_role;
commit;
