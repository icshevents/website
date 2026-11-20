-- Synthetic isolated PostgreSQL fixture for Early Bird migrations.
-- All UUIDs and people are fictitious. No production data or credentials.
create role service_role;
create role anon;
create role authenticated;
create table public.icsh_forms(
 id uuid primary key,slug text not null,title text not null,kind text not null,
 status text not null,configuration jsonb not null,mode text not null default 'live',
 created_at timestamptz not null default now()
);
create table public.icsh_events(
 id uuid primary key,slug text not null default 'fake-event',
 source_type text not null,source_key text,form_ids uuid[] not null default '{}',
 draft jsonb not null default '{}'::jsonb,archived boolean not null default false,
 version integer not null default 1,updated_at timestamptz not null default now()
);
create table public.icsh_submissions(
 id uuid primary key,form_id uuid not null references public.icsh_forms(id),
 submitted_at timestamptz not null default now(),status text not null default 'new',
 answers jsonb not null,mode text not null default 'live',request_key text
);
create table public.icsh_donations(
 id uuid primary key,mode text,amount integer,email text,capability_hash text
);
create table public.icsh_form_payments(
 source_kind text not null,source_id uuid not null,account_id text,
 mode text,amount integer,currency text not null default 'gbp',
 reference text,description text,session_id text,status text not null default 'pending',
 created_at timestamptz not null default now(),
 primary key(source_kind,source_id)
);
create table public.icsh_form_email_settings(id boolean,enabled boolean);
create table public.icsh_ticket_confirmation_emails(
 id uuid primary key default gen_random_uuid(),submission_id uuid unique not null,
 payload jsonb
);
create table public.icsh_audit_events(
 action text,record_id text,occurred_at timestamptz not null default now()
);
create table public.icsh_iftari_settings(slug text primary key,configuration jsonb not null);
create table public.icsh_iftari_bookings(
 id uuid primary key,event_slug text,request_hash text,capability_hash text,
 reference text,contact jsonb not null default '{}',member_emails text[] not null default '{}',
 quantities jsonb not null default '{}',event_snapshot jsonb not null default '{}',
 quote jsonb not null default '{}',total integer not null,guests integer not null default 0,
 mode text not null default 'live',account_id text,checkout_expires bigint not null default 0,
 session_id text,status text not null default 'pending',needs_review boolean not null default false,
 paid_at timestamptz,refunded_amount integer not null default 0,
 payment_intent_id text,charge_id text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create or replace function public.icsh_hub_require(p_token text)
returns boolean language plpgsql as $$
begin
 if p_token<>'STAGING_TEST_ONLY' then raise exception using errcode='42501',message='Synthetic access denied';end if;
 return true;
end $$;
create or replace function public.icsh_hub_audit(p_token text,p_event uuid,p_action text,p_changes jsonb)
returns void language plpgsql as $$
begin
 perform public.icsh_hub_require(p_token);
 insert into public.icsh_audit_events(action,record_id) values(p_action,p_event::text);
end $$;
create or replace function public.icsh_form_capacity(p_form uuid)
returns jsonb language sql as $$ select '{"maximum":20,"used":0,"remaining":20,"limitReached":false}'::jsonb $$;
-- Only this fixture's baseline reserve function is a mock: the added
-- discount procedure is the real production-candidate migration under test.
create or replace function public.icsh_iftari_reserve(
 p_id uuid,p_request_hash text,p_capability_hash text,p_contact jsonb,
 p_quantities jsonb,p_member_emails text[],p_donation integer,
 p_expected_version integer,p_expected_total integer,p_account text,p_mode text
) returns jsonb language plpgsql as $$
declare b public.icsh_iftari_bookings;c jsonb;key text;qty integer;unit integer;total integer:=0;guests integer:=0;lines jsonb:='[]';label text;
begin
 select * into b from public.icsh_iftari_bookings where id=p_id;
 if b.id is not null then return to_jsonb(b);end if;
 select configuration into c from public.icsh_iftari_settings where slug='ramadan-iftari-2027' for update;
 if c is null or (c->>'version')::integer<>p_expected_version or c->>'status'<>'published' then raise exception 'Synthetic Iftari form closed';end if;
 foreach key in array array['member','nonmember','child','under5'] loop
  qty:=(p_quantities->>key)::integer;unit:=(c->'prices'->>key)::integer;
  if qty is null or qty<0 or unit is null then raise exception 'Bad quantities';end if;
  guests:=guests+qty;total:=total+qty*unit;
  if qty>0 then
    label:=case key when 'member' then 'Members' when 'nonmember' then 'Non-members' when 'child' then 'Children' else 'Under 5' end;
    lines:=lines||jsonb_build_array(jsonb_build_object('key',key,'label',label,'quantity',qty,'unitAmount',unit,'amount',qty*unit));
  end if;
 end loop;
 if total+p_donation<>p_expected_total then raise exception 'Baseline gross total mismatch';end if;
 if p_donation>0 then lines:=lines||jsonb_build_array(jsonb_build_object('key','donation','label','Donation','quantity',1,'unitAmount',p_donation,'amount',p_donation));end if;
 insert into public.icsh_iftari_bookings(id,event_slug,request_hash,capability_hash,reference,contact,member_emails,quantities,event_snapshot,quote,total,guests,mode,account_id,checkout_expires)
 values(p_id,'ramadan-iftari-2027',p_request_hash,p_capability_hash,'TEST-IFT',p_contact,p_member_emails,p_quantities,c,
 jsonb_build_object('version',p_expected_version,'lines',lines,'tickets',total,'donation',p_donation,'total',total+p_donation,'guests',guests,'currency','GBP'),
 total+p_donation,guests,p_mode,p_account,floor(extract(epoch from now()+interval '24 hours'))::bigint) returning * into b;
 return to_jsonb(b);
end $$;
