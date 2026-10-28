-- Read confirmed membership fields only for the worker holding this email claim.
begin;
create function public.icsh_membership_email_details(p_id uuid,p_claim uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('membership_number',m.member_id,
   'start_date',x.start_date::text,'expiry_date',x.expiry_date::text)
 from public.icsh_form_emails e
 join public.icsh_membership_applications a on a.id=e.source_id
 join public.icsh_membership_activations x on x.application_id=a.id
 join public.icsh_member_ids m on m.contact_id=x.contact_id
 where e.id=p_id and e.kind='membership_active' and e.status='sending'
   and e.claim_id=p_claim and m.confirmed_at is not null
   and lower(trim(a.answers->>'email'))=e.recipient
   and x.expiry_date>=x.start_date
   and public.icsh_membership_email_eligible(e.id);
$$;
revoke execute on function public.icsh_membership_email_details(uuid,uuid) from public,anon,authenticated;
grant execute on function public.icsh_membership_email_details(uuid,uuid) to service_role;
commit;
