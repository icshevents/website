-- Future submissions and confirmation updates only. No historical backfill.
begin;
set local lock_timeout='5s';
alter table public.icsh_form_emails add column organiser_payload jsonb;
alter table public.icsh_form_emails drop constraint icsh_form_emails_kind_check;
alter table public.icsh_form_emails add constraint icsh_form_emails_kind_check check(kind in
 ('membership','membership_active','membership_free_active','membership_reminder','donation','rishta','event','stall','stall_notification','organiser_notification'));
alter table public.icsh_form_emails add constraint icsh_organiser_email_recipient check
 (kind<>'organiser_notification' or (recipient='events@icsh.org.uk' and organiser_payload is not null and jsonb_typeof(organiser_payload)='object'));

create function public.icsh_queue_organiser_notification() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
 a public.icsh_membership_applications; d public.icsh_donations; f public.icsh_forms;
 r jsonb; v jsonb; detail jsonb:='{}'; tickets jsonb:='[]'; extra jsonb; q jsonb;
 kind text; stage text:='submitted'; ref text; title text; state text;
 source text:=tg_table_name; source_id uuid; amount integer; discount integer:=0; donation integer:=0;
begin
 if not exists(select 1 from public.icsh_form_email_settings where id and enabled) then return new;end if;
 if tg_table_name in ('icsh_membership_applications','icsh_membership_activations') then
  if tg_table_name='icsh_membership_applications' then a:=new;
  else
   if new.status is distinct from 'active' or new.activated_at is null or new.contact_id is null then return new;end if;
   if tg_op='UPDATE' and old.status='active' then return new;end if;
   select * into a from public.icsh_membership_applications where id=new.application_id;
   stage:='confirmed';
  end if;
  if a.id is null or a.mode is distinct from 'live' or a.test_data or a.deleted_at is not null then return new;end if;
  source:='icsh_membership_applications';source_id:=a.id;kind:='membership';ref:=replace(a.reference,'TEST-MEM-','MEM-');
  title:=case when a.answers->>'kind'='renewal' then 'Membership renewal' else 'New membership' end;
  state:=case when stage='confirmed' then 'Membership active' else 'Application received; activation not yet confirmed' end;
  amount:=a.fee_pence;
  detail:=jsonb_build_object('Name',concat_ws(' ',a.answers->>'firstName',a.answers->>'lastName'),'Email',a.answers->>'email','Phone',a.answers->>'mobile','Membership category',a.category);
  if stage='confirmed' then
   detail:=detail||jsonb_build_object('Start date',to_char(new.start_date,'DD/MM/YYYY'),'Expiry date',to_char(new.expiry_date,'DD/MM/YYYY'));
  end if;
 elsif tg_table_name='icsh_rishta_profiles' then
  if new.is_test then return new;end if;
  source_id:=new.id;kind:='rishta';title:='Rishta service';ref:='RIS-'||upper(replace(new.id::text,'-',''));state:='Received for review';
  detail:=jsonb_build_object('Name',concat_ws(' ',new.answers->>'Name_first',new.answers->>'Name_last'),'Email',new.answers->>'SingleLine4','Age',new.answers->>'Number','Gender',new.answers->>'Dropdown');
 elsif tg_table_name in ('icsh_donations','icsh_form_payments') then
  if tg_table_name='icsh_donations' then d:=new;
  else
   if new.mode is distinct from 'live' or new.status is distinct from 'paid' or new.paid_at is null or new.charge_id is null or new.refunded_amount<>0 then return new;end if;
   if tg_op='UPDATE' and old.status='paid' then return new;end if;
   select * into d from public.icsh_donations where id=new.source_id;stage:='confirmed';
   if d.amount<>new.amount or new.currency<>'gbp' then return new;end if;
  end if;
  if d.id is null or d.mode is distinct from 'live' then return new;end if;
  source:='icsh_donations';source_id:=d.id;kind:='donation';title:='Website donation';ref:='DON-'||upper(replace(d.id::text,'-',''));amount:=d.amount;
  state:=case when stage='confirmed' then 'Payment received' else 'Donation submitted; payment not yet confirmed' end;
  detail:=jsonb_build_object('Name',nullif(concat_ws(' ',d.first_name,d.last_name),''),'Email',nullif(d.email,''));
 elsif tg_table_name='icsh_submissions' then
  if new.mode is distinct from 'live' then return new;end if;
  r:=new.answers->'record';
  if r is null or r->>'mode' is distinct from 'live' or r->>'testData'='true' or r->'booking'->>'prototype'='true' then return new;end if;
  select * into f from public.icsh_forms where id=new.form_id;
  if f.kind not in ('tickets','participation','stall','custom') or f.slug='system-verification' or f.configuration->>'prototype'='true' then return new;end if;
  source_id:=new.id;kind:=case when f.kind='tickets' then 'event' else f.kind end;title:=coalesce(r->>'eventTitle',f.title);ref:=coalesce(r->>'reference','FORM-'||upper(replace(new.id::text,'-','')));
  state:=coalesce(r->>'status','Received');
  if tg_op='UPDATE' then
   if f.kind<>'tickets' or r->>'status' is distinct from 'confirmed_paid' or old.answers->'record'->>'status'='confirmed_paid' or coalesce((r->>'paymentReview')::boolean,false) then return new;end if;
   if not exists(select 1 from public.icsh_form_payments p where p.source_kind='event' and p.source_id=new.id and p.mode='live' and p.status='paid' and p.paid_at is not null and p.charge_id is not null and p.currency='gbp' and p.refunded_amount=0 and p.amount=(r->>'total')::integer) then return new;end if;
   stage:='confirmed';state:='Payment received';
  elsif f.kind='tickets' and r->>'status'='confirmed_free' then stage:='confirmed';state:='Complimentary booking confirmed';
  end if;
  v:=coalesce(r->'contact',r->'personal','{}');
  detail:=jsonb_build_object('Name',coalesce(v->>'name',nullif(concat_ws(' ',v->>'firstName',v->>'lastName'),'')),'Email',v->>'email','Phone',coalesce(v->>'phone',v->>'mobile'),'Venue',f.configuration->>'venue');
  -- Only labelled form answers, never private receipt capabilities, hashes or staff notes.
  select coalesce(jsonb_object_agg(left(x->>'label',240),left(r->'answers'->>(x->>'id'),5000)),'{}') into extra from jsonb_array_elements(coalesce(r->'questionSnapshot','[]')) x where x->>'label' is not null and r->'answers'->>(x->>'id') is not null;
  detail:=extra||detail;
  if f.kind='tickets' then
   select coalesce(jsonb_agg(jsonb_build_object('category',category,'quantity',quantity,'unitAmount',unit_amount)),'[]') into tickets from (
    select case item->>'ticket' when 'member' then 'Adult ICSH member' when 'nonmember' then 'Adult non-member' when 'child' then 'Child' when 'pensioner' then 'Pensioner' when 'student' then 'Student' when 'under5' then 'Under 5' else left(coalesce(item->>'ticket','Ticket'),200) end as category,
     (item->>'unitAmount')::integer as unit_amount,count(*) as quantity
    from jsonb_array_elements(r->'attendees') item group by 1,2 order by 1,2) grouped;
   amount:=(r->>'total')::integer;discount:=coalesce((r->'booking'->>'discountPence')::integer,0);
   detail:=detail||jsonb_build_object('Attendees',(select left(string_agg(coalesce(x->>'name',concat_ws(' ',x->>'firstName',x->>'lastName')),', '),5000) from jsonb_array_elements(r->'attendees') x));
  end if;
 elsif tg_table_name='icsh_iftari_bookings' then
  if new.mode is distinct from 'live' then return new;end if;
  source_id:=new.id;kind:='event';ref:=new.reference;title:=new.event_snapshot->>'title';state:='Booking submitted; payment not yet confirmed';
  if tg_op='UPDATE' then
   if new.status is distinct from 'paid' or old.status='paid' or new.needs_review or new.paid_at is null or new.charge_id is null or new.refunded_amount<>0 then return new;end if;
   stage:='confirmed';state:='Payment received';
  end if;
  amount:=new.total;donation:=coalesce((new.quote->>'donation')::integer,0);discount:=coalesce((new.quote->'promotion'->>'discountPence')::integer,0);
  select coalesce(jsonb_agg(jsonb_build_object('category',x->>'label','quantity',(x->>'quantity')::integer,'unitAmount',(x->>'unitAmount')::integer)),'[]') into tickets from jsonb_array_elements(new.quote->'lines') x where x->>'key'<>'donation';
  detail:=jsonb_build_object('Name',coalesce(new.contact->>'name',nullif(concat_ws(' ',new.contact->>'firstName',new.contact->>'lastName'),'')),'Email',new.contact->>'email','Phone',coalesce(new.contact->>'mobile',new.contact->>'phone'),'Venue',new.event_snapshot->>'venue','Notes',new.contact->>'notes','Attendees',(select left(string_agg(concat_ws(' ',x->>'firstName',x->>'lastName'),', '),5000) from jsonb_array_elements(coalesce(new.contact->'attendees','[]')) x));
 else return new;
 end if;
 if source_id is null then return new;end if;
 insert into public.icsh_form_emails(source_table,source_id,kind,recipient,reference,event_title,organiser_payload)
 values('organiser:'||source||':'||stage,source_id,'organiser_notification','events@icsh.org.uk',ref,left(coalesce(title,''),200),
 jsonb_build_object('type',kind,'stage',stage,'reference',ref,'title',coalesce(title,''),'status',state,'details',detail,'tickets',tickets,'total',amount,'discount',discount,'donation',donation))
 on conflict(source_table,source_id) do nothing;
 return new;
end $$;
revoke all on function public.icsh_queue_organiser_notification() from public,anon,authenticated;
grant execute on function public.icsh_queue_organiser_notification() to service_role;
create trigger icsh_organiser_membership after insert on public.icsh_membership_applications for each row execute function public.icsh_queue_organiser_notification();
create trigger icsh_organiser_membership_active after insert or update on public.icsh_membership_activations for each row execute function public.icsh_queue_organiser_notification();
create trigger icsh_organiser_rishta after insert on public.icsh_rishta_profiles for each row execute function public.icsh_queue_organiser_notification();
create trigger icsh_organiser_donation after insert on public.icsh_donations for each row execute function public.icsh_queue_organiser_notification();
create trigger icsh_organiser_donation_paid after insert or update on public.icsh_form_payments for each row when (new.source_kind='donation') execute function public.icsh_queue_organiser_notification();
create trigger icsh_organiser_submission after insert or update of answers on public.icsh_submissions for each row execute function public.icsh_queue_organiser_notification();
create trigger icsh_organiser_iftari after insert or update on public.icsh_iftari_bookings for each row execute function public.icsh_queue_organiser_notification();
-- The comprehensive stall notice replaces the old summary-only organiser notice.
drop trigger icsh_stall_application_notification on public.icsh_submissions;
commit;
