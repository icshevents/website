-- Additive payment ledger. Existing applications and Bigin records are preserved.
begin;
create table if not exists public.icsh_membership_payments (
  application_id uuid primary key references public.icsh_membership_applications(id),
  account_id text not null check (account_id ~ '^acct_[A-Za-z0-9]+$'),
  mode text not null check (mode in ('live','test')),
  amount integer not null check (amount in (100,1500,2000)),
  currency text not null default 'gbp' check (currency='gbp'),
  session_id text unique check (session_id ~ '^cs_(test_|live_)?[A-Za-z0-9]+$'),
  payment_intent_id text unique check (payment_intent_id ~ '^pi_[A-Za-z0-9]+$'),
  charge_id text check (charge_id ~ '^ch_[A-Za-z0-9]+$'),
  status text not null default 'pending' check (status in ('pending','paid','failed','expired','partially_refunded','refunded','disputed')),
  paid_at timestamptz,
  refunded_amount integer not null default 0 check (refunded_amount>=0 and refunded_amount<=amount),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('paid','partially_refunded','refunded','disputed') or (paid_at is not null and payment_intent_id is not null and charge_id is not null))
);
create table if not exists public.icsh_membership_payment_events (
  event_id text primary key check (event_id ~ '^evt_[A-Za-z0-9]+$'),
  application_id uuid not null references public.icsh_membership_payments(application_id),
  account_id text not null,
  mode text not null check (mode in ('live','test')),
  event_type text not null,
  created_at timestamptz not null default now()
);
create index if not exists icsh_membership_payment_event_application_idx on public.icsh_membership_payment_events(application_id);
alter table public.icsh_membership_payments enable row level security;
alter table public.icsh_membership_payment_events enable row level security;
revoke all on public.icsh_membership_payments,public.icsh_membership_payment_events from public,anon,authenticated,service_role;
grant select,insert,update on public.icsh_membership_payments to service_role;
grant select,insert on public.icsh_membership_payment_events to service_role;

-- Persist the intention before calling Stripe. Concurrent clicks share one row
-- and one Stripe idempotency key; an uncertain response never starts a new charge.
create or replace function public.icsh_membership_payment_prepare(p_application_id uuid,p_account_id text,p_mode text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.icsh_membership_applications; p public.icsh_membership_payments;
begin
 select * into a from public.icsh_membership_applications where id=p_application_id for update;
 if a.id is null or a.mode is distinct from p_mode or a.fee_pence not in (100,1500,2000)
   or a.currency<>'GBP' or a.payment_status<>'awaiting_payment'
   or not ((a.category='standard' and a.fee_pence=2000) or (a.category='pensioner' and a.fee_pence=1500)
     or (a.category='standard' and a.fee_pence=100 and coalesce(lower(btrim(a.answers->>'firstName')),'')='test' and coalesce(lower(btrim(a.answers->>'lastName')),'')='test')) then
   raise exception using errcode='22023',message='Invalid payment application';
 end if;
 insert into public.icsh_membership_payments(application_id,account_id,mode,amount)
 values(a.id,p_account_id,p_mode,a.fee_pence) on conflict(application_id) do nothing;
 select * into p from public.icsh_membership_payments where application_id=a.id;
 if p.account_id is distinct from p_account_id or p.mode is distinct from p_mode or p.amount<>a.fee_pence then
   raise exception using errcode='40001',message='Payment configuration changed';
 end if;
 return to_jsonb(p);
end $$;

create or replace function public.icsh_membership_payment_attach(p_application_id uuid,p_session_id text,p_account_id text,p_mode text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.icsh_membership_payments;
begin
 select * into p from public.icsh_membership_payments where application_id=p_application_id for update;
 if p.application_id is null or p.account_id is distinct from p_account_id or p.mode is distinct from p_mode
   or p_session_id is null or p_session_id !~ '^cs_(test_|live_)?[A-Za-z0-9]+$'
   or (p.session_id is not null and p.session_id<>p_session_id) then
   raise exception using errcode='40001',message='Checkout mapping conflict';
 end if;
 update public.icsh_membership_payments set session_id=p_session_id,updated_at=now() where application_id=p_application_id returning * into p;
 return to_jsonb(p);
end $$;

-- Only the server with a verified Stripe event may call this RPC. Transactional
-- deduplication and a row lock make delivery retries safe. No membership activation.
create or replace function public.icsh_membership_payment_record(
 p_application_id uuid,p_account_id text,p_mode text,p_session_id text,
 p_event_id text,p_event_type text,p_status text,p_amount integer,
 p_payment_intent_id text default null,p_charge_id text default null,p_paid_at timestamptz default null,p_refunded_amount integer default 0
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.icsh_membership_payments; prior public.icsh_membership_payment_events;
begin
 select * into p from public.icsh_membership_payments where application_id=p_application_id for update;
 if p.application_id is null or p.account_id is distinct from p_account_id or p.mode is distinct from p_mode
   or p.amount is distinct from p_amount or p_session_id is null
   or (p.session_id is not null and p.session_id<>p_session_id)
   or p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9]+$'
   or p_event_type not in ('checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','charge.refunded','charge.dispute.created')
   or p_status not in ('pending','paid','failed','expired','partially_refunded','refunded','disputed')
   or p_refunded_amount is null or p_refunded_amount<0 or p_refunded_amount>p.amount then
   raise exception using errcode='22023',message='Payment event mismatch';
 end if;
 if p_status in ('paid','partially_refunded','refunded','disputed') and
   (p_payment_intent_id is null or p_charge_id is null or p_paid_at is null or p_paid_at>now()+interval '5 minutes' or p_paid_at<p.created_at-interval '5 minutes') then
   raise exception using errcode='22023',message='Verified payment evidence required';
 end if;
 if (p.payment_intent_id is not null and p_payment_intent_id is not null and p.payment_intent_id<>p_payment_intent_id)
   or (p.charge_id is not null and p_charge_id is not null and p.charge_id<>p_charge_id) then
   raise exception using errcode='40001',message='Payment evidence conflict';
 end if;
 select * into prior from public.icsh_membership_payment_events where event_id=p_event_id;
 if prior.event_id is not null then
   if prior.application_id<>p_application_id or prior.account_id<>p_account_id or prior.mode<>p_mode then
     raise exception using errcode='40001',message='Payment event replay conflict';
   end if;
   return to_jsonb(p);
 end if;
 insert into public.icsh_membership_payment_events(event_id,application_id,account_id,mode,event_type)
 values(p_event_id,p_application_id,p_account_id,p_mode,p_event_type);
 -- An old failure cannot undo payment, nor can an old success undo a refund/dispute.
 update public.icsh_membership_payments set
  session_id=p_session_id,
  payment_intent_id=coalesce(payment_intent_id,p_payment_intent_id),
  charge_id=coalesce(charge_id,p_charge_id),paid_at=coalesce(paid_at,p_paid_at),
  refunded_amount=greatest(refunded_amount,p_refunded_amount),
  status=case
    when status='disputed' then 'disputed'
    when p_status='disputed' then 'disputed'
    when greatest(refunded_amount,p_refunded_amount)=amount then 'refunded'
    when greatest(refunded_amount,p_refunded_amount)>0 then 'partially_refunded'
    when status='paid' and p_status in ('pending','failed','expired') then 'paid'
    else p_status end,
  updated_at=now() where application_id=p_application_id returning * into p;
 return to_jsonb(p);
end $$;
revoke execute on function public.icsh_membership_payment_prepare(uuid,text,text),public.icsh_membership_payment_attach(uuid,text,text,text),public.icsh_membership_payment_record(uuid,text,text,text,text,text,text,integer,text,text,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.icsh_membership_payment_prepare(uuid,text,text),public.icsh_membership_payment_attach(uuid,text,text,text),public.icsh_membership_payment_record(uuid,text,text,text,text,text,text,integer,text,text,timestamptz,integer) to service_role;
commit;
