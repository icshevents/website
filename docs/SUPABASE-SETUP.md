# Supabase on the main ICSH website

The existing Vercel project is `ICSH / website`. The existing Supabase project is ICSH Events (`xxtsbuvwvrvtvmdxwcpx`, Ireland). No DNS or official-domain settings were changed.

## Connection and organiser access

Production has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and the protected, server-only `SUPABASE_SECRET_KEY`. Never put a secret/service-role key in a `NEXT_PUBLIC_` setting. Sensitive Vercel values cannot be downloaded for local development; a pulled `[SENSITIVE]` placeholder is not a usable key. Preview deployments require their own approved server setting; this release uses Production.

Supabase Auth owns the organiser password. The approved account is events@icsh.org.uk, identified by its confirmed Auth user ID in `database/organiser-setup.sql`. The old event app's shared password does not grant access. `/admin/sign-in` signs in; `/admin` opens the dashboard; `/admin/forms` opens the builder, participants, stalls and exports. Every protected page/API validates `auth.getUser()` and the database-owned `icsh_organisers` allowlist. The allowlist cannot be changed through the public API. Production auth cookies are secure and HTTP-only; proxy refresh covers admin pages and the event API. Sign-out ends the current local session.

## Approved migration completed 20 October 2026

The owner first ran the organiser setup. After separate explicit approval, the runtime SQL and private data import were executed in the Supabase SQL editor. Ten existing records and five form definitions were preserved: eight participation registrations, one stall application, one archived ticket registration; two public Harrow forms and three closed archived ticket forms. Imports preserve IDs, receipt capability hashes, configuration snapshots, review notes, history and request keys. `ON CONFLICT DO NOTHING` avoids overwriting an existing row. Private import data is under ignored `.local/`, never committed or deployed.

`database/event-forms-runtime.sql` adds atomic server-only writes, version checks, duplicate protection, closed-form/deadline/capacity checks, persistent request limits and audit history. RPC functions use SECURITY INVOKER and execute only as service_role. All five application tables have RLS; the new rate/audit tables grant no browser roles access. The website server validates each request and exposes only the necessary public form fields or capability-authorised receipt; admin data/exports require the verified allowlist account. No browser gets the server key.

Each form and submission is an individual database row. Organiser lists display the latest 500 matching records and explicitly explain this window if there are more; CSV exports fetch every matching row in batches. This avoids a single shared JSON file and conflicting whole-file writes. Large-volume search/reporting and configurable retention remain later work.

## Membership test applications — 22 October 2026

The reviewed `database/membership-applications.sql` setup was applied successfully to the existing project on **22 October 2026**. It adds `icsh_membership_applications` and server-only save, delivery-claim and delivery-completion functions, using the existing event runtime’s audit and request-limit support. This additive setup does not import, rewrite or activate existing members or event records.

Only explicit fictional test submissions with an `@example.invalid` email are accepted. The website server validates answers and calculates category/fee, then returns a reference only after saving. Each record has `mode=test`, `application_status=received`, `awaiting_payment` or `not_required`, null start/expiry dates and initial Bigin status `awaiting_authorisation`. RLS and grants deny browser roles direct table/RPC access. The existing protected `SUPABASE_SECRET_KEY` is used on the server; public receipts expose no answers, hashes or Bigin record IDs. Approved organisers review saved answers at `/admin/memberships`.

Website saving is independent of Bigin. Public submissions never call it. The separate organiser-controlled contact create/readback route keeps `ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED=false` until the narrow Contacts READ/CREATE and secure-search READ grant is authorised and configured. No UPDATE, WRITE or ALL scope is requested. Renewals and existing matches require review and cannot alter an existing member.

On **22 October 2026**, `tests/membership-applications-database.sql` passed against that schema with all fixtures rolled back. The advisory review added only informational notices for intentional server-only RLS without browser policies; no new warnings were reported. Deployment/browser verification of a website save and the authorised Bigin provider test remain outstanding. Database verification alone does not establish either result.

## Verification and launch limits

The earlier event release passed its 59 automated application checks. Database tests in `database/verify-event-runtime.sql` ran as service_role and rolled back all fixtures; duplicate, stale-version, capacity, closed-form and rate-limit checks passed. The final privilege check returned anonymous=false, signed-in=false, server=true for the write RPC.

The staged deployed website passed nine groups of HTTP checks covering its real Supabase connection, anonymous admin/export denial, disabled shared-password login, CSRF, server-calculated stall fee, private receipts, duplicate retries and payment prerequisites. A fictional volunteer was also submitted in the browser and its saved confirmation survived reload. These checks created two clearly labelled fictional records; the preserved ten plus these two gives twelve at verification time. They do not represent real assignments or charges. Do not rerun the hosted-write script casually: each run creates one fictional stall record.

The owner's authenticated Supabase organiser session was verified on the released main website: the dashboard returned two published forms and twelve saved submissions; participants showed nine rows, stalls showed two rows, the participant CSV download completed, and stall settings exposed the expected editable fields. A new password entry and sign-out were not exercised, so the owner's working session was preserved. The downloaded CSV was not opened because macOS denied Downloads-folder access. Supabase Security Advisor showed zero errors and one existing warning: Leaked Password Protection Disabled. No password-protection setting was changed.

Zoho Bigin remains the sole active/inactive membership authority; live event lookup is disconnected. Its verified metadata connection does not grant contact creation. Saved website membership test applications are pending only, with organiser-controlled Bigin delivery gated as described above. Stripe and email delivery remain disabled; event payments are simulated and emails preview only. An approved launch must review test records, consent/privacy/retention, real provider configuration, rates and operational monitoring before accepting real applicants/payments.

## Previous application retirement

The main website no longer reads the old event app or Blob store. A private backup and manifest were kept before migration. Old receipt capability hashes were preserved, but old-domain URLs will cease working when its Vercel project is deleted; new website receipt paths need the private capability from the original link. Do not publish those links. Vercel's connected deletion tool requires the owner to review and confirm deletion in Vercel. Keep the backup; do not delete the old Blob store as part of project retirement.
