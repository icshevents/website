# Our Events and the main-website forms

`/events` is Our Events, using the main website's existing navigation, past stories, photographs and optional calendar. Published forms are read fresh from the existing ICSH Events Supabase database on the server. `lib/event-directory.ts` accepts only the supported test-mode public contract and same-website paths. Public output contains descriptions, dates, venue, rates and links, never applicant details, organiser notes or credentials. A failed database read shows an unavailable notice instead of stale invented forms.

Harrow Food Festival has two public links on this website:
- `/harrow-food-festival-2026/get-involved`: cooking, donations and volunteering.
- `/stall-hire/harrow-food-festival-2026-stall-hire`: stall applications.

The migrated forms keep their existing interface and validation, served directly by Next.js HTML route handlers with shared same-origin `/api/event-forms/` endpoints. There is no iframe, cross-project routing or dependency on the previous app. The ICSH logo links to Our Events; the privacy link opens the website policy. The main website's approved photo assets are supplied privately during direct Vercel deployments and remain excluded from the public GitHub repository.

`/admin` uses Supabase Auth and a database-owned organiser allowlist. It links to `/admin/forms/harrow-food-festival-2026` for participants, `/admin/forms/stall-hire` for stalls, and `/admin/forms` for the form builder, configurable questions/rates, archived forms and CSV exports. Only Harrow's published forms appear publicly; the three old ticket examples remain closed and archived with their historical record preserved.

All forms are visibly test mode. Fake payments are explicitly simulated; no Stripe, Zoho Bigin or email delivery is active. Supabase stores form/submission data; Bigin remains the future authority for membership verification. See `SUPABASE-SETUP.md` for migration evidence, server access controls, list/export limits and launch requirements.

Verification on 20 October 2026: 59 application tests, TypeScript, production builds, rolled-back database checks, nine groups of hosted HTTP checks and a saved/reloaded fictional browser registration. The two submission checks added labelled fictional records alongside the ten preserved records. No DNS or official website changes were made. A real organiser browser session remains an owner verification step.
