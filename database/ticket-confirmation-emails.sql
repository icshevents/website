-- Paid winter-lunch confirmations. Additive, service-only, no historical backfill.
begin;
create table public.icsh_ticket_confirmation_emails (
 id uuid primary key default gen_random_uuid(), submission_id uuid not null unique references public.icsh_submissions(id),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 status text not null default 'pending' check(status in ('pending','sending','accepted','retry','failed','review_required')),
 attempts integer not null default 0,claim_id uuid,claimed_at timestamptz,
 available_at timestamptz not null default now(),created_at timestamptz not null default now(),provider_id text,error_code text
);
create index icsh_ticket_emails_pending_idx on public.icsh_ticket_confirmation_emails(available_at,created_at) where status in ('pending','retry');
alter table public.icsh_ticket_confirmation_emails enable row level security;
revoke all on public.icsh_ticket_confirmation_emails from public,anon,authenticated;
grant select,insert,update on public.icsh_ticket_confirmation_emails to service_role;

create function public.icsh_queue_paid_ticket_email() returns trigger language plpgsql security invoker set search_path='' as $$
declare r jsonb; f public.icsh_forms; p public.icsh_form_payments; recipient text;
begin
 r:=new.answers->'record';
 if new.mode<>'live' or r->>'mode'<>'live' or r->>'status'<>'confirmed_paid' or coalesce((r->>'paymentReview')::boolean,false)
  or old.answers->'record'->>'status'='confirmed_paid' then return new;end if;
 if not exists(select 1 from public.icsh_form_email_settings where id and enabled) then return new;end if;
 select * into f from public.icsh_forms where id=new.form_id;
 if f.kind<>'tickets' or f.slug<>'icsh-winter-lunch-2026' or f.configuration->>'paidConfirmationEmail' is distinct from 'true' then return new;end if;
 select * into p from public.icsh_form_payments where source_kind='event' and source_id=new.id;
 if p.status is distinct from 'paid' or p.mode<>'live' or p.currency<>'gbp' or p.refunded_amount<>0 or p.paid_at is null or p.payment_intent_id is null or p.charge_id is null
  or p.amount is distinct from (r->>'total')::integer or p.amount is distinct from (select sum((a->>'unitAmount')::integer) from jsonb_array_elements(r->'attendees') a) then return new;end if;
 recipient:=lower(trim(r->'contact'->>'email'));
 if recipient is null or recipient !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$' or length(recipient)>254 or recipient~'[[:cntrl:]]'
  or recipient~'[.](invalid|test|example|localhost)$' or recipient~'@([^@]+[.])?example[.](com|org|net)$' then return new;end if;
 insert into public.icsh_ticket_confirmation_emails(submission_id,payload) values(new.id,jsonb_build_object(
  'recipient',recipient,'reference',r->>'reference','name',r->'contact'->>'name','title',r->>'eventTitle','venue',f.configuration->>'venue',
  'startsAt',r->>'eventStartsAt','endsAt',f.configuration->>'endsAt','total',p.amount,
  'attendees',(select jsonb_agg(jsonb_build_object('ticket',a->>'ticket','unitAmount',(a->>'unitAmount')::integer)) from jsonb_array_elements(r->'attendees') a)))
 on conflict(submission_id) do nothing;
 return new;
end $$;
create trigger icsh_paid_ticket_email after update of answers on public.icsh_submissions for each row execute function public.icsh_queue_paid_ticket_email();

create function public.icsh_ticket_email_ready(p_id uuid,p_claim uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 select e.payload || jsonb_build_object('id',e.id) into result from public.icsh_ticket_confirmation_emails e
 join public.icsh_submissions s on s.id=e.submission_id
 join public.icsh_form_payments p on p.source_kind='event' and p.source_id=s.id
 where e.id=p_id and e.claim_id=p_claim and e.status='sending' and s.mode='live' and s.answers->'record'->>'status'='confirmed_paid'
 and not coalesce((s.answers->'record'->>'paymentReview')::boolean,false)
 and p.mode='live' and p.status='paid' and p.refunded_amount=0 and p.paid_at is not null and p.payment_intent_id is not null and p.charge_id is not null
 and p.amount=(e.payload->>'total')::integer and p.amount=(s.answers->'record'->>'total')::integer and lower(trim(s.answers->'record'->'contact'->>'email'))=e.payload->>'recipient';
 return result;
end $$;
create function public.icsh_ticket_email_claim(p_claim uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.icsh_ticket_confirmation_emails;
begin
 if p_claim is null or not exists(select 1 from public.icsh_form_email_settings where id and enabled) then return null;end if;
 update public.icsh_ticket_confirmation_emails set status='review_required',error_code='EMAIL_OUTCOME_UNKNOWN' where status='sending' and claimed_at<now()-interval '5 minutes';
 update public.icsh_ticket_confirmation_emails set status='failed',error_code='EMAIL_STALE' where status in ('pending','retry') and greatest(created_at,available_at)<now()-interval '48 hours';
 select * into item from public.icsh_ticket_confirmation_emails where status in ('pending','retry') and available_at<=now() order by available_at,created_at,id for update skip locked limit 1;
 if item.id is null then return null;end if;
 update public.icsh_ticket_confirmation_emails set status='sending',claim_id=p_claim,claimed_at=now(),attempts=attempts+1 where id=item.id;
 return jsonb_build_object('id',item.id);
end $$;
create function public.icsh_ticket_email_finish(p_id uuid,p_claim uuid,p_status text,p_provider_id text,p_error text) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_status is null or p_status not in ('accepted','retry','failed','review_required') or (p_status='accepted' and (p_provider_id is null or p_provider_id!~'^[A-Za-z0-9_.-]{1,200}$'))
  or (p_error is not null and p_error!~'^[A-Z0-9_]{1,80}$') then raise exception 'Invalid email result';end if;
 update public.icsh_ticket_confirmation_emails set status=case when p_status='retry' and attempts>=5 then 'failed' else p_status end,
 provider_id=p_provider_id,error_code=p_error,available_at=now()+interval '5 minutes'*power(2,least(attempts,5)) where id=p_id and claim_id=p_claim and status='sending';
 return found;
end $$;
revoke execute on function public.icsh_queue_paid_ticket_email(),public.icsh_ticket_email_ready(uuid,uuid),public.icsh_ticket_email_claim(uuid),public.icsh_ticket_email_finish(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.icsh_queue_paid_ticket_email(),public.icsh_ticket_email_ready(uuid,uuid),public.icsh_ticket_email_claim(uuid),public.icsh_ticket_email_finish(uuid,uuid,text,text,text) to service_role;
commit;
