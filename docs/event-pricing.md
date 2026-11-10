# Event membership pricing

For membership discounts, all membership types use the same rate. A discounted booking requires Bigin Membership Status `Active`, a valid current Membership Date / Expiry Date interval, and Payment Status `Completed`. An active free membership with Payment Status `Not required` pays the standard event rate. No category, age or browser-supplied membership flag changes the price.

The Christmas prototype uses the booking contact's email and applies that price to every attendee in the booking. Existing event forms configured for individual membership checks continue to verify each discounted attendee separately, with the same paid-only rule.

## Public API flow

1. The browser validates the email and calls `POST /api/event-forms/booking/quote` with the event ID, email and attendee quantity.
2. `lib/event-forms/booking-membership.ts` uses the server-only lookup from `lib/zoho/server.ts`. The client makes an authenticated GET to the EU Bigin `Contacts/search` endpoint with an email query, then checks returned email addresses exactly. Credentials remain on the server.
3. A unique current active contact with completed membership payment uses the saved event's `rates.member`. All other confirmed results use `rates.nonmember`. Missing dates, future terms or expiry on/before the London signup date do not qualify. Membership type is ignored.
4. The public response contains only membership outcome, discount eligibility, price, quantity, total, checked date and configuration version. Contact IDs and raw term/payment fields are omitted.
5. `POST /api/event-forms/booking/registrations` validates the full form and obtains a fresh Bigin result. An internal opaque proof binds that result to the event version, email, quantity, signup date and fallback choice. Browser quote JSON cannot grant a discount. Changed prices require another confirmation.
6. The existing atomic event database writer saves the booking and enforces capacity under a parent-form lock. Retries with the same request and private capability return the saved booking before another lookup. Payment remains pending; no Stripe request or confirmation email is sent.

No match receives the standard price. Duplicate or incomplete email matches are ambiguous and never resolved by choosing an active record arbitrarily. Unavailable or ambiguous checks offer retry or an explicit standard-price fallback. A keyed email fingerprint and event ID log duplicate-match issues privately, without writing raw email addresses to audit logs.

## Organiser controls

In the existing event editor, choose automatic pricing from the booking email. Set one Active paid member price and one Standard price. These values are stored in the event configuration; no separate category prices apply. The prototype is marked explicitly and excluded from public event listings.

For a saved automatic-pricing event, expand **Membership pricing test · organisers only**. Its authenticated endpoint is `POST /api/event-forms/admin/booking-pricing`. It shows the searched email, matching record IDs, raw status/payment/term fields, eligibility rule and final price. Anonymous requests are rejected. Category information is not required or used.

## Verification and rollback

Automated checks cover paid active membership, active free membership, expired/inactive/not-found results, multiple membership types, duplicates, outages, explicit fallback, stale or forged quotes, price changes, quantity/capacity, replay and organiser-only evidence. Local browser fixtures are confined to `.local/` and excluded from deployment; the deployed form always uses the real Bigin connection.

Prototype registrations do not reserve a real event place. Close the prototype form to disable it while retaining all records. Existing membership applications, live festival/stall forms, Bigin contacts and membership years are not changed by this feature. Backups and verification evidence are in the workspace output directory `outputs/christmas-membership-pricing-2026-10-22/`.
