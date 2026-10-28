-- Dedicated private records. No anonymous or ordinary authenticated reads/writes.
create table if not exists public.icsh_rishta_profiles (
 id uuid primary key,
 created_at timestamptz not null default now(),
 request_hash text not null check (length(request_hash)=64),
 session_hash text not null check (length(session_hash)=64),
 answers jsonb not null check (jsonb_typeof(answers)='object'),
 terms_version text not null,
 photo_path text,
 is_test boolean not null default false
);
alter table public.icsh_rishta_profiles enable row level security;
revoke all on public.icsh_rishta_profiles from public,anon,authenticated;
grant select on public.icsh_rishta_profiles to authenticated;
grant all on public.icsh_rishta_profiles to service_role;
create policy rishta_organiser_read on public.icsh_rishta_profiles for select to authenticated
using (exists(select 1 from public.icsh_organisers where user_id=(select auth.uid())));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('icsh-rishta-private','icsh-rishta-private',false,3145728,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
-- No storage.objects policies are added: photos are served only by an organiser-checked server route.
