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

- `content/site.json`: organisation, email, social links and membership proposal status, reference rates and duration.
- `content/announcements.json`: homepage membership announcement.
- `content/posts/*.md`: blog articles. Duplicate an article, change its filename and front matter, then write Markdown. No page code needed. Lists automatically show the most recent articles, up to three on Home. Only one real article is currently available.
- `content/events.json`: confirmed events; date-only `YYYY-MM-DD`, optional time, price, booking URL, requirements, poster/image, blog and gallery links. Events automatically archive after the end date, using London time.
- `content/galleries.json`: albums and accessible photo descriptions. Add an album record and its images to create a new route automatically. Do not publish empty albums.
- `content/committee.json`: current 2026–28 committee supplied by the owner on 15 October 2026. Six returning members have portraits matched by the names on the existing ICSH website (verified 16 October 2026); the six members without a matching labelled portrait retain placeholders. The old website spells Roohi Mohammed as “Roohi Mohammad”; the supplied 2026–28 committee name is retained. Source evidence is recorded in `content/committee-photo-sources.json`. To add an approved photo, add its path as `image`.

Markdown is rendered as sanitised HTML. Keep author as ICSH unless an article has an approved named author.

## Images and review

Nineteen photographs were curated from all 207 entries in the owner-supplied cruise album. Videos, duplicates and weaker photographs were excluded. Full-resolution originals are retained separately in the handover. The website has 640px and 1600px WebP derivatives with orientation corrected and metadata stripped; Next.js also provides responsive delivery. No generated or stock cruise images, facial changes or invented identities are used. Selected images receive restrained exposure brightening (0–4%) where needed and subtle output sharpening. Colour balance and saturation are preserved to protect natural skin tones; no generative edits, face/body changes or object additions are used.

**The public GitHub repository excludes all photograph and logo binaries pending owner approval for that public destination.** The complete private handover and direct Vercel preview include them. The owner has approved a public review link for the preview, including community imagery. Restore `public/assets/` from the supplied source archive for a full local checkout. After owner approval, remove that ignore entry and commit only the approved assets before using Git-triggered deployments. Image descriptions deliberately do not identify participants. To remove a photo, remove the matching record from the album and its files, then deploy. The contact page provides a removal request email.

## Preview and launch

The Vercel project is `icsh-website-preview`. Use preview deployments only until owner approval. Never connect `icsh.org.uk` or `www.icsh.org.uk`, promote to production or replace the existing live site without express approval.

All builds default to noindex. Metadata and robots permit indexing only with `SITE_LAUNCHED=true` outside Vercel’s preview environment. After approval, set `NEXT_PUBLIC_SITE_URL` to the chosen canonical official origin and `SITE_LAUNCHED=true` for production only. Sitemap, canonical links, Open Graph and structured data are included. No secret credentials are required by the website.

The connected Vercel account does not currently have the GitHub Login Connection required to link `icshevents/website`. Complete that connection in Vercel, then link this existing project to the repository; do not create a duplicate project. Keep the production branch and official domain disconnected until approved. The initial review build is uploaded directly.

## Proposed membership preview

The 16 October 2026 owner request introduces proposed standard £20, pensioner £15 (age 66+) and free student (under 21 in full-time education with declaration) categories, all twelve months. The owner chose to continue with the preview first. Rates are not formally approved. Existing live registration, CRM workflows and payment pricing are unchanged.

`lib/membership.ts` contains the calculation rules and cards, `components/MembershipForm.tsx` the custom form, and `app/api/membership/preview/route.ts` the server-validated demonstration. The route uses temporary sample records and has no live CRM or payment adapter. Under-18 registration and early renewals remain blocked pending approved processes. The public existing form uses Zoho Checkout and calendar-year terms; no address/DOB/student fields were visible. No form submissions were made there.

Run `node --test tests/membership.test.mjs` on Node 24. Read [the membership handover](docs/MEMBERSHIP-PREVIEW.md) for inspected fields, mapping preparation, test fixtures, renewal decisions and the secure integration/launch requirements. Authenticated Bigin and merchant tests remain pending authorised test access.

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

The approved prototype’s two-panel membership invitation is restored with the current brand palette and proposed £0–£20/12-month options. It opens after seven seconds on Home, About or Events, once per continuous visit, and can be reopened using “Discover membership”. Join/Renew selections lead to the custom membership preview. The invitation itself collects no details; the membership preview asks for sample information and never creates a real membership or payment. Close, Escape, “Maybe later”, backdrop click, focus handling and mobile scrolling are supported. The blog cover uses the smiling bowling-lane group photo from the supplied cruise album, shared by the article, listings and social metadata.

## Community wording

The header and footer display ICSH with “Society of Harrow - Est. 1976”. Visitor-facing copy, metadata and share images use inclusive community language and welcome people from all backgrounds, following the owner’s 16 October 2026 direction. This is a website copy update; no external organisation records or services were changed.
