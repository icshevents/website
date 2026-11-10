-- Add the owner-requested Test Test GBP 1 live payment rate.
-- Normal membership rates and existing payment records are preserved.
begin;
set local lock_timeout='5s';
alter table public.icsh_membership_payments drop constraint icsh_membership_payments_amount_check;
alter table public.icsh_membership_payments add constraint icsh_membership_payments_amount_check check(amount in (100,1500,2000));
create or replace function public.icsh_membership_payment_prepare(p_application_id uuid,p_account_id text,p_mode text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.icsh_membership_applications; p public.icsh_membership_payments;
begin
 select * into a from public.icsh_membership_applications where id=p_application_id for update;
 if a.id is null or a.mode is distinct from p_mode or a.fee_pence not in (100,1500,2000)
   or a.currency<>'GBP' or a.payment_status<>'awaiting_payment'
   or not ((a.category='standard' and a.fee_pence=2000) or (a.category='pensioner' and a.fee_pence=1500)
     or (a.category='standard' and a.fee_pence=100 and coalesce(lower(btrim(a.answers->>'firstName')),'')='test' and coalesce(lower(btrim(a.answers->>'lastName')),'')='test')) then
   raise exception using errcode='22023',message='Invalid payment application';
 end if;
 insert into public.icsh_membership_payments(application_id,account_id,mode,amount)
 values(a.id,p_account_id,p_mode,a.fee_pence) on conflict(application_id) do nothing;
 select * into p from public.icsh_membership_payments where application_id=a.id;
 if p.account_id is distinct from p_account_id or p.mode is distinct from p_mode or p.amount<>a.fee_pence then
   raise exception using errcode='40001',message='Payment configuration changed';
 end if;
 return to_jsonb(p);
end $$;

commit;
