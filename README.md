# ICSH website

Next.js 16, React 19, TypeScript and Tailwind CSS. The approved ICSH prototype’s layout, typography, photography treatment, cards and footer styling form the design foundation. The owner’s new logo and palette (#4C6259 green, #F8F7F2 ivory, #AD925A gold) supplied on 15 October 2026 are applied throughout. British English throughout.

## Run

Use Node.js 24 and pnpm 11.25.0:

```
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm start
```

## Maintain content

- `content/site.json`: organisation, email, social links and organisation and membership interface status; confirmed rates and thresholds are in lib/membership-pricing.ts.
- `content/announcements.json`: homepage membership announcement.
- `content/posts/*.md`: blog articles. Duplicate an article, change its filename and front matter, then write Markdown. No page code needed. Lists automatically show the most recent articles, up to three on Home. Only one real article is currently available.
- `content/events.json`: confirmed events; date-only `YYYY-MM-DD`, optional time, price, booking URL, requirements, poster/image, blog and gallery links. Events automatically archive after the end date, using London time.
- `content/galleries.json`: albums and accessible photo descriptions. Add an album record and its images to create a new route automatically. Do not publish empty albums.
- `content/committee.json`: current 2026–28 committee supplied by the owner on 15 October 2026. Six returning members have portraits matched by the names on the existing ICSH website (verified 16 October 2026); the six members without a matching labelled portrait retain placeholders. The old website spells Roohi Mohammed as “Roohi Mohammad”; the supplied 2026–28 committee name is retained. Source evidence is recorded in `content/committee-photo-sources.json`. To add an approved photo, add its path as `image`.

Markdown is rendered as sanitised HTML. Keep author as ICSH unless an article has an approved named author.

## Images and review

Nineteen photographs were curated from all 207 entries in the owner-supplied cruise album. Videos, duplicates and weaker photographs were excluded. Full-resolution originals are retained separately in the handover. The website has 640px and 1600px WebP derivatives with orientation corrected and metadata stripped; Next.js also provides responsive delivery. No generated or stock cruise images, facial changes or invented identities are used. Selected images receive restrained exposure brightening (0–4%) where needed and subtle output sharpening. Colour balance and saturation are preserved to protect natural skin tones; no generative edits, face/body changes or object additions are used.

**The public GitHub repository excludes all photograph and logo binaries pending owner approval for that public destination.** The complete private handover and direct Vercel preview include them. The owner has approved a public review link for the preview, including community imagery. Restore `public/assets/` from the supplied source archive for a full local checkout. After owner approval, remove that ignore entry and commit only the approved assets before using Git-triggered deployments. Image descriptions deliberately do not identify participants. To remove a photo, remove the matching record from the album and its files, then deploy. The contact page provides a removal request email.

## Website and launch

The existing development website is https://website-nine-beta-11.vercel.app/, Vercel project `website` (`prj_DCOHiPxvqSLB5or751jMeLsDeYzr`) in the ICSH account, with source in `icshevents/website`. Update this same website; do not create another website, repository or separate preview project. The official site at icsh.org.uk remains unchanged. The current site is still under development and is not officially launched.

Deploy tested source to the existing project's production alias. Do not connect the official domain or enable indexing without approval. All builds default to noindex, with indexing enabled only by SITE_LAUNCHED=true outside a Vercel preview environment. No secret credentials are required for the current disconnected form.

## Membership form

Confirmed pricing: £20 standard; £15 pensioner from age 66; FREE for under-21s in full-time education with the required student declaration; twelve months from confirmed activation or renewal. No activation or expiry dates are calculated in this phase.

The five-step form retains the inspected original required personal questions, new/renewal options, UK +44 mobile selection, original terms declaration and conditional renewal guidance. New required DOB, conditional education/student declaration and universal accuracy declaration follow the owner’s 16 October brief. The under-21 full-time education checkbox sits below DOB, defaults unchecked (£20), selects FREE when checked, and resets when DOB becomes age 21 or older. The existing step 2 education question is retained and synchronised. All answers stay in React component memory; no native form submission, endpoint, network request, cookies, analytics or browser/database storage is used. Final completion is on screen only. No memberships, payments, emails or numbers are generated. Back/edit retains answers; leaving, reloading or returning from completion clears the form.

Maintain logic in `lib/membership-pricing.ts`, `lib/membership.ts` and `lib/membership-validation.ts`; interface in `components/MembershipForm.tsx`. The future integration boundary is types only in `lib/membership-integration.ts`. Do not connect Zoho Bigin, Zoho Forms, OAuth, payments or submission systems yet. The previous sample records, payment/CRM simulations and API endpoint are removed.

Run `node --test tests/membership.test.mjs` on Node 24. See [original form inventory and implementation](docs/MEMBERSHIP-FORM.md) for every inspected question/option, preserved declarations, authorised policy changes and launch decisions. The public form was read only; no real applicant information was entered there. Parent/guardian, safeguarding, privacy retention, communication preferences, CRM identity/duplicate handling, field mapping, payment verification and early-renewal date rules need review before a later integration phase.

## Contact

The verified general address is events@icsh.org.uk. Contact actions open the visitor’s email application. There is no demonstration form or unconfigured send endpoint. A server-sent, spam-protected contact form requires an authorised transactional mail service and verified sending domain before implementation; delivery cannot currently be verified.

## Sources

- Existing organisational details: https://www.icsh.org.uk/ (15 October 2026)
- Approved visual reference: https://icsh-community-preview.jxxsfsfzdm.chatgpt.site/
- Cruise source album: https://photos.app.goo.gl/sqUPwgx3BajfhWhE7
- Cruise article/itinerary, membership changes and official social links: owner’s project brief.
- Committee: owner’s screenshot of the 2026–28 committee, supplied 15 October 2026; supersedes the old website.

No unconfirmed future events, invented blog posts, testimonials or additional historical claims are published. The cruise and 10 May 2026 health session are past events. Review the privacy text, gallery selection and registration system before public launch. Lighthouse targets are goals; no score is claimed without measurement.

## Membership invitation

The two-panel invitation retains the approved palette and opens after seven seconds on Home, About or Events, once per continuous visit. Discover membership reopens it. Join/Renew leads to the same redesigned form and preserves only the requested new/renewal choice. It collects no data itself and takes no payment. The invitation now reflects the confirmed £0–£20 membership options and clearly states that submissions are not enabled. Close, Escape, Maybe later, backdrop, focus and mobile scrolling are supported. The blog cover remains the smiling bowling-lane group.

## Community wording

The header and footer display ICSH with “Society of Harrow - Est. 1976”. Visitor-facing copy, metadata and share images use inclusive community language and welcome people from all backgrounds, following the owner’s 16 October 2026 direction. This is a website copy update; no external organisation records or services were changed.

## Our Events

The `/events` page now displays published registration forms from the standalone ICSH event workspace, with a secured Organiser sign in link. Administrators continue to manage event forms and applications in the existing workspace; public event details and stall rates are fetched afresh when this page is visited. The calendar and past-event stories remain available. See `docs/OUR-EVENTS.md` for the public data contract, outage fallback, test-mode notices and later integration options. Run `pnpm test` to include membership and event-directory checks.

## Supabase organiser login

The main website now has `/admin/sign-in` and a private `/admin` connection dashboard using Supabase Auth. It requires the two public Supabase connection settings and the reviewed, owner-run `database/organiser-setup.sql` before access can be activated. See `docs/SUPABASE-SETUP.md`. Existing forms and registrations are not yet migrated; they remain in the previous application. The new dashboard explicitly distinguishes new website records from existing signups. Bigin membership verification and real payments remain disabled. Run `pnpm test` for the organiser-access security cases as well as the existing checks.
