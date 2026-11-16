# Winter lunch paid booking confirmations

New winter lunch bookings queue one confirmation only when the shared Stripe payment ledger has verified a live, fully paid charge and the registration changes to confirmed_paid. The booking contact's saved email is the only recipient. The queued snapshot includes reference, venue/date/time, ticket quantities, saved unit prices and total paid. No guest names, phone numbers, allergies, private receipt capability, card data or marketing subscription is copied.

The dedicated service-only queue is unique per submission. Retries and duplicate webhooks cannot generate a second confirmation. The worker rechecks payment, refund and booking status before sending. Ambiguous send outcomes are held for review; only explicit provider throttling is retried. Provider acceptance does not establish delivery. Existing acknowledgement and membership email workflows are preserved.

The existing Stripe webhook schedules processing after a successful response. The existing protected email recovery endpoint processes up to five confirmations, and the existing daily membership recovery task attempts one. No new scheduler or provider is introduced. Runtime sending uses the existing verified ICSH transactional sender and enabled flag. The lunch form's paidConfirmationEmail flag gates queue creation. There is no historical backfill or retrospective sending.

Validation: content tests, existing application suite, TypeScript, production build, and rolled-back database fixtures covering unpaid exclusion, duplicate suppression, proof ownership, refund suppression and public access denial. No real email or payment was generated for verification.
