-- Run in one transaction and roll back; never invokes the email provider.
begin;
do $$
declare f uuid;s uuid:=gen_random_uuid();c uuid:=gen_random_uuid();e uuid;r jsonb;
begin
 select id into f from public.icsh_forms where slug='icsh-winter-lunch-2026';
 update public.icsh_forms set configuration=configuration||'{"paidConfirmationEmail":true}'::jsonb where id=f;
 r:=jsonb_build_object('mode','live','status','pending','eventTitle','ICSH winter lunch','eventStartsAt','2026-12-27T13:00:00Z','reference','EVT-EMAILTEST','total',2775,'contact',jsonb_build_object('name','Synthetic verification','email','ticket-email-verification@icsh.org.uk'),'attendees',jsonb_build_array(jsonb_build_object('ticket','member','unitAmount',1850),jsonb_build_object('ticket','child','unitAmount',925)));
 insert into public.icsh_submissions(id,form_id,mode,answers) values(s,f,'live',jsonb_build_object('record',r));
 update public.icsh_submissions set answers=jsonb_set(answers,'{record,status}','"confirmed_paid"') where id=s;
 if exists(select 1 from public.icsh_ticket_confirmation_emails where submission_id=s) then raise exception 'Unpaid booking queued';end if;
 update public.icsh_submissions set answers=jsonb_set(answers,'{record,status}','"pending"') where id=s;
 insert into public.icsh_form_payments(source_kind,source_id,account_id,mode,amount,currency,reference,description,status,paid_at,payment_intent_id,charge_id) values('event',s,'acct_EmailVerification','live',2775,'gbp','EVT-EMAILTEST','Synthetic verification','paid',now(),'pi_EmailVerification','ch_EmailVerification');
 update public.icsh_submissions set answers=jsonb_set(answers,'{record,status}','"confirmed_paid"') where id=s;
 select id into e from public.icsh_ticket_confirmation_emails where submission_id=s;
 if e is null then raise exception 'Paid confirmation not queued';end if;
 update public.icsh_submissions set answers=answers where id=s;
 if (select count(*) from public.icsh_ticket_confirmation_emails where submission_id=s)<>1 then raise exception 'Duplicate confirmation';end if;
 update public.icsh_ticket_confirmation_emails set status='sending',claim_id=c where id=e;
 if public.icsh_ticket_email_ready(e,c) is null then raise exception 'Verified payment not eligible';end if;
 if public.icsh_ticket_email_ready(e,gen_random_uuid()) is not null then raise exception 'Wrong claim accepted';end if;
 update public.icsh_form_payments set status='refunded',refunded_amount=2775 where source_id=s and source_kind='event';
 if public.icsh_ticket_email_ready(e,c) is not null then raise exception 'Refunded payment eligible';end if;
 if has_table_privilege('anon','public.icsh_ticket_confirmation_emails','SELECT') or has_function_privilege('anon','public.icsh_ticket_email_claim(uuid)','EXECUTE') then raise exception 'Public access exposed';end if;
end $$;
rollback;
