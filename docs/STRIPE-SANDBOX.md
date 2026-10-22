# Membership Stripe sandbox — 22 October 2026

This branch adds an unlisted `/membership/sandbox` form for testing membership fees through Stripe-hosted Checkout. It reuses the membership validation and price calculation. `/api/membership/sandbox` issues a signed, one-hour HttpOnly browser session and CSRF token, validates fictional answers, calculates the charge on the server, and creates an idempotent test Checkout Session. Eligible free students bypass Checkout. The return page retrieves the session directly from Stripe and checks its test status, purpose, amount, currency and browser binding before displaying payment success.

The feature requires `VERCEL_ENV=preview`, the deployment's own `VERCEL_URL`, and a test-mode `STRIPE_SECRET_KEY`. It returns 404 on Production, on Development, with a live key, or with missing configuration. Secret values are never returned to the browser or written into source. No publishable key is needed for this hosted redirect flow; the existing integration's keys remain untouched.

The fixed test identity is Fictional Sandbox, `icsh-stripe-test@example.invalid`, `07700900123`. Only the date of birth, education declarations and joining/renewal choice vary. Raw birth date, phone and names are not sent to Stripe. The sandbox does not import database or CRM clients and cannot save applications, update Bigin, activate membership, assign membership dates, enroll mailing lists or send application emails. The regular membership form and existing Zoho Forms → Stripe flow remain unchanged.

## Manual tests

Open the Preview deployment's `/membership/sandbox` page while signed into Vercel. Use 01/01/1990 for £20, 01/01/1950 for £15, and 01/01/2007 with both student confirmations for FREE. Joining and renewal use a one-off payment, never a subscription.

Use Stripe's documented successful card `4242 4242 4242 4242`, a future expiry such as 12/34, and any three-digit CVC. For a decline use `4000 0000 0000 0002`. Use fictional billing details. A successful payment returns to the website and displays a verified sandbox receipt. Cancellation does not establish payment. Pending or unpaid Stripe sessions never display success. Reopening a receipt in another browser cannot establish success.

## Required work before linking to saved applications or activating memberships

This is a payment proof of concept, not a fulfilled membership integration. Add a separate sandbox data store and durable application-to-Checkout mapping before testing reconciliation writes. Implement a signed webhook handler for `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`, with payment-status checks, event deduplication, authoritative amount/currency/reference checks, retry/reconciliation, and refund handling. Fulfillment must run from verified events, not from the return page. Register that endpoint in this sandbox only and store its signing secret as a Preview Secret; Vercel deployment protection must allow authenticated Stripe webhook delivery without opening unrelated routes.

Only after those sandbox tests pass should a separately approved live rollout connect verified payments to Bigin activation and 12-month dates. Production and the existing Zoho Forms payment workflow must remain untouched during this work.
