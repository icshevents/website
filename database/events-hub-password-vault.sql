-- Server-encrypted copies for administrator-requested viewing. Login hashes are unchanged.
begin;
create table if not exists public.icsh_events_password_vault (
 credential_id uuid primary key references public.icsh_events_credentials(id) on delete cascade,
 password_hash text not null,
 encrypted_password text not null check(length(encrypted_password) between 50 and 512),
 updated_at timestamptz not null default now()
);
alter table public.icsh_events_password_vault enable row level security;
revoke all on public.icsh_events_password_vault from public,anon,authenticated;
grant select,insert,update on public.icsh_events_password_vault to service_role;

create or replace function public.icsh_admin_save_events_access_viewable(p_token text,p_id uuid,p_version integer,p_name text,p_hash text,p_lookup text,p_enabled boolean,p_encrypted text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;credential public.icsh_events_credentials;
begin
 perform public.icsh_admin_require(p_token);
 if (p_hash is null)<>(p_encrypted is null) or (p_encrypted is not null and (length(p_encrypted) not between 50 and 512 or p_encrypted !~ '^aesgcm-v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22}[.][A-Za-z0-9_-]{8,32}$')) then
  raise exception using errcode='22023',message='Unable to store the viewable password';
 end if;
 result:=public.icsh_admin_save_events_access(p_token,p_id,p_version,p_name,p_hash,p_lookup,p_enabled);
 if p_encrypted is not null then
  select * into credential from public.icsh_events_credentials where id=(result->>'id')::uuid;
  insert into public.icsh_events_password_vault(credential_id,password_hash,encrypted_password) values(credential.id,credential.password_hash,p_encrypted)
  on conflict(credential_id) do update set password_hash=excluded.password_hash,encrypted_password=excluded.encrypted_password,updated_at=now();
 end if;
 return result;
end $$;

create or replace function public.icsh_admin_events_password(p_token text,p_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor uuid;result jsonb;
begin
 actor:=public.icsh_admin_require(p_token);
 -- A password changed through an older path must never return a stale copy.
 select jsonb_build_object('encrypted',v.encrypted_password,'lookup',c.lookup_key) into result
 from public.icsh_events_credentials c join public.icsh_events_password_vault v on v.credential_id=c.id and v.password_hash=c.password_hash where c.id=p_id;
 if result is null then return null;end if;
 insert into public.icsh_audit_events(action,record_id,actor,changes) values('events.access.password.viewed',p_id::text,actor::text,'{}');
 return result;
end $$;
revoke all on function public.icsh_admin_save_events_access_viewable(text,uuid,integer,text,text,text,boolean,text) from public,anon,authenticated;
revoke all on function public.icsh_admin_events_password(text,uuid) from public,anon,authenticated;
grant execute on function public.icsh_admin_save_events_access_viewable(text,uuid,integer,text,text,text,boolean,text),public.icsh_admin_events_password(text,uuid) to service_role;
commit;
