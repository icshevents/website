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
- `content/events.json`: confirmed events; date-only `YYYY-MM-DD`, optional time, price, booking URL, requirements, poster/image, feature article links. Events automatically archive after the end date, using London time.
- Blogs uses the existing `/blog` URLs. Add a small `photos` list in an article’s front matter (src, alt, caption) to show selected photographs as responsive, lazy-loaded images. There is no dedicated photo-gallery page or client-side photo viewer.
- `content/committee.json`: current 2026–28 committee supplied by the owner on 15 October 2026. Six returning members have portraits matched by the names on the existing ICSH website (verified 16 October 2026); the six members without a matching labelled portrait retain placeholders. The old website spells Roohi Mohammed as “Roohi Mohammad”; the supplied 2026–28 committee name is retained. Source evidence is recorded in `content/committee-photo-sources.json`. To add an approved photo, add its path as `image`.

Markdown is rendered as sanitised HTML. Keep author as ICSH unless an article has an approved named author.

## Images and review

Nineteen photographs were curated from all 207 entries in the owner-supplied cruise album. Videos, duplicates and weaker photographs were excluded. Full-resolution originals are retained separately in the handover. The website has 640px and 1600px WebP derivatives with orientation corrected and metadata stripped; Next.js also provides responsive delivery. No generated or stock cruise images, facial changes or invented identities are used. Selected images receive restrained exposure brightening (0–4%) where needed and subtle output sharpening. Colour balance and saturation are preserved to protect natural skin tones; no generative edits, face/body changes or object additions are used.

**The public GitHub repository excludes all photograph and logo binaries pending owner approval for that public destination.** The complete private handover and direct Vercel preview include them. The owner has approved a public review link for the preview, including community imagery. Restore `public/assets/` from the supplied source archive for a full local checkout. After owner approval, remove that ignore entry and commit only the approved assets before using Git-triggered deployments. Image descriptions deliberately do not identify participants. To remove a photo, remove the matching record from the album and its files, then deploy. The contact page provides a removal request email.

## Website and launch

The existing development website is https://website-nine-beta-11.vercel.app/, Vercel project `website` (`prj_DCOHiPxvqSLB5or751jMeLsDeYzr`) in the ICSH account, with source in `icshevents/website`. Update this same website; do not create another website, repository or separate preview project. The official site at icsh.org.uk remains unchanged. The current site is still under development and is not officially launched.

Deploy tested source to the existing project's production alias. Do not connect the official domain or enable indexing without approval. All builds default to noindex, with indexing enabled only by SITE_LAUNCHED=true outside a Vercel preview environment. Event forms and saved membership test applications require the protected server-only Supabase setting. The reviewed additive `database/membership-applications.sql` setup was applied to the existing database on 22 October 2026 and its database checks passed with fixtures rolled back. A successful save through the deployed website still needs separate verification.

## Membership form

Confirmed pricing: £20 standard; £15 pensioner from age 65; FREE for full-time students aged 17–21 inclusive with the required student declaration, and for minors aged 16 and below. Joining and renewal forms accept ages 17 and above only. The term is twelve months from confirmed membership fee payment for paid memberships/renewals, or confirmed activation for free membership. A test application does not activate membership or allocate dates.

The five-step form retains the inspected original required personal questions, new/renewal options, UK +44 mobile selection, original terms declaration and conditional renewal guidance. Required DOB, conditional education/student declaration and universal accuracy declaration follow the owner’s brief. The ages-17–21 full-time education checkbox starts unchecked (£20), selects FREE when checked, and resets when DOB falls outside that range. The existing step 2 education question remains synchronised.

**Current source supports fictional test applications.** An address ending `@example.invalid` and an unchecked-by-default test-data acknowledgement are required. Only explicit **Submit Test Application** sends answers to `POST /api/membership/applications`, following its CSRF/session check. The server validates eligibility and declarations, calculates the category and fee, and saves a private application with a reference, `awaiting_payment` or `not_required`, and null start/expiry dates. Confirmation appears only after the database save succeeds. Unchanged retries reuse the same request key; failures keep answers available. Review/edit remains available after confirmation. Clearing or reloading removes the open form, not the saved record. Personal answers and receipt tokens are never written to browser storage.

Organisers review records at `/admin/memberships`. Public submissions do not call Bigin. A separate organiser action can search for an existing contact, create one eligible new pending test contact, and read it back before marking delivery confirmed. This path remains disabled until the narrow Contacts READ/CREATE and secure-search READ grant is authorised, configured and tested, and `ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED=true`. It requests no UPDATE, WRITE or ALL scope. Renewals, existing matches and uncertain creation outcomes require review; existing members are never updated. Stripe, membership activation, live event membership lookup, Campaigns subscriptions and email delivery remain disabled. See [Zoho connection setup](docs/ZOHO-CONNECTIONS.md).

Maintain pricing and validation in `lib/membership-pricing.ts`, `lib/membership.ts` and `lib/membership-validation.ts`; the interface is `components/MembershipForm.tsx`. The current application model, persistence and API are in `lib/membership-applications/`, with the controlled Bigin adapter in `lib/zoho/membership-applications.ts`. `lib/membership-integration.ts` retains unused legacy types for compatibility. The old sample records, payment/CRM simulations and `/api/membership/preview` route remain removed.

Run `pnpm test` and `pnpm typecheck` on Node 24. See [original form inventory and implementation](docs/MEMBERSHIP-FORM.md) for the inspected questions, preserved declarations, approved policy changes and the current test flow. The original public form was inspected read-only. Parent/guardian, safeguarding, privacy retention, communication preferences, live CRM identity/mapping, payment verification and renewal processing still need review before real applicants are accepted. The 22 October decision fixes a paid renewal's start at confirmed payment. A successful deployed website save and an authorised provider create/readback are separate verification steps; neither is established by offline tests.

## Contact

The verified general address is events@icsh.org.uk. Contact actions open the visitor’s email application. There is no demonstration form or unconfigured send endpoint. A server-sent, spam-protected contact form requires an authorised transactional mail service and verified sending domain before implementation; delivery cannot currently be verified.

## Sources

- Existing organisational details: https://www.icsh.org.uk/ (15 October 2026)
- Approved visual reference: https://icsh-community-preview.jxxsfsfzdm.chatgpt.site/
- Cruise source album: https://photos.app.goo.gl/sqUPwgx3BajfhWhE7
- Cruise article/itinerary, membership changes and official social links: owner’s project brief.
- Committee: owner’s screenshot of the 2026–28 committee, supplied 15 October 2026; supersedes the old website.

No unconfirmed future events, invented blog posts, testimonials or additional historical claims are published. The cruise and 10 May 2026 health session are past events. Review the privacy text, selected article photos and registration system before public launch. Lighthouse targets are goals; no score is claimed without measurement.

## Membership invitation

The two-panel invitation retains the approved palette and opens after seven seconds on the homepage only, once per tab session, including across refreshes. A non-personal sessionStorage flag remembers that it has appeared; if storage is unavailable, the in-memory flag prevents repeat prompts during navigation. Discover membership on the homepage can reopen it intentionally. The promotion is not rendered on other pages. Join/Renew leads to the same redesigned form and preserves only the requested new/renewal choice. It collects no data itself and takes no payment. The invitation reflects the confirmed £0–£20 options and the fictional test-application scope, with website saving and Bigin delivery described separately. Close, Escape, Maybe later, backdrop, focus and mobile scrolling are supported. The blog cover remains the smiling bowling-lane group.

## Community wording

The header and footer display ICSH with “Society of Harrow - Est. 1976”. Visitor-facing copy, metadata and share images use inclusive community language and welcome people from all backgrounds, following the owner’s 16 October 2026 direction. This is a website copy update; no external organisation records or services were changed.

## Our Events and organiser workspace

The `/events` page and its two public Harrow forms now run within this main website, with form definitions and submissions in Supabase. `/admin/sign-in` uses Supabase Auth; `/admin` links to participants, stalls, the form builder and CSV exports. The server-only Supabase key stays in protected Vercel Production settings. Browser access uses the publishable key and RLS; organiser access also requires the database-owned allowlist. The previous shared organiser password is not used.

Ten existing records and five form settings were migrated after explicit owner approval on 20 October 2026. Three example ticket forms stay closed and archived; only Harrow participation and stall applications appear publicly. The earlier event verification added two clearly fictional records. Live Bigin membership verification for events, real Stripe payments and email delivery remain disabled. Membership test applications use their own additive table and organiser review page; they do not change those event records or any existing member.

See `docs/OUR-EVENTS.md` and `docs/SUPABASE-SETUP.md` for routes, migration evidence, access controls, operational limits and retirement of the old project. `pnpm test` runs the current offline application suites. The hosted event verification script creates one fictional stall record and must only be run intentionally against an authorised test deployment. Private import files and credentials in `.local/` are excluded from both Git and Vercel uploads.

## Owner-selected picnic photos — 21 October 2026

The homepage hero uses `public/assets/homepage-picnic.webp` (IMG-20250811-WA0010.jpg); its second photo uses `public/assets/homepage-community-games.webp` (IMG-20250811-WA0014.jpg); the membership invitation uses `public/assets/membership-picnic.webp` (IMG-20250811-WA0007.jpg). These are web-sized copies of the owner-supplied photographs, with orientation applied and metadata stripped. They are included in the authorised Vercel website deployment and full source handover. Photograph binaries remain excluded from the public GitHub repository under the existing destination-specific approval policy.

## Blogs and photography — 21 October 2026

The article section is now labelled Blogs across navigation, the homepage, article links and metadata. The dedicated gallery pages, homepage highlights, gallery navigation/sitemap entries and client photo viewer have been removed. Old gallery URLs redirect to Blogs or the corresponding cruise article. The cruise feature retains its cover and three selected, lazy-loaded photos with captions. The original image files remain available for future editorial use and in the source handover.

## About Us photography and homepage frame — 21 October 2026

The About Us page places six owner-supplied photographs beside the story and activities, followed by a responsive two-column layout for shared trips. Images retain their natural proportions, descriptive alt text and captions; all are lazy-loaded through Next.js responsive image delivery. On small screens the columns stack. Each source is orientation-corrected, metadata-stripped and exported as a WebP with a maximum 1600px edge. The original files remain untouched.

The built-in image editor was evaluated for enhancement, but its first output altered facial details and was rejected. The website instead uses restrained, photo-specific CSS brightness, contrast and saturation adjustments, preserving the original people and scenes. No generated variants are published. The source-to-asset mapping and display adjustments are recorded in `docs/ABOUT-PHOTOS.md`. Photo binaries remain excluded from public GitHub and are included in the authorised Vercel deployment and complete private handover.

The homepage hero now uses a single gold border directly around the photo, replacing the decorative offset outline. The Blogs label uses the existing `/blog` URLs. No dedicated photo-gallery route or viewer has been restored.

## Membership age policy — updated 21 October 2026

The owner confirmed that both joining and renewal forms block applicants aged 16 and below. Their membership is automatically free, regardless of education; the quote shows FREE and the DOB error explains that the form is for ages 17 and above. This message appears immediately for a valid DOB in the blocked range, on blur, on Continue, and at final validation. The user must correct the date to an eligible age to continue. No automatic enrolment or record is created.

Student eligibility is ages 17–21 inclusive in full-time education, with the unchecked standard-rate option and required student declaration retained. Controls hide and reset below 17 or from the 22nd birthday. The student declaration wording now reflects this authorised range; the general accuracy declaration is unchanged. The under-17 and student notice appears below the pricing cards, in the homepage announcement, invitation and membership privacy copy. Event participation and stall forms are outside this change, as the owner explicitly confirmed.

## Homepage promotion and events — 21 October 2026

The membership promotion is now exclusive to the homepage and appears automatically once per tab session. Closing, refreshing or navigating away and back does not show it again automatically. The events calendar and its client component import have been removed from Our Events; event listings, application links and past events remain. No event records or application data were changed.


## Zoho connection setup — 22 October 2026

The organiser workspace now links to `/admin/connections` for protected, read-only Bigin and Campaigns connection checks. The checks refresh OAuth credentials on the server, verify the configured data centre, and discover Bigin organisation/field metadata and Campaigns lists/topics/fields. The approved EU credentials are saved privately in the existing Vercel project's Production environment. Real metadata discovery confirmed Bigin organisation `icshportal` with 26 Contacts fields and the ICSH Campaigns account with 5 lists, 1 topic and 24 contact fields.

Those verified grants support metadata checks only. The new organiser-controlled membership test route requires separate Contacts READ/CREATE and secure-search READ authorisation; its writes flag remains off. Public membership saving is independent of that grant and never automatically calls Bigin. Campaigns subscriptions, workflows and delivery remain disabled. See [Zoho connection setup](docs/ZOHO-CONNECTIONS.md) for exact scopes, settings and the separate website/provider verification steps.

## Rolling membership dates — 22 October 2026

The approved term is twelve calendar months. New paid memberships and paid renewals start from verified membership fee payment; free membership retains confirmed activation as its start. Existing Bigin members may provisionally use their individual Contact `Created_Time` until an accurate current-term membership start is available. A corrected start overrides that fallback and recalculates expiry. Preserve the audit creation timestamp and map corrections to a separate membership-start field once the actual field is agreed.

`lib/membership-validity.ts` resolves these date sources with explicit provenance. Dates use `Europe/London`, with an inclusive start and an exclusive anniversary expiry. For example, 22 October 2026 → 22 October 2027, valid through 21 October 2027; 29 February → 28 February next year. Old creation dates are not rolled forward automatically. Missing/invalid dates remain unresolved and future starts are not yet active.

The fixed synthetic event member checker now requires a current term as well as its active/paid flags at both quote and final registration. Tests cover corrected starts, leap years, UK date boundaries and expiry between quoting and submission. Public membership copy reflects the payment-date rule, while unpaid application quotes still allocate no dates. Live Bigin Contact lookup, CRM date-field writes and payment processing remain disconnected; the verified Zoho grants currently allow metadata checks only. See [membership implementation and date policy](docs/MEMBERSHIP-FORM.md).
