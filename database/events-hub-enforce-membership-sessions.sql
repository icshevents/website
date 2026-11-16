-- Apply only after the new application release is ready. Existing users must sign in again.
begin;
-- Enforce expiry for the existing authenticated membership access as well as server routes.
create function public.icsh_membership_portal_active() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.icsh_portal_sessions s join public.icsh_portal_access a on a.user_id=s.user_id and a.portal=s.portal
 where s.user_id=(select auth.uid()) and s.portal='membership' and s.auth_session_id=((select auth.jwt())->>'session_id')::uuid and s.expires_at>now() and s.revoked_at is null)
$$;
revoke all on function public.icsh_membership_portal_active() from public,anon;grant execute on function public.icsh_membership_portal_active() to authenticated;
alter policy organisers_manage_forms on public.icsh_forms using (exists(select 1 from public.icsh_organisers where user_id=(select auth.uid())) and public.icsh_membership_portal_active()) with check (exists(select 1 from public.icsh_organisers where user_id=(select auth.uid())) and public.icsh_membership_portal_active());
alter policy organisers_manage_submissions on public.icsh_submissions using (exists(select 1 from public.icsh_organisers where user_id=(select auth.uid())) and public.icsh_membership_portal_active()) with check (exists(select 1 from public.icsh_organisers where user_id=(select auth.uid())) and public.icsh_membership_portal_active());


commit;
