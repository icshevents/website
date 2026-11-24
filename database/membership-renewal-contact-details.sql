begin;
set local lock_timeout = '5s';

alter table public.icsh_membership_mobile_verifications
  add column old_first_name text,
  add column old_last_name text,
  add column new_first_name text,
  add column new_last_name text,
  drop constraint icsh_membership_mobile_verifications_check,
  add constraint icsh_membership_verifications_paired_names check (
    (new_first_name is null and new_last_name is null and old_first_name is null and old_last_name is null)
    or (new_first_name is not null and new_last_name is not null
      and length(new_first_name) between 1 and 80 and length(new_last_name) between 1 and 80
      and new_first_name = btrim(new_first_name) and new_last_name = btrim(new_last_name))
  ),
  add constraint icsh_membership_verifications_changed_details check (
    new_mobile is distinct from old_mobile
    or (new_first_name is not null and row(old_first_name, old_last_name) is distinct from row(new_first_name, new_last_name))
  );

-- The existing mobile-only RPC and its original callers continue to work.
create function public.icsh_membership_contact_start(
  p_id uuid, p_contact text, p_email text, p_old text, p_new text, p_code_hash text,
  p_old_first text, p_old_last text, p_new_first text, p_new_last text
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_id is null or p_contact is null or p_email is null or p_new is null or p_code_hash is null
    or p_new_first is null or p_new_last is null
    or (p_new is not distinct from p_old and row(p_old_first, p_old_last) is not distinct from row(p_new_first, p_new_last))
    then return false;
  end if;
  -- Share the existing email lock and limits so old and new clients share one quota.
  perform pg_advisory_xact_lock(hashtextextended('icsh-mobile:' || p_email, 0));
  if (select count(*) from public.icsh_membership_mobile_verifications where email = p_email and created_at > now() - interval '24 hours') >= 5
    or exists (select 1 from public.icsh_membership_mobile_verifications where email = p_email and created_at > now() - interval '60 seconds')
    then return false;
  end if;
  update public.icsh_membership_mobile_verifications
    set expires_at = least(expires_at, now()) where email = p_email and verified_at is null;
  insert into public.icsh_membership_mobile_verifications
    (id, contact_id, email, old_mobile, new_mobile, code_hash, old_first_name, old_last_name, new_first_name, new_last_name)
    values (p_id, p_contact, p_email, p_old, p_new, p_code_hash, p_old_first, p_old_last, p_new_first, p_new_last);
  return true;
end $$;

create function public.icsh_membership_contact_proof(
  p_id uuid, p_hash text, p_email text, p_mobile text, p_application uuid,
  p_first text, p_last text, p_name_changed boolean
) returns boolean language sql stable security invoker set search_path = '' as $$
  select public.icsh_membership_mobile_proof(p_id, p_hash, p_email, p_mobile, p_application)
    and exists (
      select 1 from public.icsh_membership_mobile_verifications v where v.id = p_id and (
        (v.new_first_name is null and p_name_changed is false)
        or (v.new_first_name = p_first and v.new_last_name = p_last)
      )
    );
$$;

create or replace function public.icsh_membership_mobile_bind()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v public.icsh_membership_mobile_verifications;
  requested uuid;
begin
  if new.answers->>'mobileVerificationId' is null then return new; end if;
  if tg_op = 'UPDATE' and old.answers->>'mobileVerificationId' is not distinct from new.answers->>'mobileVerificationId' then
    if row(old.answers->>'firstName', old.answers->>'lastName', old.answers->>'email', old.answers->>'mobile')
      is distinct from row(new.answers->>'firstName', new.answers->>'lastName', new.answers->>'email', new.answers->>'mobile')
      then raise exception using errcode = '22023', message = 'Renewal details verification required';
    end if;
    return new;
  end if;
  requested := (new.answers->>'mobileVerificationId')::uuid;
  select * into v from public.icsh_membership_mobile_verifications where id = requested for update;
  if new.mode <> 'live' or new.test_data or new.answers->>'kind' is distinct from 'renewal'
    or v.id is null or v.verified_at is null or v.proof_until <= now() or v.application_id is not null
    or v.email is distinct from lower(btrim(new.answers->>'email'))
    or substr(v.new_mobile, 2) is distinct from public.icsh_membership_mobile_key(new.answers->>'mobile')
    or (v.new_first_name is not null and row(v.new_first_name, v.new_last_name)
      is distinct from row(btrim(new.answers->>'firstName'), btrim(new.answers->>'lastName')))
    then raise exception using errcode = '22023', message = 'Renewal details verification required';
  end if;
  update public.icsh_membership_mobile_verifications set application_id = new.id where id = v.id;
  return new;
end $$;

revoke all on function public.icsh_membership_contact_start(uuid,text,text,text,text,text,text,text,text,text),
  public.icsh_membership_contact_proof(uuid,text,text,text,uuid,text,text,boolean) from public, anon, authenticated;
grant execute on function public.icsh_membership_contact_start(uuid,text,text,text,text,text,text,text,text,text),
  public.icsh_membership_contact_proof(uuid,text,text,text,uuid,text,text,boolean) to service_role;

commit;
