# Website membership payments

The website's saved membership application now has a separate Stripe Checkout step. Standard membership costs GBP 20.00 and pensioner membership GBP 15.00. Free student applications do not call Stripe. Fees come from the saved, server-validated application; clients cannot supply an amount or claim that payment succeeded. Joining and renewal are one-off payments, not subscriptions.

`lib/membership-payments/core.ts` validates environment isolation, account identity, receipt cookies, Stripe signatures and payment evidence. `server.ts` authorizes the saved application's receipt capability, persists a checkout intention, creates an idempotent Checkout Session and binds it to the application. Anonymous browsers cannot read the payment tables or call the recording RPC. Pending, paid, failed, expired, refunded and disputed outcomes are separate from application submission and Bigin delivery.

## Configuration

Production uses a dedicated live restricted key for the existing ICSH Stripe account. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as Vercel Secrets scoped to Production. Set `STRIPE_ACCOUNT_ID`, `STRIPE_SITE_URL` to the canonical public production origin, and `STRIPE_MEMBERSHIP_PAYMENTS_ENABLED=true` only after verifying account credentials, database grants and webhook delivery. Preview must use its separate sandbox account, test key and test signing secret. The code rejects live keys on Preview and test keys on Production. Missing or invalid settings hide the payment action and deny checkout creation.

The website key requires Checkout Sessions Write, Products Write, Prices Write, Payment Intents Read, Charges and Refunds Read, and account retrieval access. Do not rotate, replace or reuse Zoho's existing key. Chat's Stripe OAuth connection is separate from the website's credential.

Add a NEW snapshot webhook for `/api/stripe/membership-webhook` with API version `2026-09-30.endive` and events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`
- `charge.dispute.created`

Leave `https://forms.zoho.eu/zfstripehook` and its event selection unchanged. The website ignores other integrations' sessions. A raw-body HMAC check validates the signing secret, timestamp, mode and account. The server then retrieves the current session, expanded PaymentIntent and latest charge and validates purpose, saved application, amount, currency, successful capture, payment time and refund/dispute state. Unsaved website events return a failure so Stripe retries. The return page only reads the durable ledger; it cannot write payment success.

The production domain and webhook must be publicly reachable without Vercel SSO. Keep Preview protected. No DNS switch to `www.icsh.org.uk` is implied by this deployment.

## Database and verification

`database/membership-payments.sql` creates an additive ledger and transactional functions. It does not alter the existing application model or any Bigin record. `tests/membership-payments-database.sql` verifies preparation, account isolation, pending/paid state, amount checks, replay, stale events, refunds and access denial inside a rolled-back fixture transaction. Automated tests verify signatures, environment checks, cookie tampering, provider evidence, redirects and retry keys. No real live charge is submitted for deployment verification.

## Activation and operations

This release collects and records membership payments. It does not activate or update Bigin membership. Organisers must review confirmed payment, the verified charge time and eligibility, then apply the existing twelve-calendar-month membership policy. The organiser application list shows payment state and verified payment time separately from Bigin delivery. The legacy application `payment_status` remains its submission-time awaiting-payment/not-required classification; the new payment ledger is authoritative for subsequent Stripe outcomes.

Checkout cancellation reuses the same open Stripe session when retried from the original saved confirmation. A checkout that has expired, or whose mapping was interrupted for over 22 hours, is held for organiser review instead of risking a second charge after Stripe's idempotency window. The caller's application capability is not placed in payment URLs; a signed HttpOnly cookie allows the same browser to view the return result. Lost browser confirmation or an expired receipt requires organiser assistance. Automatic email enrolment and membership activation remain separate.

Pause new checkouts by setting `STRIPE_MEMBERSHIP_PAYMENTS_ENABLED=false` and redeploying. Keep the key and signing secret configured so already-started payments continue to reconcile. Never disable the existing Zoho webhook during rollback. Refund and dispute records require organiser review and never automatically activate membership.
