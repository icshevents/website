-- Shared Checkout ledger for donations and future paid ticket forms.
begin;
create table public.icsh_donations (
 id uuid primary key,request_hash text not null check(request_hash~'^[a-f0-9]{64}$'),
 capability_hash text not null check(capability_hash~'^[a-f0-9]{64}$'),
 amount integer not null check(amount between 30 and 10000000),currency text not null default 'gbp' check(currency='gbp'),
 first_name text not null default '' check(length(first_name)<=80),last_name text not null default '' check(length(last_name)<=80),
 email text not null default '' check(length(email)<=254 and (email='' or email~'^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$')),
 mode text not null check(mode in ('live','test')),created_at timestamptz not null default now()
);
create table public.icsh_form_payments (
 source_kind text not null check(source_kind in ('donation','event')),source_id uuid not null,
 account_id text not null check(account_id~'^acct_[A-Za-z0-9]+$'),mode text not null check(mode in ('live','test')),
 amount integer not null check(amount between 30 and 12000000),currency text not null default 'gbp' check(currency='gbp'),
 reference text not null,description text not null,
 session_id text unique check(session_id~'^cs_(test_|live_)?[A-Za-z0-9]+$'),
 payment_intent_id text unique check(payment_intent_id~'^pi_[A-Za-z0-9]+$'),charge_id text check(charge_id~'^ch_[A-Za-z0-9]+$'),
 status text not null default 'pending' check(status in ('pending','paid','failed','expired','partially_refunded','refunded','disputed')),
 paid_at timestamptz,refunded_amount integer not null default 0 check(refunded_amount>=0 and refunded_amount<=amount),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(source_kind,source_id),
 check(status not in ('paid','partially_refunded','refunded','disputed') or (paid_at is not null and payment_intent_id is not null and charge_id is not null))
);
create table public.icsh_form_payment_events (
 event_id text primary key check(event_id~'^evt_[A-Za-z0-9]+$'),source_kind text not null,source_id uuid not null,
 account_id text not null,mode text not null check(mode in ('live','test')),event_type text not null,created_at timestamptz not null default now(),
 foreign key(source_kind,source_id) references public.icsh_form_payments(source_kind,source_id)
);
create index icsh_form_payment_event_source_idx on public.icsh_form_payment_events(source_kind,source_id);
alter table public.icsh_donations enable row level security;
alter table public.icsh_form_payments enable row level security;
alter table public.icsh_form_payment_events enable row level security;
revoke all on public.icsh_donations,public.icsh_form_payments,public.icsh_form_payment_events from public,anon,authenticated,service_role;
grant select,insert,update on public.icsh_donations to service_role;
grant select,insert,update on public.icsh_form_payments to service_role;
grant select,insert on public.icsh_form_payment_events to service_role;

create function public.icsh_donation_save(p_id uuid,p_request_hash text,p_capability_hash text,p_amount integer,p_first_name text,p_last_name text,p_email text,p_mode text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.icsh_donations;
begin
 insert into public.icsh_donations(id,request_hash,capability_hash,amount,first_name,last_name,email,mode)
 values(p_id,p_request_hash,p_capability_hash,p_amount,p_first_name,p_last_name,p_email,p_mode) on conflict(id) do nothing;
 select * into d from public.icsh_donations where id=p_id for update;
 if d.request_hash is distinct from p_request_hash or d.capability_hash is distinct from p_capability_hash or d.mode is distinct from p_mode then
  raise exception using errcode='40001',message='Donation request conflict';end if;
 return jsonb_build_object('id',d.id,'reference','DON-'||upper(replace(d.id::text,'-','')),'amount',d.amount);
end $$;

-- Locks parent form before submission, matching icsh_event_write lock order.
create function public.icsh_form_payment_source(p_kind text,p_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.icsh_donations;s public.icsh_submissions;f public.icsh_forms;r jsonb;parent_id uuid;amount integer;
begin
 if p_kind='donation' then
  select * into d from public.icsh_donations where id=p_id for update;
  if d.id is null then return null;end if;
  return jsonb_build_object('kind',p_kind,'id',p_id,'mode',d.mode,'amount',d.amount,'currency','gbp','reference','DON-'||upper(replace(d.id::text,'-','')),
   'description','Donation to ICSH','email',d.email,'capabilityHash',d.capability_hash,'eligible',true);
 elsif p_kind='event' then
  select form_id into parent_id from public.icsh_submissions where id=p_id;
  select * into f from public.icsh_forms where id=parent_id for update;
  select * into s from public.icsh_submissions where id=p_id and form_id=parent_id for update;
  if s.id is null or f.kind is distinct from 'tickets' then return null;end if;
  r:=s.answers->'record';amount:=(r->>'total')::integer;
  if r->>'mode' is distinct from s.mode or r->>'currency' is distinct from 'gbp' or jsonb_typeof(r->'attendees') is distinct from 'array'
   or amount is null or amount<>(select coalesce(sum((value->>'unitAmount')::integer),0) from jsonb_array_elements(r->'attendees')) then
   raise exception using errcode='22023',message='Invalid saved booking amount';end if;
  return jsonb_build_object('kind',p_kind,'id',p_id,'mode',s.mode,'amount',amount,'currency','gbp','reference',r->>'reference',
   'description',r->>'eventTitle','email',r->'contact'->>'email','capabilityHash',r->>'capabilityHash','formId',parent_id,
   'eligible',coalesce(s.mode=f.mode and f.status='published' and f.configuration->>'status'='published'
    and (f.configuration->>'startsAt')::timestamptz>now() and not coalesce((f.configuration->>'prototype')::boolean,false)
    and r->>'status' not in ('cancelled','confirmed_free'),false));
 end if;
 return null;
end $$;

create function public.icsh_form_payment_prepare(p_kind text,p_id uuid,p_account text,p_mode text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s jsonb;p public.icsh_form_payments;
begin
 s:=public.icsh_form_payment_source(p_kind,p_id);
 if s is null or s->>'mode' is distinct from p_mode or (s->>'amount')::integer<30 or coalesce((s->>'eligible')::boolean,false) is not true then
  raise exception using errcode='22023',message='Payment is not available';end if;
 insert into public.icsh_form_payments(source_kind,source_id,account_id,mode,amount,reference,description)
 values(p_kind,p_id,p_account,p_mode,(s->>'amount')::integer,s->>'reference',s->>'description') on conflict(source_kind,source_id) do nothing;
 select * into p from public.icsh_form_payments where source_kind=p_kind and source_id=p_id for update;
 if p.account_id is distinct from p_account or p.mode is distinct from p_mode or p.amount is distinct from (s->>'amount')::integer then
  raise exception using errcode='40001',message='Payment configuration changed';end if;
 return to_jsonb(p);
end $$;

create function public.icsh_form_payment_attach(p_kind text,p_id uuid,p_account text,p_mode text,p_session text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.icsh_form_payments;
begin
 select * into p from public.icsh_form_payments where source_kind=p_kind and source_id=p_id for update;
 if p.source_id is null or p.account_id is distinct from p_account or p.mode is distinct from p_mode or p_session is null
  or p_session!~'^cs_(test_|live_)?[A-Za-z0-9]+$' or (p.session_id is not null and p.session_id<>p_session) then
  raise exception using errcode='40001',message='Checkout mapping conflict';end if;
 update public.icsh_form_payments set session_id=p_session,updated_at=now() where source_kind=p_kind and source_id=p_id returning * into p;
 return to_jsonb(p);
end $$;

create function public.icsh_form_payment_record(p_kind text,p_id uuid,p_account text,p_mode text,p_session text,p_event text,p_event_type text,p_status text,p_amount integer,p_intent text default null,p_charge text default null,p_paid_at timestamptz default null,p_refunded integer default 0)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare source jsonb;p public.icsh_form_payments;prior public.icsh_form_payment_events;r jsonb;f public.icsh_forms;places integer;quantity integer;next_status text;
begin
 source:=public.icsh_form_payment_source(p_kind,p_id);
 select * into p from public.icsh_form_payments where source_kind=p_kind and source_id=p_id for update;
 if source is null or p.source_id is null or source->>'mode' is distinct from p_mode or p.account_id is distinct from p_account or p.mode is distinct from p_mode
  or p.amount is distinct from p_amount or p.amount is distinct from (source->>'amount')::integer or p.session_id is distinct from p_session
  or p_event is null or p_event!~'^evt_[A-Za-z0-9]+$'
  or p_event_type is null or p_event_type not in ('checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','charge.refunded','charge.dispute.created')
  or p_status is null or p_status not in ('pending','paid','failed','expired','partially_refunded','refunded','disputed')
  or p_refunded is null or p_refunded<0 or p_refunded>p.amount then raise exception using errcode='22023',message='Payment event mismatch';end if;
 if p_status in ('paid','partially_refunded','refunded','disputed') and (p_intent is null or p_charge is null or p_paid_at is null or p_paid_at>now()+interval '5 minutes' or p_paid_at<p.created_at-interval '5 minutes') then
  raise exception using errcode='22023',message='Verified payment evidence required';end if;
 if (p.payment_intent_id is not null and p_intent is not null and p.payment_intent_id<>p_intent) or (p.charge_id is not null and p_charge is not null and p.charge_id<>p_charge) then
  raise exception using errcode='40001',message='Payment evidence conflict';end if;
 select * into prior from public.icsh_form_payment_events where event_id=p_event;
 if prior.event_id is not null then
  if prior.source_id<>p_id or prior.source_kind<>p_kind or prior.account_id<>p_account or prior.mode<>p_mode then raise exception using errcode='40001',message='Payment replay conflict';end if;
  return to_jsonb(p);
 end if;
 insert into public.icsh_form_payment_events(event_id,source_kind,source_id,account_id,mode,event_type) values(p_event,p_kind,p_id,p_account,p_mode,p_event_type);
 update public.icsh_form_payments set payment_intent_id=coalesce(payment_intent_id,p_intent),charge_id=coalesce(charge_id,p_charge),paid_at=coalesce(paid_at,p_paid_at),
  refunded_amount=greatest(refunded_amount,p_refunded),status=case when status='disputed' or p_status='disputed' then 'disputed'
   when greatest(refunded_amount,p_refunded)=amount then 'refunded' when greatest(refunded_amount,p_refunded)>0 then 'partially_refunded'
   when status='paid' and p_status in ('pending','failed','expired') then 'paid' else p_status end,updated_at=now()
 where source_kind=p_kind and source_id=p_id returning * into p;
 if p_kind='event' then
  select answers->'record' into r from public.icsh_submissions where id=p_id;
  select * into f from public.icsh_forms where id=(source->>'formId')::uuid;
  next_status:=r->>'status';
  if p.status='paid' and next_status<>'cancelled' then
   select coalesce(sum(jsonb_array_length(answers->'record'->'attendees')),0)::integer into places from public.icsh_submissions
    where form_id=f.id and mode=p_mode and id<>p_id and coalesce(answers->'record'->>'status','') not in ('failed','cancelled');
   quantity:=jsonb_array_length(r->'attendees');
   if places+quantity<=(f.configuration->>'capacity')::integer and f.status='published' and (f.configuration->>'startsAt')::timestamptz>now() then next_status:='confirmed_paid';
   else next_status:='cancelled';r:=r||jsonb_build_object('paymentReview',true);end if;
  elsif p.status in ('expired','failed') and next_status in ('pending','failed') then next_status:='failed';
  elsif p.status='refunded' then next_status:='cancelled';end if;
  r:=r||jsonb_build_object('status',next_status,'paymentProvider','stripe','payment',jsonb_build_object('status',p.status,'verified',p.paid_at is not null,'amount',p.amount,'refundedAmount',p.refunded_amount,'paidAt',p.paid_at),'version',coalesce((r->>'version')::integer,0)+1,'updatedAt',now());
  update public.icsh_submissions set answers=jsonb_set(answers,'{record}',r) where id=p_id;
 end if;
 return to_jsonb(p);
end $$;
revoke execute on function public.icsh_donation_save(uuid,text,text,integer,text,text,text,text),public.icsh_form_payment_source(text,uuid),public.icsh_form_payment_prepare(text,uuid,text,text),public.icsh_form_payment_attach(text,uuid,text,text,text),public.icsh_form_payment_record(text,uuid,text,text,text,text,text,text,integer,text,text,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.icsh_donation_save(uuid,text,text,integer,text,text,text,text),public.icsh_form_payment_source(text,uuid),public.icsh_form_payment_prepare(text,uuid,text,text),public.icsh_form_payment_attach(text,uuid,text,text,text),public.icsh_form_payment_record(text,uuid,text,text,text,text,text,text,integer,text,text,timestamptz,integer) to service_role;
commit;
