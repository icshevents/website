-- Additive setup for the existing ICSH database. No backfill or provider calls.
begin;
create table public.icsh_form_email_settings (
 id boolean primary key default true check(id), enabled boolean not null default false
);
insert into public.icsh_form_email_settings(id,enabled) values(true,false);
create table public.icsh_form_emails (
 id uuid primary key default gen_random_uuid(),
 source_table text not null,source_id uuid not null,
 kind text not null check(kind in ('membership','donation','rishta','event','stall')),
 recipient text not null check(length(recipient)<=254),
 reference text not null check(reference~'^[A-Za-z0-9-]{1,100}$'),event_title text not null default '' check(length(event_title)<=200),
 status text not null default 'pending' check(status in ('pending','sending','accepted','retry','failed','review_required')),
 attempts integer not null default 0,claim_id uuid,claimed_at timestamptz,
 available_at timestamptz not null default now(),created_at timestamptz not null default now(),
 provider_id text,error_code text,
 unique(source_table,source_id)
);
create index icsh_form_emails_pending_idx on public.icsh_form_emails(available_at,created_at) where status in ('pending','retry');
create index icsh_form_emails_sending_idx on public.icsh_form_emails(claimed_at) where status='sending';
alter table public.icsh_form_emails enable row level security;
alter table public.icsh_form_email_settings enable row level security;
revoke all on public.icsh_form_emails,public.icsh_form_email_settings from public,anon,authenticated;
grant select,insert,update on public.icsh_form_emails to service_role;
grant select,update on public.icsh_form_email_settings to service_role;

create function public.icsh_queue_form_confirmation() returns trigger language plpgsql security invoker set search_path='' as $$
declare recipient text; ref text; k text; title text:=''; r jsonb; form_kind text;
begin
 if not exists(select 1 from public.icsh_form_email_settings where id and enabled) then return new;end if;
 if tg_table_name='icsh_membership_applications' then
  if new.mode<>'live' or new.test_data or new.deleted_at is not null then return new;end if;
  recipient:=new.answers->>'email';ref:=replace(new.reference,'TEST-MEM-','MEM-');k:='membership';
 elsif tg_table_name='icsh_donations' then
  if new.mode<>'live' then return new;end if;
  recipient:=new.email;ref:='DON-'||upper(replace(new.id::text,'-',''));k:='donation';
 elsif tg_table_name='icsh_rishta_profiles' then
  if new.is_test then return new;end if;
  recipient:=new.answers->>'SingleLine4';ref:='RIS-'||upper(replace(new.id::text,'-',''));k:='rishta';
 elsif tg_table_name='icsh_submissions' then
  if new.mode<>'live' then return new;end if;
  r:=new.answers->'record';
  select f.kind,left(f.title,200) into form_kind,title from public.icsh_forms f where f.id=new.form_id;
  if form_kind not in ('participation','stall','tickets') then return new;end if;
  recipient:=coalesce(r->'personal'->>'email',r->'contact'->>'email');ref:=r->>'reference';
  k:=case when form_kind='stall' then 'stall' else 'event' end;
 end if;
 recipient:=lower(trim(recipient));
 -- No addresses invented when a donor omits the optional email. Fictional data never sends.
 if recipient is null or recipient!~'^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' or length(recipient)>254
  or recipient~'[[:cntrl:]]' or recipient~'\.(invalid|test|example|localhost)$'
  or recipient~'@([^@]+\.)?example\.(com|org|net)$' or ref is null or ref!~'^[A-Za-z0-9-]{1,100}$' then return new;end if;
 insert into public.icsh_form_emails(source_table,source_id,kind,recipient,reference,event_title)
 values(tg_table_name,new.id,k,recipient,ref,coalesce(title,'')) on conflict(source_table,source_id) do nothing;
 return new;
end $$;
revoke execute on function public.icsh_queue_form_confirmation() from public,anon,authenticated;
grant execute on function public.icsh_queue_form_confirmation() to service_role;
create trigger icsh_membership_confirmation after insert on public.icsh_membership_applications for each row execute function public.icsh_queue_form_confirmation();
create trigger icsh_donation_confirmation after insert on public.icsh_donations for each row execute function public.icsh_queue_form_confirmation();
create trigger icsh_rishta_confirmation after insert on public.icsh_rishta_profiles for each row execute function public.icsh_queue_form_confirmation();
create trigger icsh_event_confirmation after insert on public.icsh_submissions for each row execute function public.icsh_queue_form_confirmation();

create function public.icsh_form_email_claim(p_claim uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.icsh_form_emails;
begin
 if p_claim is null or not exists(select 1 from public.icsh_form_email_settings where id and enabled) then return null;end if;
 -- A previous worker may have sent before it stopped. Hold for log reconciliation.
 update public.icsh_form_emails set status='review_required',error_code='EMAIL_OUTCOME_UNKNOWN' where status='sending' and claimed_at<now()-interval '5 minutes';
 update public.icsh_form_emails set status='failed',error_code='EMAIL_STALE' where status in ('pending','retry') and created_at<now()-interval '24 hours';
 select * into item from public.icsh_form_emails where status in ('pending','retry') and available_at<=now() order by available_at,created_at,id for update skip locked limit 1;
 if item.id is null then return null;end if;
 update public.icsh_form_emails set status='sending',claim_id=p_claim,claimed_at=now(),attempts=attempts+1 where id=item.id;
 return jsonb_build_object('id',item.id,'kind',item.kind,'recipient',item.recipient,'reference',item.reference,'event_title',item.event_title);
end $$;
create function public.icsh_form_email_finish(p_id uuid,p_claim uuid,p_status text,p_provider_id text,p_error text) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_status not in ('accepted','retry','failed','review_required') or p_status is null
  or (p_status='accepted' and (p_provider_id is null or p_provider_id!~'^[A-Za-z0-9_.-]{1,200}$'))
  or (p_error is not null and p_error!~'^[A-Z0-9_]{1,80}$') then raise exception 'Invalid email result';end if;
 update public.icsh_form_emails set status=case when p_status='retry' and attempts>=5 then 'failed' else p_status end,
  provider_id=p_provider_id,error_code=p_error,available_at=now()+interval '5 minutes'*power(2,least(attempts,5))
 where id=p_id and claim_id=p_claim and status='sending';
 return found;
end $$;
revoke execute on function public.icsh_form_email_claim(uuid),public.icsh_form_email_finish(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.icsh_form_email_claim(uuid),public.icsh_form_email_finish(uuid,uuid,text,text,text) to service_role;
commit;
