begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table public.icsh_membership_payments drop constraint icsh_membership_payments_charge_id_check;
alter table public.icsh_membership_payments add constraint icsh_membership_payments_charge_id_check check(charge_id ~ '^(ch|py)_[A-Za-z0-9]+$');
alter table public.icsh_form_payments drop constraint icsh_form_payments_charge_id_check;
alter table public.icsh_form_payments add constraint icsh_form_payments_charge_id_check check(charge_id ~ '^(ch|py)_[A-Za-z0-9]+$');
commit;
