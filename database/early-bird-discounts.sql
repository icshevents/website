-- PROPOSED migration only. Do not apply to production before approval.
-- One per-form inactive placeholder, plus independently configurable codes.
-- Service role access only; the Events Hub uses its existing audited session token.
begin;
set local lock_timeout='5s';

create table public.icsh_event_discounts (
 id uuid primary key default gen_random_uuid(),
 scope_kind text not null check(scope_kind in ('tickets','iftari')),
 scope_id uuid not null,
 code text check(code is null or code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
 name text not null default 'Early Bird Offer' check(length(name) between 1 and 120),
 basis text not null default 'fixed' check(basis in ('fixed','percentage')),
 value integer not null default 0 check(value between 0 and 1000000),
 categories text not null default 'all' check(categories in ('adult','child','all')),
 application text not null default 'per_booking' check(application in ('per_ticket','per_booking')),
 redemption_basis text not null default 'booking' check(redemption_basis in ('booking','ticket')),
 maximum integer not null default 0 check(maximum between 0 and 1000000),
 per_customer_maximum integer check(per_customer_maximum between 1 and 1000000),
 starts_at timestamptz,
 expires_at timestamptz,
 paid_members_only boolean not null default false,
 active boolean not null default false,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(expires_at is null or starts_at is null or expires_at>starts_at),
 check(per_customer_maximum is null or per_customer_maximum<=maximum),
 check(not active or (code is not null and value>0 and maximum>0)),
 check(basis<>'percentage' or value<=100)
);
create unique index icsh_event_discount_code_unique on public.icsh_event_discounts(scope_kind,scope_id,upper(code)) where code is not null;
create unique index icsh_event_discount_one_placeholder on public.icsh_event_discounts(scope_kind,scope_id) where code is null;
create index icsh_event_discounts_lookup on public.icsh_event_discounts(scope_kind,scope_id,active);

create table public.icsh_event_discount_redemptions (
 id uuid primary key default gen_random_uuid(),
 discount_id uuid not null references public.icsh_event_discounts(id) on delete restrict,
 scope_kind text not null check(scope_kind in ('tickets','iftari')),
 scope_id uuid not null,
 booking_id uuid not null unique,
 customer_hash text not null check(customer_hash~'^[a-f0-9]{64}$'),
 units integer not null check(units between 1 and 100),
 gross_pence integer not null check(gross_pence>=0),
 discount_pence integer not null check(discount_pence>0 and discount_pence<=gross_pence),
 net_pence integer not null check(net_pence>=0 and net_pence=gross_pence-discount_pence),
 status text not null default 'reserved' check(status in ('reserved','redeemed','released')),
 reserved_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '30 hours',
 redeemed_at timestamptz,
 released_at timestamptz,
 check((status='redeemed')=(redeemed_at is not null))
);
create index icsh_event_discount_usage on public.icsh_event_discount_redemptions(discount_id,status);
create index icsh_event_discount_customer_usage on public.icsh_event_discount_redemptions(discount_id,customer_hash,status);

alter table public.icsh_event_discounts enable row level security;
alter table public.icsh_event_discount_redemptions enable row level security;
revoke all on public.icsh_event_discounts,public.icsh_event_discount_redemptions from public,anon,authenticated,service_role;
grant select,insert,update on public.icsh_event_discounts,public.icsh_event_discount_redemptions to service_role;

-- Automatic, inactive placeholder on EVERY ticket form, including duplicated
-- annual forms. The Iftari form is modelled by the linked event's UUID.
create function public.icsh_discount_ticket_placeholder()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.kind='tickets' then
  insert into public.icsh_event_discounts(scope_kind,scope_id)
  values('tickets',new.id) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger icsh_discount_ticket_placeholder_after_insert
after insert on public.icsh_forms for each row execute function public.icsh_discount_ticket_placeholder();

create function public.icsh_discount_iftari_placeholder()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.source_type='iftari' then
  insert into public.icsh_event_discounts(scope_kind,scope_id)
  values('iftari',new.id) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger icsh_discount_iftari_placeholder_after_insert
after insert or update of source_type on public.icsh_events for each row execute function public.icsh_discount_iftari_placeholder();

insert into public.icsh_event_discounts(scope_kind,scope_id)
select 'tickets',id from public.icsh_forms where kind='tickets' on conflict do nothing;
insert into public.icsh_event_discounts(scope_kind,scope_id)
select 'iftari',id from public.icsh_events where source_type='iftari' on conflict do nothing;

-- Verify both scope AND ownership through the existing Events Hub token.
-- This is not accessible to the browser roles; it is invoked by the server
-- through the same private session as existing form settings.
create function public.icsh_discount_hub_scope(p_token text,p_event uuid,p_form uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare e public.icsh_events; f public.icsh_forms;
begin
 perform public.icsh_hub_require(p_token);
 select * into e from public.icsh_events where id=p_event;
 if e.id is null then raise exception using errcode='42501',message='Event access denied';end if;
 if e.source_type='iftari' and e.id=p_form then return 'iftari';end if;
 if p_form=any(e.form_ids) then
  select * into f from public.icsh_forms where id=p_form;
  if f.kind='tickets' then return 'tickets';end if;
 end if;
 raise exception using errcode='42501',message='Ticket form access denied';
end $$;

create function public.icsh_discount_hub_list(p_token text,p_event uuid,p_form uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare kind text;
begin
 kind:=public.icsh_discount_hub_scope(p_token,p_event,p_form);
 return coalesce((
 select jsonb_agg(jsonb_build_object(
  'id',d.id,'scopeKind',d.scope_kind,'scopeId',d.scope_id,'code',d.code,
  'name',d.name,'basis',d.basis,'value',d.value,'categories',d.categories,
  'application',d.application,'redemptionBasis',d.redemption_basis,
  'maximum',d.maximum,'perCustomerMaximum',d.per_customer_maximum,
  'startsAt',d.starts_at,'expiresAt',d.expires_at,
  'paidMembersOnly',d.paid_members_only,'active',d.active,'version',d.version,
  'used',coalesce(stats.used,0),'reserved',coalesce(stats.reserved,0),
  'remaining',greatest(0,d.maximum-coalesce(stats.used,0)-coalesce(stats.reserved,0)),
  'totalDiscountPence',coalesce(stats.given,0)
 ) order by d.created_at,d.id)
 from public.icsh_event_discounts d
 left join lateral (
   select coalesce(sum(units) filter(where status='redeemed'),0)::integer used,
     coalesce(sum(units) filter(where status='reserved'),0)::integer reserved,
     coalesce(sum(discount_pence) filter(where status='redeemed'),0)::bigint given
   from public.icsh_event_discount_redemptions r where r.discount_id=d.id
 ) stats on true
 where d.scope_kind=kind and d.scope_id=p_form
 ),'[]'::jsonb);
end $$;

create function public.icsh_discount_hub_save(
 p_token text,p_event uuid,p_form uuid,p_discount jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare kind text;old public.icsh_event_discounts;c text;v integer;max_use integer;
used integer; scope uuid;
begin
 kind:=public.icsh_discount_hub_scope(p_token,p_event,p_form);
 if p_discount is null or jsonb_typeof(p_discount)<>'object'
   or length(p_discount::text)>5000 then raise exception using errcode='22023',message='Invalid offer settings';end if;
 c:=upper(nullif(btrim(p_discount->>'code'),''));
 if c is not null and c!~'^[A-Z0-9][A-Z0-9_-]{2,31}$' then raise exception using errcode='22023',message='Use 3–32 letters or numbers for the code';end if;
 if coalesce((p_discount->>'active')::boolean,false) and
    (c is null or coalesce((p_discount->>'value')::integer,0)<=0 or coalesce((p_discount->>'maximum')::integer,0)<=0)
 then raise exception using errcode='22023',message='Add a code, discount and redemption limit before activation';end if;
 if (p_discount->>'id') is not null then
   select * into old from public.icsh_event_discounts where id=(p_discount->>'id')::uuid and scope_kind=kind and scope_id=p_form for update;
   if old.id is null then raise exception using errcode='42501',message='Offer not linked to this form';end if;
   if old.version is distinct from (p_discount->>'version')::integer then raise exception using errcode='40001',message='Offer changed elsewhere';end if;
   select coalesce(sum(units),0)::integer into used from public.icsh_event_discount_redemptions
   where discount_id=old.id and status<>'released';
   if used>0 and (
      old.code is distinct from c
      or old.basis is distinct from p_discount->>'basis'
      or old.value is distinct from (p_discount->>'value')::integer
      or old.categories is distinct from p_discount->>'categories'
      or old.application is distinct from p_discount->>'application'
      or old.redemption_basis is distinct from p_discount->>'redemptionBasis'
      or old.paid_members_only is distinct from (p_discount->>'paidMembersOnly')::boolean
   ) then raise exception using errcode='22023',message='Deactivate this offer and create a new code to change the value or eligibility after booking activity';end if;
 else
   if c is null then raise exception using errcode='22023',message='Enter a code for an additional offer';end if;
 end if;
 if old.id is null then used:=0;end if;
 max_use:=(p_discount->>'maximum')::integer;
 if max_use is null or max_use<used or max_use>1000000 then raise exception using errcode='22023',message='Redemption limit cannot be lower than existing paid and reserved uses';end if;
 if (p_discount->>'id') is not null then
   update public.icsh_event_discounts set
    code=c,name=p_discount->>'name',basis=p_discount->>'basis',value=(p_discount->>'value')::integer,
    categories=p_discount->>'categories',application=p_discount->>'application',
    redemption_basis=p_discount->>'redemptionBasis',maximum=max_use,
    per_customer_maximum=(p_discount->>'perCustomerMaximum')::integer,
    starts_at=(p_discount->>'startsAt')::timestamptz,expires_at=(p_discount->>'expiresAt')::timestamptz,
    paid_members_only=(p_discount->>'paidMembersOnly')::boolean,
    active=(p_discount->>'active')::boolean,version=version+1,updated_at=now()
    where id=old.id;
 else
   insert into public.icsh_event_discounts(scope_kind,scope_id,code,name,basis,value,categories,application,redemption_basis,maximum,per_customer_maximum,starts_at,expires_at,paid_members_only,active)
   values(kind,p_form,c,p_discount->>'name',p_discount->>'basis',(p_discount->>'value')::integer,p_discount->>'categories',p_discount->>'application',p_discount->>'redemptionBasis',max_use,(p_discount->>'perCustomerMaximum')::integer,(p_discount->>'startsAt')::timestamptz,(p_discount->>'expiresAt')::timestamptz,(p_discount->>'paidMembersOnly')::boolean,(p_discount->>'active')::boolean);
 end if;
 perform public.icsh_hub_audit(p_token,p_event,'event.discount.updated',jsonb_build_object('form',p_form,'code',c,'active',(p_discount->>'active')::boolean));
 return public.icsh_discount_hub_list(p_token,p_event,p_form);
end $$;

revoke all on function public.icsh_discount_ticket_placeholder(),public.icsh_discount_iftari_placeholder(),
 public.icsh_discount_hub_scope(text,uuid,uuid),
 public.icsh_discount_hub_list(text,uuid,uuid),
 public.icsh_discount_hub_save(text,uuid,uuid,jsonb)
 from public,anon,authenticated;
grant execute on function public.icsh_discount_ticket_placeholder(),public.icsh_discount_iftari_placeholder(),
 public.icsh_discount_hub_scope(text,uuid,uuid),
 public.icsh_discount_hub_list(text,uuid,uuid),
 public.icsh_discount_hub_save(text,uuid,uuid,jsonb)
 to service_role;
commit;
