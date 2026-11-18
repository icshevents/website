-- Queue one organiser notification per new live Harrow Food Festival stall application.
begin;

alter table public.icsh_form_emails drop constraint icsh_form_emails_kind_check;
alter table public.icsh_form_emails add constraint icsh_form_emails_kind_check check (
  kind in ('membership', 'membership_active', 'membership_free_active', 'membership_reminder',
           'donation', 'rishta', 'event', 'stall', 'stall_notification')
);

create function public.icsh_queue_stall_application_notification() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  application jsonb := new.answers->'record';
  application_reference text := application->>'reference';
  applicant_email text := lower(trim(application->'personal'->>'email'));
  form_title text;
begin
  if new.mode is distinct from 'live'
    or application->>'mode' is distinct from 'live'
    or application->>'testData' is distinct from 'false'
    or application->>'status' is distinct from 'pending_review'
    or application_reference is null
    or application_reference !~ '^STALL-[A-F0-9]{12}$'
    or applicant_email is null
    or applicant_email ~ '\.(invalid|test|example|localhost)$'
    or applicant_email ~ '@([^@]+\.)?example\.(com|org|net)$'
    or not exists (select 1 from public.icsh_form_email_settings where id and enabled)
  then
    return new;
  end if;

  select left(f.title, 200) into form_title
  from public.icsh_forms f
  where f.id = new.form_id and f.kind = 'stall'
    and f.slug = 'harrow-food-festival-2026-stall-hire';
  if not found then return new; end if;

  -- Use a separate queue namespace so the applicant acknowledgement keeps its own entry.
  insert into public.icsh_form_emails (source_table, source_id, kind, recipient, reference, event_title)
  values ('icsh_stall_notifications', new.id, 'stall_notification', 'events@icsh.org.uk', application_reference, form_title)
  on conflict (source_table, source_id) do nothing;
  return new;
end $$;

revoke execute on function public.icsh_queue_stall_application_notification() from public, anon, authenticated;
grant execute on function public.icsh_queue_stall_application_notification() to service_role;

create trigger icsh_stall_application_notification
after insert on public.icsh_submissions
for each row execute function public.icsh_queue_stall_application_notification();

commit;
