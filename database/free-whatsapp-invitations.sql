-- Add an independently gated Student/free invitation route. No backfill or record updates.
-- Paid invitation functions and their claims are unchanged.
begin;
create function public.icsh_free_whatsapp_invitation_claim(p_id uuid,p_token uuid,p_request jsonb,p_applications_from timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.icsh_membership_applications;p public.icsh_membership_payments;x public.icsh_membership_activations;
 saved public.icsh_whatsapp_invitations;keys integer;today date:=(now() at time zone 'Europe/London')::date;
begin
 if p_id is null or p_token is null or p_applications_from is null or p_request is null or
  jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>3000 then
  raise exception using errcode='22023',message='Invalid invitation request';end if;
 select count(*) into keys from jsonb_object_keys(p_request);
 if keys<>10 or not(p_request ?& array['applicationId','contactId','recipient','paymentIntentId','startDate','expiryDate','templateName','category','sender','accountId']) or
  exists(select 1 from jsonb_each(p_request) e where e.key<>'paymentIntentId' and jsonb_typeof(e.value)<>'string') or
  p_request->'paymentIntentId' is distinct from 'null'::jsonb or
  p_request->>'accountId' is distinct from 'free' or p_request->>'applicationId' is distinct from p_id::text or
  p_request->>'contactId' !~ '^[1-9][0-9]{0,29}$' or p_request->>'recipient' !~ '^[+][1-9][0-9]{6,14}$' or
  p_request->>'sender' !~ '^[+][1-9][0-9]{6,14}$' or p_request->>'sender'=p_request->>'recipient' or
  p_request->>'templateName' !~ '^icsh_[a-z0-9_]{1,100}$' or p_request->>'category' not in ('utility','marketing') then
  raise exception using errcode='22023',message='Invalid invitation request';end if;
 select * into a from public.icsh_membership_applications where id=p_id for update;
 select * into p from public.icsh_membership_payments where application_id=p_id for update;
 select * into x from public.icsh_membership_activations where application_id=p_id for update;
 if a.id is null or p.application_id is not null or x.application_id is null or a.deleted_at is not null or
  a.mode<>'live' or a.test_data is distinct from false or a.currency<>'GBP' or a.created_at<p_applications_from or
  a.answers->'whatsappInvitation' is distinct from 'true'::jsonb or
  a.answers->>'communicationsNotice' is distinct from '2026-11-06-all-tiers-v2' or
  a.answers->>'kind' not in ('new','renewal') or not public.icsh_free_membership_eligible(p_id) or
  x.status is distinct from 'active' or x.activation_kind is distinct from 'free' or x.account_id is distinct from 'free' or
  x.payment_intent_id is not null or x.paid_at is not null or a.bigin_sync_status is distinct from 'synced' or
  a.bigin_record_id is distinct from x.contact_id or x.contact_id is null or
  x.start_date>today or x.expiry_date<=today or x.expiry_date<=x.start_date or
  x.contact_id is distinct from p_request->>'contactId' or x.start_date::text is distinct from p_request->>'startDate' or
  x.expiry_date::text is distinct from p_request->>'expiryDate' or
  public.icsh_membership_mobile_key(a.answers->>'mobile') is distinct from substr(p_request->>'recipient',2) then return null;end if;
 insert into public.icsh_whatsapp_invitations(application_id,claim_token,request)
  values(p_id,p_token,p_request) on conflict(application_id) do nothing returning * into saved;
 if saved.application_id is null then return null;end if;
 return jsonb_build_object('token',saved.claim_token);
end $$;
create function public.icsh_free_whatsapp_invitation_candidates(p_applications_from timestamptz)
returns table(application_id uuid) language sql security invoker set search_path='' as $$
 select a.id from public.icsh_membership_applications a
 join public.icsh_membership_activations x on x.application_id=a.id
 left join public.icsh_whatsapp_invitations w on w.application_id=a.id
 where w.application_id is null and a.created_at>=p_applications_from and
  a.answers->'whatsappInvitation'='true'::jsonb and a.answers->>'communicationsNotice'='2026-11-06-all-tiers-v2' and
  public.icsh_free_membership_eligible(a.id) and a.bigin_sync_status='synced' and a.currency='GBP' and
  a.answers->>'kind' in ('new','renewal') and
  not exists(select 1 from public.icsh_membership_payments p where p.application_id=a.id) and
  x.status='active' and x.activation_kind='free' and x.account_id='free' and x.payment_intent_id is null and x.paid_at is null and
  x.contact_id=a.bigin_record_id and x.start_date<=(now() at time zone 'Europe/London')::date and
  x.expiry_date>(now() at time zone 'Europe/London')::date and x.expiry_date>x.start_date
 order by a.created_at,a.id limit 5;
$$;
revoke execute on function public.icsh_free_whatsapp_invitation_claim(uuid,uuid,jsonb,timestamptz),public.icsh_free_whatsapp_invitation_candidates(timestamptz) from public,anon,authenticated;
grant execute on function public.icsh_free_whatsapp_invitation_claim(uuid,uuid,jsonb,timestamptz),public.icsh_free_whatsapp_invitation_candidates(timestamptz) to service_role;
commit;
