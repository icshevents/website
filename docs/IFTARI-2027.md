# ICSH Ramadan Iftari 2027

The booking form lives inside the existing Next.js website at `/ramadan-iftari-2027`. The existing ICSH design, organiser authentication, Supabase project, Bigin membership lookup grant, Stripe account/transport/webhook, and transactional email worker are reused. There is no separate app or hosting project.

## Organiser workflow

Open `/admin/iftari` using an approved organiser account. Configure the venue, date, UK local time, four ticket prices, optional overall capacity and maximum guests per booking. The event is Saturday 20 February 2027; guests should arrive by 4:45pm (UK time). Blank date/time are displayed as TBC. Under-5 places are approved as free (£0). All ticket quantities start blank, with no preselected ticket. Organisers can still change prices; a blank under-5 price disables that category. Every guest counts towards capacity. Complimentary places alone require a paid ticket or an ICSH-assisted booking.

Initial adult member/non-member/child rates are £25.50/£28/£13. Everyone aged 12+ uses an adult ticket; children aged 5–11 share the same rate. An active member receives the same event rate regardless of membership type or whether their membership required a payment.

The event initially stays **draft**. Upcoming event cards, including the Iftari, are sorted by date on Events & Services. The event card is visible while bookings are draft, with a View event details link and Bookings opening soon notice. Set it to **Published** to accept bookings. Closed/draft prevents new bookings; it does not prevent an already-reserved Stripe session from completing. Existing bookings retain their original prices and event details. Coordinate any changes to event details with existing bookers.

Membership is verified only for the lead booker. An active lead booker may select multiple member-priced tickets without entering attendee emails. The repeat member-discount switch defaults off: the lead email reserves one discount claim for the whole booking, and repeat use across bookings requires that switch to be enabled. Refunded paid bookings retain their used member-discount claim unless that switch is enabled. Expired and failed bookings release it.

## Reservation and payment flow

1. Public membership checks return a minimal status only. The website's server searches Bigin by exact normalised email, rejects incomplete/ambiguous results, and checks Active status and valid current membership dates. No contact IDs, names, credentials or membership dates are returned to the browser.
2. The server recalculates a quote from stored prices. The browser submits quantities, an optional donation, and the version/total it reviewed, never prices. Custom donations allow pence and default to zero.
3. Before saving a new booking that contains member-priced tickets, the lead booker’s email is checked once again. Non-member bookings require no Zoho account or lookup.
4. `icsh_iftari_reserve` locks the event settings row. In the same transaction it checks the current settings version, calculates the authoritative quote, checks capacity and exclusive lead-booker discount claims, and creates a pending booking with a unique reference. Configuration edits use the same parent lock. All three Iftari tables enable RLS, revoke anonymous/authenticated access, and use server-only invoker RPCs.
5. Checkout uses the existing `STRIPE_WEBSITE_PAYMENTS_ENABLED` infrastructure and account guard. It itemises each ticket category and the donation separately, in GBP. The booking UUID supplies a stable idempotency key. Saved quantities, prices and the original expiry form an immutable payment request. Checkout expires approximately 24 hours after reservation. Opening a return page never marks a booking paid.
6. The existing `/api/stripe/membership-webhook` endpoint dispatches Iftari metadata to the Iftari handler before existing payment/membership handlers. Verify its Stripe subscription includes `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `checkout.session.expired`. Refunds and disputes use `charge.refunded` and `charge.dispute.created`.
7. Only a signed webhook, followed by account/mode/session/amount/currency/PaymentIntent/charge verification, records payment success. Unpaid completion remains pending. Duplicate events and late expiry/failure events cannot downgrade a paid booking. A success arriving after a terminal released reservation is flagged for organiser review, rather than claiming the places are confirmed.
8. The same database transaction queues one confirmation in the existing email outbox only after a live booking becomes paid. The email worker rechecks payment state, loads protected details and sends the venue/date/time, quantities, ticket charges, optional donation, total and reference. Test-mode payments do not queue email. Existing email enablement and retry/uncertain-delivery safeguards apply.

## Recovery and privacy

A private token is retained in session storage, with an HttpOnly signed return cookie for the Stripe return. Booking UUIDs alone cannot read bookings. No card information is collected or stored by ICSH. Public endpoints use bounded bodies, same-origin/CSRF validation, rate limits, validation and no-store headers. Organiser pages and APIs verify the existing Supabase organiser allowlist.

After an uncertain response, retry the saved booking instead of starting a second booking. The client checks whether a rejected request persisted before allowing edits. The confirmation page can resume the existing checkout. Expired/failed checkouts offer a new booking.

Capacity and discounts are released only after a verified terminal Stripe notification, not because the browser leaves Checkout or a local timer expires. Delayed payment methods keep their reservation while unpaid. If a Stripe request fails before session attachment, retries retain the original request/idempotency key; signed session webhooks can recover attachment. Requests without a mapped session older than 22 hours require an organiser to reconcile with Stripe; they are never recreated with a fresh charge key automatically. For a stuck reservation, inspect the booking reference in Stripe and resend the appropriate webhook delivery. Never release a potentially payable session just to clear a hold.

The optional Additional notes field collects allergies, dietary requirements or other booking information (maximum 2,000 characters). Notes are stored privately with the booking and are included in the organiser list and CSV, never public confirmations. The organiser list and CSV include test/live labels and separate donation totals. CSV output escapes formula prefixes. Public confirmations exclude contact and member email details. Bigin membership records are never created or changed by this form.

## Database and validation

Canonical additive setup: `database/iftari-bookings.sql`. Applied to the existing **ICSH Events** Supabase project on 12 November 2026, with a follow-up extending Checkout's retry window to 24 hours. No existing application/payment rows were changed, and the initial configuration remains draft.

- `pnpm typecheck` and `pnpm build`.
- `pnpm test`, including `tests/iftari-bookings.test.mjs` for mixed pricing, validation, membership eligibility, lead-booker-only verification, non-member fallback, Stripe lines and verified evidence, and the paid email content.
- `tests/iftari-bookings-database.sql`: rollback-only PostgreSQL regression checks for RLS/permissions, draft blocking, server totals, idempotent retry, capacity, duplicate discounts, explicit override, unknown under-5 pricing, unpaid completion, asynchronous success, replay/downgrade protection and exactly-once email queuing. Passed in PGlite and the actual Supabase PostgreSQL project without retaining fixtures.

A real Stripe sandbox Checkout/webhook and delivered Iftari confirmation email still need end-to-end validation before opening bookings. No live charge or customer email was sent during implementation. The managed local preview launcher does not support this repository's Next.js dev arguments, so local browser QA was unavailable; use the existing Vercel project's deployment for browser validation.
