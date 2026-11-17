# ICSH Events Hub — revised implementation

Status: approved by the user and deployed to https://icsh.org.uk on 17 November 2026. Source is saved on `feature/events-hub`.

## Two hubs

- Organiser Workspace (`/admin`): two clean cards, Admin Hub and ICSH Events Hub.
- Admin Hub (`/admin/membership`): membership administration and entries, confidential Rishta entries, general donation entries, and Events Hub access management. Existing Admin password is retained.
- Events Hub (`/admin/events`): event management, associated event forms/entries, planning and tasks. No membership, Rishta or general donation records are exposed.

## Named password accounts

Admin can add an Events Hub password, assign its first name, reset the password, and enable/disable access. No email address or separate Supabase Auth account is needed for Events users. Login takes only the assigned password. The name comes from the matching account, not a name typed at login.

Passwords use salted scrypt (N=131072, r=8, p=1) on the server. A server-keyed lookup identifies the account without testing every password. Neither password hashes nor lookup values are exposed to the browser. Sessions use independent 256-bit HttpOnly/Secure/SameSite cookies, hashed session tokens, eight-hour expiry, database allowlist/credential checks and persistent attempt limiting. Password/account changes revoke the affected Events sessions immediately. A name can be shared by two accounts; assignments refer to distinct UUIDs and the selector disambiguates duplicate names.

All Hub tables have RLS and no anonymous or ordinary authenticated grants. Scoped RPCs verify the correct portal session inside Postgres. The Admin access endpoints also verify the native administrator identity. Events users cannot use Admin RPCs or access administrative entry pages.

## Events and public visibility

- Active Events, Events in Planning, Completed Events and a calendar.
- Existing published ticket/festival/Iftari records retain their IDs and booking URLs. The Food Festival's participation and stall forms link to one event.
- Existing file-based events import as active, irrespective of their dates. Closed prototypes/test forms are excluded.
- Dates never automatically finish an event.
- Mark Finished or unpublish hides the event from the public Events page and its public event/form routes. Its internal tasks, forms and submissions remain available.
- Draft and published content are separate. Routine publication reads from Supabase and needs no website deployment after the initial release.
- Existing Stripe and Bigin checks remain in use. Prices apply to subsequent bookings, existing booked amounts are preserved, capacity cannot be reduced below occupied/reserved places, and no Stripe refund/account-management action is exposed.

## Individual event homepage

The homepage shows event information, an automatic Event Planning Progress paragraph and completion percentage, three quick actions (Edit Website Event Feature, Manage Event Forms, Manage Tasks), a compact task table, and associated forms/submissions.

Tasks have title, separate multi-paragraph description, multiple account-based assignees, a target date, Not Started/In Progress/Completed status, and appended progress updates with name and timestamp. Tasks expand for editing and show overdue/approaching dates. The deterministic progress paragraph updates on every task reload, uses recorded descriptions/updates and named responsibilities, and makes no AI calls or unsupported progress claims.

## Forms and entries

The builder supports text, name, email, mobile, dropdown, checkbox, multiple choice and multi-line fields, required/optional answers, ordering, preview, editing, publish and unpublish. It extends the existing `icsh_forms` kind constraint with `custom` and reuses `icsh_submissions`; there is no parallel submissions database.

Existing specialist ticket, festival and stall forms remain in their existing engines and routes. Booking/rate changes are managed in the event editor. Their availability and associated entries are managed in the Event Forms section. Additional event questionnaires/volunteer/participation forms use the builder and appear as links on the public event page when published. Custom forms collect information; paid tickets use the existing booking system.

Custom submissions are validated on the server and in Postgres, checked against a current form version and visible active parent, and saved idempotently. Their email confirmation is not enabled; existing email/payment workflows are untouched. Form entries are scoped to the selected event, paginated, searchable within a page, filterable by form and exportable as CSV. General entry review notes/status do not modify payment or membership records. Iftari entries are read-only.

## Database release files

1. `database/events-hub.sql`: schema, named credentials, sessions, event catalogue/planning/tasks, audit extension, scoped functions, custom form kind, public projections and insert guards. No existing submissions/payments are copied or deleted.
2. `database/events-hub-import.sql`: idempotent links to current real event records and the two existing file-based events. It preserves existing public teaser/booking status and does not infer completion from dates.
3. `database/events-hub-enforce-membership-sessions.sql`: apply only after the new application is ready, binding old membership organiser policies to the exact unexpired Admin portal session. Existing Admin users sign in again.

The only additional runtime flag needed is `ICSH_EVENTS_HUB_ENABLED=true` for catalogue activation. Existing Supabase, Stripe and Bigin secrets/settings remain unchanged. No Events user needs an Auth email, integration access or technical account. Admin sets the initial team passwords through the Admin Hub.

## Validation and review

- Next.js 16.4.6 production build and TypeScript pass.
- Full regression run: 509 tests, 507 passed, 0 failed, 2 existing tests skipped.
- Actual migration and functions are executed against isolated PostgreSQL using PGlite and local auth/storage fixtures. Tests cover role/token boundaries, expiry/revocation, scoped entries, private projections, concurrent edits, booking capacity/windows, preserved paid snapshots, Iftari settings, named accounts, duplicate names, task descriptions/notes/multiple assignees, custom form publication and idempotent submissions, finish/unpublish and retained records.
- Core tests verify UK DST/date handling, planning paragraphs, scrypt verification, unsafe URLs and CSV formula escaping.
- The existing Next.js security warning was fixed locally by patching 16.4.3 to 16.4.6; the production dependency audit returned zero known advisories. No live runtime has been updated.
- The original public assets were restored from the supplied archive for release packaging. All 30 hashes available in the current Vercel source listing match; no private images are added to GitHub.
- Desktop, tablet (768 px) and mobile (375 px) design previews were checked, including the event homepage, forms builder and Admin Hub. The checked mobile/tablet layouts have no horizontal page overflow.
- The development-only design preview contains example data and disables live actions. Real Admin login and end-to-end hosted storage/auth checks still need the approved deployment environment; no new live credentials were created for testing.

## Initial rollout and rollback

After explicit approval of this revised version: preserve the current production deployment as rollback, apply the main schema and import, verify counts/permissions, release the new source with the catalogue flag, verify the existing Admin login and both hubs, then apply final membership session enforcement. Admin creates the desired named Events passwords. Public visibility and read-only receipt paths must be verified without taking payments or sending messages.

Automatic Vercel deployment remains disabled for `main` and `feature/events-hub`. Any production release is explicit. Preserve all existing public assets when packaging; the public Git repository does not contain them.

Before rolling back to old source, restore the previous organiser policy expressions because old code cannot create the new Admin portal sessions. Preserve all new event/task/form/audit/submission records. Disabling the catalogue flag alone is not a complete content rollback for events created after activation.

## Production release — 17 November 2026

- Live deployment: `dpl_9LTy6Rn4yPjZs8ohrAHCyJgQZPcx`, application commit `b219d474cab8aa7333bdaaae6badda48409def33`.
- All three database release files applied in order. `ICSH_EVENTS_HUB_ENABLED=true` is enabled for production.
- Before/after counts: 6 forms, 13 submissions, 5 linked events. No existing records were copied or deleted; no named credentials were created.
- The production build with the feature enabled passes. Iftari is explicitly rendered at request time, avoiding a caught framework prerender bailout. The first failed build never replaced the previous production site.
- Browser checks verified both portal choices and password-only sign-in pages, upcoming-first public ordering, Winter Lunch pricing/booking link, closed Iftari prices/menu popup and original branding/assets. Older active events remain listed until explicitly finished/unpublished.
- HTTP checks: public Events, Winter Lunch details, Iftari and logo return 200; unsigned Events dashboard and Admin access API return 401 with private/no-store headers.
- Actual hosted SQL checks exercised dashboard, event detail, associated forms, booking overview and entries using an isolated transaction rolled back at the end. No test credential/session remains. Admin session enforcement and service-only RPC grants were verified.
- Existing Admin password remains unchanged. Admin must sign in again and add named Events passwords under Events Hub access. Signed-in browser workflows and poster uploads were not exercised with real team credentials.
- Source is saved on the feature branch. Automatic approval review rejected moving `main` because it regarded that ref update as outside the approved feature-branch upload; `main` remains unchanged. This does not affect the successful production deployment. No workaround was attempted.
