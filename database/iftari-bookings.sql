-- ICSH Iftari bookings within the existing website and Supabase project.
-- Server-only access. No public records, provider calls, or automatic publication.
begin;
create table public.icsh_iftari_settings (
 slug text primary key check(slug='ramadan-iftari-2027'),
 configuration jsonb not null check(jsonb_typeof(configuration)='object'),
 updated_at timestamptz not null default now()
);
insert into public.icsh_iftari_settings(slug,configuration) values ('ramadan-iftari-2027',
 '{"version":1,"title":"ICSH Ramadan Iftari 2027","venue":"The Clay Oven Restaurant, Wembley","date":"2027-02-20","time":"16:45","status":"draft","prices":{"member":2550,"nonmember":2800,"child":1300,"under5":null},"capacity":null,"maxGuests":12,"allowRepeatMemberDiscounts":false}');
create table public.icsh_iftari_bookings (
 id uuid primary key, event_slug text not null references public.icsh_iftari_settings(slug),
 request_hash text not null check(request_hash~'^[a-f0-9]{64}$'), capability_hash text not null check(capability_hash~'^[a-f0-9]{64}$'),
 reference text not null unique, contact jsonb not null, member_emails text[] not null,
 quantities jsonb not null, event_snapshot jsonb not null, quote jsonb not null,
 total integer not null check(total between 30 and 12000000), guests integer not null check(guests between 1 and 50),
 mode text not null check(mode in ('live','test')), account_id text not null check(account_id~'^acct_[A-Za-z0-9]+$'),
 status text not null default 'pending' check(status in ('pending','paid','expired','failed','refunded','partially_refunded','disputed')),
 session_id text unique check(session_id~'^cs_[A-Za-z0-9_]+$'),
 payment_intent_id text unique check(payment_intent_id~'^pi_[A-Za-z0-9]+$'),
 charge_id text check(charge_id~'^(ch|py)_[A-Za-z0-9]+$'), paid_at timestamptz,
 refunded_amount integer not null default 0 check(refunded_amount>=0 and refunded_amount<=total), needs_review boolean not null default false,
 checkout_expires bigint not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(status not in ('paid','refunded','partially_refunded','disputed') or (payment_intent_id is not null and charge_id is not null and paid_at is not null))
);
create index icsh_iftari_capacity_idx on public.icsh_iftari_bookings(event_slug,mode,status);
create index icsh_iftari_member_emails_idx on public.icsh_iftari_bookings using gin(member_emails);
create table public.icsh_iftari_payment_events (
 event_id text primary key check(event_id~'^evt_[A-Za-z0-9]+$'), booking_id uuid not null references public.icsh_iftari_bookings(id),
 event_type text not null, created_at timestamptz not null default now()
);
create index icsh_iftari_payment_booking_idx on public.icsh_iftari_payment_events(booking_id);
alter table public.icsh_iftari_settings enable row level security;
alter table public.icsh_iftari_bookings enable row level security;
alter table public.icsh_iftari_payment_events enable row level security;
revoke all on public.icsh_iftari_settings,public.icsh_iftari_bookings,public.icsh_iftari_payment_events from public,anon,authenticated,service_role;
grant select,insert,update on public.icsh_iftari_settings,public.icsh_iftari_bookings to service_role;
grant select,insert on public.icsh_iftari_payment_events to service_role;

-- Parent lock serialises capacity, discount claims and configuration edits.
create function public.icsh_iftari_reserve(p_id uuid,p_request_hash text,p_capability_hash text,p_contact jsonb,p_quantities jsonb,p_member_emails text[],p_donation integer,p_expected_version integer,p_expected_total integer,p_account text,p_mode text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c jsonb;b public.icsh_iftari_bookings;key text;label text;qty integer;unit integer;guests integer:=0;tickets integer:=0;lines jsonb:='[]';places integer;
begin
 select configuration into c from public.icsh_iftari_settings where slug='ramadan-iftari-2027' for update;
 select * into b from public.icsh_iftari_bookings where id=p_id for update;
 if b.id is not null then
  if b.request_hash is distinct from p_request_hash or b.capability_hash is distinct from p_capability_hash or b.account_id is distinct from p_account or b.mode is distinct from p_mode then raise exception using errcode='P2701',message='Booking request conflict';end if;
  return to_jsonb(b);
 end if;
 if c is null or c->>'status'<>'published' or (c->>'date' is not null and (c->>'date')::date<(now() at time zone 'Europe/London')::date) then raise exception using errcode='P2702',message='Bookings are not open';end if;
 if (c->>'version')::integer is distinct from p_expected_version then raise exception using errcode='P2703',message='Prices changed';end if;
 if p_contact is null or p_contact->>'email' is null or p_contact->>'email'!~'^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
  or p_contact->>'firstName' is null or length(p_contact->>'firstName') not between 1 and 80
  or p_contact->>'lastName' is null or length(p_contact->>'lastName') not between 1 and 80
  or p_contact->>'mobile' is null or p_contact->>'mobile'!~'^\+447[0-9]{9}$'
  or p_donation is null or p_donation not between 0 and 1000000 or p_member_emails is null or p_quantities is null or jsonb_typeof(p_quantities)<>'object' then raise exception using errcode='22023',message='Invalid booking';end if;
 foreach key in array array['member','nonmember','child','under5'] loop
  if p_quantities->>key is null or p_quantities->>key!~'^[0-9]{1,2}$' then raise exception using errcode='22023',message='Invalid quantity';end if;
  qty:=(p_quantities->>key)::integer;guests:=guests+qty;unit:=(c->'prices'->>key)::integer;
  if qty>0 then
   if unit is null then raise exception using errcode='P2704',message='Under-5 pricing unconfirmed';end if;
   tickets:=tickets+qty*unit;
   label:=case key when 'member' then 'Adult ICSH Members (12+)' when 'nonmember' then 'Adult Non-Members (12+)' when 'child' then 'Children aged 5–11' else 'Children under 5' end;
   lines:=lines||jsonb_build_array(jsonb_build_object('key',key,'label',label,'quantity',qty,'unitAmount',unit,'amount',qty*unit));
  end if;
 end loop;
 if guests not between 1 and (c->>'maxGuests')::integer or tickets+p_donation<30 or tickets+p_donation is distinct from p_expected_total
  or p_member_emails is distinct from (case when (p_quantities->>'member')::integer>0 then array[lower(btrim(p_contact->>'email'))] else array[]::text[] end)
  or cardinality(p_member_emails)<>(select count(distinct lower(btrim(e))) from unnest(p_member_emails) e)
  or exists(select 1 from unnest(p_member_emails) e where e is null or e<>lower(btrim(e)) or e!~'^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$') then raise exception using errcode='22023',message='Invalid quote or membership emails';end if;
 select coalesce(sum(existing.guests),0)::integer into places from public.icsh_iftari_bookings existing where event_slug='ramadan-iftari-2027' and mode=p_mode and status not in ('failed','expired','refunded');
 if c->>'capacity' is not null and places+guests>(c->>'capacity')::integer then raise exception using errcode='P2705',message='Insufficient places';end if;
 if not (c->>'allowRepeatMemberDiscounts')::boolean and exists(select 1 from public.icsh_iftari_bookings where event_slug='ramadan-iftari-2027' and mode=p_mode and status not in ('failed','expired') and member_emails&&p_member_emails) then raise exception using errcode='P2706',message='Member discount already reserved';end if;
 if p_donation>0 then lines:=lines||jsonb_build_array(jsonb_build_object('key','donation','label','Optional ICSH Donation','quantity',1,'unitAmount',p_donation,'amount',p_donation));end if;
 insert into public.icsh_iftari_bookings(id,event_slug,request_hash,capability_hash,reference,contact,member_emails,quantities,event_snapshot,quote,total,guests,mode,account_id,checkout_expires)
 values(p_id,'ramadan-iftari-2027',p_request_hash,p_capability_hash,'ICSH-IFT27-'||upper(replace(p_id::text,'-','')),p_contact,p_member_emails,p_quantities,c,
  jsonb_build_object('version',(c->>'version')::integer,'lines',lines,'tickets',tickets,'donation',p_donation,'total',tickets+p_donation,'guests',guests,'currency','GBP'),tickets+p_donation,guests,p_mode,p_account,floor(extract(epoch from now()+interval '24 hours'))::bigint) returning * into b;
 insert into public.icsh_audit_events(action,record_id) values('iftari.booking.reserved',p_id::text);
 return to_jsonb(b);
end $$;

create function public.icsh_iftari_attach(p_id uuid,p_session text,p_account text,p_mode text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare b public.icsh_iftari_bookings;
begin
 select * into b from public.icsh_iftari_bookings where id=p_id for update;
 if b.id is null or b.account_id is distinct from p_account or b.mode is distinct from p_mode or p_session is null or p_session!~'^cs_[A-Za-z0-9_]+$' or (b.session_id is not null and b.session_id<>p_session) then raise exception using errcode='40001',message='Checkout mapping conflict';end if;
 update public.icsh_iftari_bookings set session_id=p_session,updated_at=now() where id=p_id;return true;
end $$;

create function public.icsh_iftari_record(p_id uuid,p_session text,p_account text,p_mode text,p_event text,p_event_type text,p_status text,p_amount integer,p_intent text,p_charge text,p_paid_at timestamptz,p_refunded integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare b public.icsh_iftari_bookings;prior public.icsh_iftari_payment_events;next_status text;
begin
 perform 1 from public.icsh_iftari_settings where slug='ramadan-iftari-2027' for update;
 select * into b from public.icsh_iftari_bookings where id=p_id for update;
 if b.id is null or b.account_id is distinct from p_account or b.mode is distinct from p_mode or b.session_id is distinct from p_session or b.total is distinct from p_amount
  or p_event is null or p_event!~'^evt_[A-Za-z0-9]+$' or p_status is null or p_status not in ('pending','paid','failed','expired','refunded','partially_refunded','disputed')
  or p_event_type is null or p_event_type not in ('checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','charge.refunded','charge.dispute.created')
  or p_refunded is null or p_refunded<0 or p_refunded>b.total then raise exception using errcode='22023',message='Payment event mismatch';end if;
 if p_status in ('paid','refunded','partially_refunded','disputed') and (p_intent is null or p_charge is null or p_paid_at is null or p_paid_at>now()+interval '5 minutes' or p_paid_at<b.created_at-interval '5 minutes') then raise exception using errcode='22023',message='Payment evidence required';end if;
 if (b.payment_intent_id is not null and p_intent is not null and b.payment_intent_id<>p_intent) or (b.charge_id is not null and p_charge is not null and b.charge_id<>p_charge) then raise exception using errcode='40001',message='Payment evidence conflict';end if;
 select * into prior from public.icsh_iftari_payment_events where event_id=p_event;
 if prior.event_id is not null then
  if prior.booking_id<>p_id then raise exception using errcode='40001',message='Payment replay conflict';end if;return true;
 end if;
 insert into public.icsh_iftari_payment_events(event_id,booking_id,event_type) values(p_event,p_id,p_event_type);
 next_status:=case when b.status='disputed' or p_status='disputed' then 'disputed'
  when greatest(b.refunded_amount,p_refunded)=b.total then 'refunded' when greatest(b.refunded_amount,p_refunded)>0 then 'partially_refunded'
  when b.paid_at is not null and p_status in ('pending','failed','expired') then b.status
  when b.status in ('failed','expired') and p_status='pending' then b.status else p_status end;
 update public.icsh_iftari_bookings set status=next_status,payment_intent_id=coalesce(payment_intent_id,p_intent),charge_id=coalesce(charge_id,p_charge),paid_at=coalesce(paid_at,p_paid_at),refunded_amount=greatest(refunded_amount,p_refunded),
  needs_review=needs_review or (b.status in ('failed','expired') and next_status='paid'),updated_at=now() where id=p_id;
 insert into public.icsh_audit_events(action,record_id) values('iftari.payment.'||next_status,p_id::text);
 -- One confirmation, queued atomically with verified payment. Delayed methods wait for success.
 if next_status='paid' and b.status='pending' and b.mode='live' and exists(select 1 from public.icsh_form_email_settings where id and enabled) then
  insert into public.icsh_form_emails(source_table,source_id,kind,recipient,reference,event_title)
  values('icsh_iftari_bookings',b.id,'event',b.contact->>'email',b.reference,b.event_snapshot->>'title') on conflict(source_table,source_id) do nothing;
 end if;
 return true;
end $$;

create function public.icsh_iftari_configure(p_configuration jsonb,p_expected_version integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c jsonb;places integer;key text;unit integer;
begin
 select configuration into c from public.icsh_iftari_settings where slug='ramadan-iftari-2027' for update;
 if c is null or (c->>'version')::integer is distinct from p_expected_version then raise exception using errcode='P2703',message='Configuration changed';end if;
 if p_configuration is null or jsonb_typeof(p_configuration)<>'object' or p_configuration->>'status' is null or p_configuration->>'status' not in ('draft','published','closed')
  or length(coalesce(p_configuration->>'title','')) not between 1 and 140 or length(coalesce(p_configuration->>'venue','')) not between 1 and 240
  or p_configuration->>'maxGuests' is null or (p_configuration->>'maxGuests')::integer not between 1 and 50
  or jsonb_typeof(p_configuration->'allowRepeatMemberDiscounts') is distinct from 'boolean'
  or (p_configuration->>'capacity' is not null and (p_configuration->>'capacity')::integer not between 1 and 10000) then raise exception using errcode='22023',message='Invalid configuration';end if;
 foreach key in array array['member','nonmember','child','under5'] loop
  unit:=(p_configuration->'prices'->>key)::integer;
  if (key<>'under5' and unit is null) or unit<(case when key='under5' then 0 else 30 end) or unit>100000 then raise exception using errcode='22023',message='Invalid price';end if;
 end loop;
 select coalesce(max(n),0)::integer into places from (select sum(guests) n from public.icsh_iftari_bookings where status not in ('expired','failed','refunded') group by mode) s;
 if p_configuration->>'capacity' is not null and (p_configuration->>'capacity')::integer<places then raise exception using errcode='P2705',message='Capacity below reserved places';end if;
 c:=p_configuration||jsonb_build_object('version',p_expected_version+1);
 update public.icsh_iftari_settings set configuration=c,updated_at=now() where slug='ramadan-iftari-2027';
 insert into public.icsh_audit_events(action,record_id) values('iftari.configuration.updated','ramadan-iftari-2027');return c;
end $$;
revoke execute on function public.icsh_iftari_reserve(uuid,text,text,jsonb,jsonb,text[],integer,integer,integer,text,text),public.icsh_iftari_attach(uuid,text,text,text),public.icsh_iftari_record(uuid,text,text,text,text,text,text,integer,text,text,timestamptz,integer),public.icsh_iftari_configure(jsonb,integer) from public,anon,authenticated;
grant execute on function public.icsh_iftari_reserve(uuid,text,text,jsonb,jsonb,text[],integer,integer,integer,text,text),public.icsh_iftari_attach(uuid,text,text,text),public.icsh_iftari_record(uuid,text,text,text,text,text,text,integer,text,text,timestamptz,integer),public.icsh_iftari_configure(jsonb,integer) to service_role;
commit;
