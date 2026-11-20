#!/usr/bin/env bash
# All data is fictional. Runs only in GitHub Actions' disposable PostgreSQL.
set -euo pipefail
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

psql -X -v ON_ERROR_STOP=1 <<'SQL'
insert into public.icsh_events(id,slug,source_type,form_ids)
values('30000000-0000-4000-8000-000000000001','synthetic-race','tickets',
       array['30000000-0000-4000-8000-000000000002'::uuid]);
insert into public.icsh_forms(id,slug,title,kind,status,configuration,mode)
values('30000000-0000-4000-8000-000000000002','synthetic-race-tickets',
       'Fictional last-use ticket form','tickets','published',
       '{"mode":"live","status":"published","capacity":10,"startsAt":"2028-12-20T13:00:00Z","version":1,"prototype":false}'::jsonb,'live');
update public.icsh_event_discounts
set code='LASTONE',name='Fictional Last Use',basis='fixed',value=300,
    categories='all',application='per_booking',maximum=1,active=true
where scope_kind='tickets' and scope_id='30000000-0000-4000-8000-000000000002';
SQL

cat > "$work/first.sql" <<'SQL'
begin;
insert into public.icsh_submissions(id,form_id,status,answers,mode)
values('30000000-0000-4000-8000-000000000003',
       '30000000-0000-4000-8000-000000000002','new',
       jsonb_build_object('record',jsonb_build_object(
         'mode','live','status','pending','currency','gbp','total',1500,
         'reference','EVT-RACE-A','eventTitle','Fictional Event',
         'eventStartsAt','2028-12-20T13:00:00Z','capabilityHash',repeat('a',64),
         'contact',jsonb_build_object('email','alice@example.org'),
         'attendees',jsonb_build_array(jsonb_build_object('unitAmount',1800,'ticket','member')),
         'booking',jsonb_build_object('promotion',jsonb_build_object(
           'code','LASTONE','grossPence',1800,'discountPence',300,'netPence',1500,
           'units',1,'paidMemberVerified',false,'customerHash',repeat('b',64)
         ))
       )),'live');
-- Keep the first transaction's row lock until the competing attempt starts.
select pg_sleep(3);
commit;
SQL

cat > "$work/second.sql" <<'SQL'
begin;
insert into public.icsh_submissions(id,form_id,status,answers,mode)
values('30000000-0000-4000-8000-000000000004',
       '30000000-0000-4000-8000-000000000002','new',
       jsonb_build_object('record',jsonb_build_object(
         'mode','live','status','pending','currency','gbp','total',1500,
         'reference','EVT-RACE-B','eventTitle','Fictional Event',
         'eventStartsAt','2028-12-20T13:00:00Z','capabilityHash',repeat('c',64),
         'contact',jsonb_build_object('email','bob@example.org'),
         'attendees',jsonb_build_array(jsonb_build_object('unitAmount',1800,'ticket','member')),
         'booking',jsonb_build_object('promotion',jsonb_build_object(
           'code','LASTONE','grossPence',1800,'discountPence',300,'netPence',1500,
           'units',1,'paidMemberVerified',false,'customerHash',repeat('d',64)
         ))
       )),'live');
commit;
SQL

psql -X -v ON_ERROR_STOP=1 -f "$work/first.sql" > "$work/first.log" 2>&1 &
first=$!
sleep 0.4
psql -X -v ON_ERROR_STOP=1 -f "$work/second.sql" > "$work/second.log" 2>&1 &
second=$!
set +e
wait "$first"
first_status=$?
wait "$second"
second_status=$?
set -e
if [ "$first_status" -ne 0 ] || [ "$second_status" -eq 0 ]; then
  echo 'Discount race assertion failed: expected only first booking to succeed.'
  cat "$work/first.log" "$work/second.log"
  exit 1
fi
if ! grep -q 'Discount use limit reached' "$work/second.log"; then
  echo 'The second booking failed for an unexpected reason.'
  cat "$work/second.log"
  exit 1
fi
count="$(psql -X -At -v ON_ERROR_STOP=1 -c "select count(*) from public.icsh_event_discount_redemptions where scope_id='30000000-0000-4000-8000-000000000002' and status='reserved'")"
if [ "$count" != '1' ]; then
  echo "Expected exactly one reservation; found $count"
  exit 1
fi
echo 'Two simultaneous bookings competed for the final Early Bird code: exactly one succeeded.'
