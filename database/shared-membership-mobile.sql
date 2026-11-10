-- Apply after the membership application setup/renewal migrations.
-- Shared contact numbers are allowed. Unique pending email, soft deletion,
-- completed application history, payment, activation and RLS rules are unchanged.
BEGIN;
DROP INDEX IF EXISTS public.icsh_membership_application_phone_unique;
COMMIT;
