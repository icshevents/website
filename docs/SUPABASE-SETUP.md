# Main website: Supabase organiser access

This is the `website` Vercel project in the ICSH team. Its separate `icsh-event-forms` project remains online only while existing forms, private receipt links and records await migration. Do not delete that project or its private Blob store before the migration is verified.

## Connection settings

The main website uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Passwords, service-role keys, secret keys and CRM credentials must never be stored in a public variable. The existing Supabase project is `xxtsbuvwvrvtvmdxwcpx` (ICSH Events). Supabase Auth manages the organiser's password. No shared password from the previous event application is imported.

## Database setup awaiting activation

`database/organiser-setup.sql` creates the three new, empty tables and enables RLS inside one transaction. It approves only the confirmed Supabase user ID belonging to events@icsh.org.uk. Run it once as the database owner after review. All three table names must be unused. The final query must show all three tables with RLS enabled.

The `icsh_organisers` allowlist is readable only by its own signed-in user and is not writable through the public API. Only the database owner can grant/revoke access. Unapproved signed-in users and anonymous visitors cannot access forms/submissions. There are no anonymous submission grants or public form-reading policies yet: public forms will be connected in the migration step.

The main website uses server-side Supabase password sign-in, HTTP-only, secure production cookies, and a Next.js proxy scoped to `/admin` that refreshes sessions and disables caching. Every protected page checks `auth.getUser()` and the database allowlist; it never authorises from a cookie alone or user-editable metadata. Logout uses the local session scope. Supabase handles authentication rate limits. No service-role key is needed for this stage.

## What is and is not connected

`/admin/sign-in` is the new main-website sign-in page; `/admin` shows a protected database connection check and counts of website records. The dashboard clearly explains that existing records await migration. It is a connection foundation, not the completed form builder. Our Events now links to this login, while its existing public Harrow form links still use the separate application.

Supabase will own form definitions and submissions. Zoho Bigin alone will determine active/inactive membership. Bigin verification and Stripe payments remain disabled pending their approved server-side implementation. Membership forms currently remain on-screen demonstrations. No existing form records have been copied to Supabase by this change.

## Activation verification

After the owner approves/runs the SQL, confirm the organiser row matches the confirmed account, verify all three tables have RLS enabled and inspect Security Advisors. Test that an anonymous request cannot select or insert form/submission records. Sign into `/admin/sign-in` using the user-created password and confirm the dashboard reports a protected query succeeded. Test sign-out and that another signed-in account cannot enter the workspace. Do not claim end-to-end sign-in works until this is observed.
