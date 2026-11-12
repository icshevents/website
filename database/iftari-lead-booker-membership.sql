-- Lead-booker-only member ticket qualification; preserve stored bookings.
begin;
create or replace function public.icsh_iftari_reserve(p_id uuid,p_request_hash text,p_capability_hash text,p_contact jsonb,p_quantities jsonb,p_member_emails text[],p_donation integer,p_expected_version integer,p_expected_total integer,p_account text,p_mode text)
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


-- Apply the confirmed date and arrival time through the versioned settings writer.
select public.icsh_iftari_configure(configuration || '{"date":"2027-02-20","time":"16:45"}'::jsonb,(configuration->>'version')::integer)
from public.icsh_iftari_settings where slug='ramadan-iftari-2027';
commit;
