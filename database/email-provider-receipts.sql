begin;
create or replace function public.icsh_form_email_finish(p_id uuid,p_claim uuid,p_status text,p_provider_id text,p_error text) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_status not in ('accepted','retry','failed','review_required') or p_status is null
  or (p_status='accepted' and (p_provider_id is null or p_provider_id!~'^[A-Za-z0-9_.-]{1,200}$'))
  or (p_error is not null and p_error!~'^[A-Z0-9_]{1,80}$') then raise exception 'Invalid email result';end if;
 update public.icsh_form_emails set status=case when p_status='retry' and attempts>=5 then 'failed' else p_status end,
  provider_id=p_provider_id,error_code=p_error,available_at=now()+interval '5 minutes'*power(2,least(attempts,5))
 where id=p_id and claim_id=p_claim and status='sending';
 return found;
end $$;
revoke execute on function public.icsh_form_email_finish(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.icsh_form_email_finish(uuid,uuid,text,text,text) to service_role;
commit;
