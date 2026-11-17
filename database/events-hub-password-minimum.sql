-- Minimum-six-character passwords; retain all existing hashes and encrypted copies.
begin;
alter table public.icsh_events_password_vault drop constraint icsh_events_password_vault_encrypted_password_check;
alter table public.icsh_events_password_vault add constraint icsh_events_password_vault_encrypted_password_check check(length(encrypted_password) between 50 and 1024);
create or replace function public.icsh_admin_save_events_access_viewable(p_token text,p_id uuid,p_version integer,p_name text,p_hash text,p_lookup text,p_enabled boolean,p_encrypted text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;credential public.icsh_events_credentials;
begin
 perform public.icsh_admin_require(p_token);
 if (p_hash is null)<>(p_encrypted is null) or (p_encrypted is not null and (length(p_encrypted) not between 50 and 1024 or length(split_part(p_encrypted,'.',4))>512 or p_encrypted !~ '^aesgcm-v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22}[.][A-Za-z0-9_-]{8,}$')) then
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

revoke all on function public.icsh_admin_save_events_access_viewable(text,uuid,integer,text,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.icsh_admin_save_events_access_viewable(text,uuid,integer,text,text,text,boolean,text) to service_role;
commit;
