-- Run after the migration, in a transaction. All synthetic records and queued mail roll back.
savepoint organiser_notification_tests;
create temporary table icsh_membership_applications as select * from public.icsh_membership_applications with no data;
create temporary table icsh_rishta_profiles as select * from public.icsh_rishta_profiles with no data;
create temporary table icsh_donations as select * from public.icsh_donations with no data;
create temporary table icsh_submissions as select * from public.icsh_submissions with no data;
create temporary table icsh_iftari_bookings as select * from public.icsh_iftari_bookings with no data;
create trigger test_organiser after insert on pg_temp.icsh_membership_applications for each row execute function public.icsh_queue_organiser_notification();
create trigger test_organiser after insert on pg_temp.icsh_rishta_profiles for each row execute function public.icsh_queue_organiser_notification();
create trigger test_organiser after insert on pg_temp.icsh_donations for each row execute function public.icsh_queue_organiser_notification();
create trigger test_organiser after insert or update on pg_temp.icsh_submissions for each row execute function public.icsh_queue_organiser_notification();
create trigger test_organiser after insert or update on pg_temp.icsh_iftari_bookings for each row execute function public.icsh_queue_organiser_notification();
do $$
declare m uuid:=gen_random_uuid();r uuid:=gen_random_uuid();d uuid:=gen_random_uuid();e uuid:=gen_random_uuid();i uuid:=gen_random_uuid();t uuid:=gen_random_uuid();fid uuid;p jsonb;baseline bigint;
begin
 select count(*) into baseline from public.icsh_form_emails where kind='organiser_notification';
 insert into pg_temp.icsh_membership_applications(id,mode,test_data,reference,category,fee_pence,answers) values(m,'live',false,'MEM-ORG-SMOKE','Standard',2000,'{"firstName":"Synthetic","lastName":"Check","email":"fictional@example.invalid"}');
 insert into pg_temp.icsh_rishta_profiles(id,is_test,answers) values(r,false,'{"Name_first":"Synthetic","Name_last":"Check","SingleLine4":"fictional@example.invalid","Number":"30","Dropdown":"Female"}');
 insert into pg_temp.icsh_donations(id,mode,amount,first_name,email) values(d,'live',500,'Synthetic','fictional@example.invalid');
 select id into strict fid from public.icsh_forms where kind='tickets' and mode='live' limit 1;
 insert into pg_temp.icsh_submissions(id,form_id,mode,answers) values(e,fid,'live','{"record":{"mode":"live","status":"pending_payment","reference":"EVT-ORG-SMOKE","eventTitle":"Synthetic check","total":3900,"contact":{"name":"Synthetic Check","email":"fictional@example.invalid"},"attendees":[{"ticket":"member","unitAmount":2000,"name":"Synthetic One"},{"ticket":"nonmember","unitAmount":2200,"name":"Synthetic Two"},{"ticket":"child","unitAmount":800,"name":"Synthetic Child"}],"booking":{"discountPence":1100}}}');
 select organiser_payload into strict p from public.icsh_form_emails where source_id=e and kind='organiser_notification';
 if jsonb_array_length(p->'tickets')<>3 or (p->>'total')::int<>3900 or (p->>'discount')::int<>1100 then raise exception 'Ticket breakdown mismatch';end if;
 update pg_temp.icsh_submissions set answers=answers where id=e;
 if (select count(*) from public.icsh_form_emails where source_id=e)<>1 then raise exception 'Duplicate submission notice';end if;
 insert into pg_temp.icsh_submissions select t,form_id,submitted_at,status,jsonb_set(answers,'{record,testData}','true'),mode,request_key from pg_temp.icsh_submissions where id=e;
 if exists(select 1 from public.icsh_form_emails where source_id=t) then raise exception 'Test data queued';end if;
 insert into pg_temp.icsh_iftari_bookings(id,mode,reference,status,total,quote,contact,event_snapshot) values(i,'live','IFT-ORG-SMOKE','pending_payment',4400,'{"lines":[{"key":"member","label":"Adult ICSH member","quantity":2,"unitAmount":2400},{"key":"under5","label":"Under 5","quantity":1,"unitAmount":0}],"donation":100,"promotion":{"discountPence":500}}','{"firstName":"Synthetic","lastName":"Check","email":"fictional@example.invalid"}','{"title":"Synthetic iftari"}');
 update pg_temp.icsh_iftari_bookings set status='paid',paid_at=now(),charge_id='synthetic-rolled-back',needs_review=false,refunded_amount=0 where id=i;
 update pg_temp.icsh_iftari_bookings set status='paid' where id=i;
 if (select count(*) from public.icsh_form_emails where source_id=i)<>2 then raise exception 'Confirmation or idempotency failed';end if;
 select organiser_payload into strict p from public.icsh_form_emails where source_id=i and source_table like '%:confirmed';
 if (p->>'total')::int<>4400 or (p->>'donation')::int<>100 or (p->>'discount')::int<>500 or jsonb_array_length(p->'tickets')<>2 then raise exception 'Iftari breakdown mismatch';end if;
 if (select count(*) from public.icsh_form_emails where kind='organiser_notification')<>baseline+6 then raise exception 'Unexpected organiser queue count';end if;
end $$;
-- Confirmation paths use read-only links to existing live entries; no customer rows are changed.
create temporary table icsh_membership_activations as select * from public.icsh_membership_activations with no data;
create temporary table icsh_form_payments as select * from public.icsh_form_payments with no data;
create trigger test_organiser after insert or update on pg_temp.icsh_membership_activations for each row execute function public.icsh_queue_organiser_notification();
create trigger test_organiser after insert or update on pg_temp.icsh_form_payments for each row when(new.source_kind='donation') execute function public.icsh_queue_organiser_notification();
do $$
declare aid uuid;did uuid;value integer;baseline bigint;
begin
 select count(*) into baseline from public.icsh_form_emails where kind='organiser_notification';
 select id into strict aid from public.icsh_membership_applications where mode='live' and not test_data and deleted_at is null limit 1;
 insert into pg_temp.icsh_membership_activations(application_id,status,activated_at,contact_id,start_date,expiry_date) values(aid,'active',now(),'synthetic-read-only-link',current_date,current_date+365);
 update pg_temp.icsh_membership_activations set status='active';
 if not exists(select 1 from public.icsh_form_emails where source_id=aid and source_table='organiser:icsh_membership_applications:confirmed' and organiser_payload->>'stage'='confirmed') then raise exception 'Membership activation notice missing';end if;
 select id,amount into strict did,value from public.icsh_donations where mode='live' limit 1;
 insert into pg_temp.icsh_form_payments(source_kind,source_id,mode,status,paid_at,charge_id,refunded_amount,amount,currency) values('donation',did,'live','paid',now(),'synthetic-rolled-back',0,value,'gbp');
 update pg_temp.icsh_form_payments set status='paid';
 if not exists(select 1 from public.icsh_form_emails where source_id=did and source_table='organiser:icsh_donations:confirmed' and (organiser_payload->>'total')::int=value) then raise exception 'Donation receipt missing';end if;
 if (select count(*) from public.icsh_form_emails where kind='organiser_notification')<>baseline+2 then raise exception 'Duplicate confirmation notice';end if;
end $$;
rollback to savepoint organiser_notification_tests;
