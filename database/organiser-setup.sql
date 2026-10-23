-- Run once in the ICSH Events project as the database owner.
-- No membership database, passwords, public submissions or existing records are changed.
begin;

create table public.icsh_organisers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.icsh_organisers enable row level security;
revoke all on public.icsh_organisers from public, anon, authenticated;
grant select on public.icsh_organisers to authenticated;
create policy organiser_self_read on public.icsh_organisers
  for select to authenticated using (user_id = (select auth.uid()));

-- Only the database owner can approve/revoke organisers. Signed-in users cannot self-promote.
insert into public.icsh_organisers (user_id)
select id from auth.users
where id = '2bbd1741-0688-4722-b75e-f110b86f7ee8'::uuid and lower(email) = 'events@icsh.org.uk';

do $$ begin
  if not exists (select 1 from public.icsh_organisers) then
    raise exception 'The confirmed organiser account was not found. No changes were applied.';
  end if;
end $$;

create table public.icsh_forms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 160),
  title text not null check (length(title) between 1 and 220),
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  kind text not null check (kind in ('participation', 'stall', 'tickets')),
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  mode text not null default 'test' check (mode = 'test'),
  created_at timestamptz not null default now()
);
create table public.icsh_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.icsh_forms(id),
  submitted_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'reviewed', 'archived')),
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  mode text not null default 'test' check (mode = 'test')
);
create index icsh_submissions_form_time_idx on public.icsh_submissions (form_id, submitted_at desc);
create index icsh_submissions_time_idx on public.icsh_submissions (submitted_at desc);

alter table public.icsh_forms enable row level security;
alter table public.icsh_submissions enable row level security;
revoke all on public.icsh_forms, public.icsh_submissions from public, anon, authenticated;
grant select, insert, update on public.icsh_forms, public.icsh_submissions to authenticated;

create policy organisers_manage_forms on public.icsh_forms
  for all to authenticated
  using (exists (select 1 from public.icsh_organisers where user_id = (select auth.uid())))
  with check (exists (select 1 from public.icsh_organisers where user_id = (select auth.uid())));
create policy organisers_manage_submissions on public.icsh_submissions
  for all to authenticated
  using (exists (select 1 from public.icsh_organisers where user_id = (select auth.uid())))
  with check (exists (select 1 from public.icsh_organisers where user_id = (select auth.uid())));

commit;

-- Verification: expect three rows, all with row_security_enabled = true.
select tablename, rowsecurity as row_security_enabled from pg_tables
where schemaname = 'public' and tablename in ('icsh_organisers', 'icsh_forms', 'icsh_submissions');
