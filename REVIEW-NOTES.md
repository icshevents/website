# Review notes — 15 October 2026

Implemented: eight main navigation sections plus privacy; approved prototype styling; central £20/12-month membership policy; complete cruise article and itinerary; 19-image gallery with fullscreen, keyboard and swipe handlers; dated event archives and monthly calendar; owner-supplied twelve-person 2026–28 committee with photo placeholders; official social links; metadata, sitemap and preview noindex protection.

Verified locally: Next.js production build and TypeScript pass; all eleven content pages return 200; thirteen internal link targets work; every page has one H1, a description and a canonical link; all rendered images have alt attributes; social links use the supplied official accounts; desktop and 390px mobile browser checks show no horizontal overflow; fullscreen viewer next button, keyboard next and Escape close work.

Limits before public launch:
- Update and test the external Zoho registration service (still £15/calendar-year terms as inspected). No payment configuration or member records were changed.
- Connect GitHub as a Login Connection in Vercel to enable repository linking. Direct source upload is used for the protected preview. Vercel reports READY; access to the deployed HTML through the connector is blocked by a 403 team authorisation error. Sign into the authorised Vercel account to review, and update the connection’s project/team access for automated deployed-page verification.
- Review the 19 photographs before public release. Image binaries are withheld from public GitHub pending destination-specific approval. The full private source handover and protected preview include them.
- Photographs were curated, orientation-corrected, gently exposure-corrected where needed, subtly sharpened, resized and converted to WebP. Originals are retained. No facial/physical alterations or generated scene content were used.
- Contact is a working email action. A server-sent contact form has not been configured or delivery-tested.
- Lighthouse targets and formal WCAG conformance have not been measured/certified. Mobile touch swipe support is implemented; physical-device swipe has not been tested.
- Privacy text should be checked against ICSH’s actual records, retention practices and membership communications before launch.
- No new future events or extra news articles were fabricated.

The live ICSH site and production domain are unchanged.
