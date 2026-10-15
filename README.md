# ICSH website

Next.js 16, React 19, TypeScript and Tailwind CSS. The approved ICSH prototype’s actual visual tokens, layout, photography treatment, cards and footer styling form the design foundation. British English throughout.

## Run

Use Node.js 24 and pnpm 11.25.0:

```
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm start
```

## Maintain content

- `content/site.json`: organisation, email, social links and the single membership fee/duration configuration.
- `content/announcements.json`: homepage membership announcement.
- `content/posts/*.md`: blog articles. Duplicate an article, change its filename and front matter, then write Markdown. No page code needed. Lists automatically show the most recent articles, up to three on Home. Only one real article is currently available.
- `content/events.json`: confirmed events; date-only `YYYY-MM-DD`, optional time, price, booking URL, requirements, poster/image, blog and gallery links. Events automatically archive after the end date, using London time.
- `content/galleries.json`: albums and accessible photo descriptions. Add an album record and its images to create a new route automatically. Do not publish empty albums.
- `content/committee.json`: current 2026–28 committee supplied by the owner on 15 October 2026. Photos intentionally use consistent placeholders. To add an approved photo, add its path as `image`.

Markdown is rendered as sanitised HTML. Keep author as ICSH unless an article has an approved named author.

## Images and review

Nineteen photographs were curated from all 207 entries in the owner-supplied cruise album. Videos, duplicates and weaker photographs were excluded. Full-resolution originals are retained separately in the handover. The website has 640px and 1600px WebP derivatives with orientation corrected and metadata stripped; Next.js also provides responsive delivery. No generated or stock cruise images, facial changes or invented identities are used. Colour/exposure retouching has not been applied; derivatives preserve the source appearance.

**The public GitHub repository excludes all photograph and logo binaries pending owner approval for that public destination.** The complete private handover and direct Vercel preview include them. Restore `public/assets/` from the supplied source archive for a full local checkout. After owner approval, remove that ignore entry and commit only the approved assets before using Git-triggered deployments. Image descriptions deliberately do not identify participants. To remove a photo, remove the matching record from the album and its files, then deploy. The contact page provides a removal request email.

## Preview and launch

The Vercel project is `icsh-website-preview`. Use preview deployments only until owner approval. Never connect `icsh.org.uk` or `www.icsh.org.uk`, promote to production or replace the existing live site without express approval.

All builds default to noindex. Metadata and robots permit indexing only with `SITE_LAUNCHED=true` outside Vercel’s preview environment. After approval, set `NEXT_PUBLIC_SITE_URL` to the chosen canonical official origin and `SITE_LAUNCHED=true` for production only. Sitemap, canonical links, Open Graph and structured data are included. No secret credentials are required by the website.

The connected Vercel account does not currently have the GitHub Login Connection required to link `icshevents/website`. Complete that connection in Vercel, then link this existing project to the repository; do not create a duplicate project. Keep the production branch and official domain disconnected until approved. The initial review build is uploaded directly.

## Membership launch blocker

Confirmed policy is **£20 for 12 months from joining or renewal**, including existing members based on their latest joining or renewal date. The external Zoho form at the existing registration URL was inspected on 15 October 2026 and still specifies a £15 payment and calendar-year terms. It is not administratively accessible through the connected tools. No payment or member record has been changed. The site links to the existing service with a visible instruction to contact ICSH before payment if the form differs.

Before launch, the form owner must update the fee and terms; validate expiry calculations and renewal automations; reconcile existing members; and test the complete registration/payment workflow. After verification, set `membership.platformVerified` to true and remove/update the temporary operational message. Do not collect card details on this website.

## Contact

The verified general address is events@icsh.org.uk. Contact actions open the visitor’s email application. There is no demonstration form or unconfigured send endpoint. A server-sent, spam-protected contact form requires an authorised transactional mail service and verified sending domain before implementation; delivery cannot currently be verified.

## Sources

- Existing organisational details: https://www.icsh.org.uk/ (15 October 2026)
- Approved visual reference: https://icsh-community-preview.jxxsfsfzdm.chatgpt.site/
- Cruise source album: https://photos.app.goo.gl/sqUPwgx3BajfhWhE7
- Cruise article/itinerary, membership changes and official social links: owner’s project brief.
- Committee: owner’s screenshot of the 2026–28 committee, supplied 15 October 2026; supersedes the old website.

No unconfirmed future events, invented blog posts, testimonials or additional historical claims are published. The cruise and 10 May 2026 health session are past events. Review the privacy text, gallery selection and registration system before public launch. Lighthouse targets are goals; no score is claimed without measurement.
