# Form confirmation emails

Owner decision, 26 October 2026: send acknowledgements only to the person submitting. Use Zoho CPaaS (formerly ZeptoMail) for transactional email; keep the existing Campaigns account separate for marketing. No list subscription or marketing-consent change is part of this integration.

## Implementation

`database/form-confirmation-emails.sql` adds a private, RLS-protected queue and four insert triggers. A donation request, rishta profile or event submission queues one acknowledgement in the same transaction as its saved record. Membership uses the separate payment-and-activation flow below. Participation, stall and ticket forms are covered, including future forms using those existing types. The unique source-table/source-ID pair prevents duplicate queue entries on retries. Existing records are not backfilled. Donors without an email address, test-mode submissions and reserved example addresses do not queue messages.

The queue stores only the destination, form kind, reference and event title. It does not copy profile answers, photos, dates of birth, phone numbers, payment data, or receipt capabilities. Rishta uses a neutral subject and brief acknowledgement. Non-membership acknowledgements do not claim successful donation payment, confirmed tickets or stall approval. Paid membership confirmations acknowledge verified payment and completed activation together.

After a successful POST, Next.js `after()` processes one queued message without blocking the form response. Workers atomically claim with `FOR UPDATE SKIP LOCKED`. Only an explicit HTTP 429 retries automatically, with a bounded exponential delay. A timeout, server error, ambiguous success or interrupted worker becomes `review_required`, avoiding a blind duplicate send. Provider acceptance is stored as `accepted`, not delivered. `client_reference` is a correlation ID, not an assumed provider idempotency guarantee.

The existing daily membership recovery job also attempts up to ten emails independently. The protected `/api/cron/form-emails` endpoint supports an additional frequent scheduler if the hosting plan allows it. Delayed automatic recovery is daily under the existing schedule; a frequent recovery schedule is recommended before higher-volume use. Messages more than 48 hours past their scheduled eligibility are marked stale rather than sent unexpectedly. Organisers currently inspect failures through the private database/provider logs; no public queue endpoint exists. Review queue retention and operational monitoring before launch.

## Activation

1. Complete ICSH's Zoho CPaaS setup in its EU region. Add and verify `icsh.org.uk` using the exact TXT/CNAME records in the Zoho dashboard. Preserve existing website, MX, SPF and other domain records.
2. Associate the domain with a sending Agent and complete any Zoho account-validation requirements. Confirm that the Agent can send; a shutdown Agent cannot send.
3. Save the Agent's Send API key privately in the existing Vercel `website` project's Production environment as `ZOHO_TRANSACTIONAL_SEND_KEY`. Do not put it in chat, source, screenshots or logs.
4. Set `ZOHO_TRANSACTIONAL_API_ORIGIN=https://cpaas.zoho.eu` and the verified sender in `ZOHO_TRANSACTIONAL_FROM`. The intended sender is `events@icsh.org.uk`; its domain must be verified first.
5. Deploy this tested source to the existing development website. Set `ZOHO_TRANSACTIONAL_EMAIL_ENABLED=true` only once the configuration is ready. Keep the database setting disabled while arranging an explicitly designated internal recipient test.
6. Verify a single internal test email is accepted and received, then enable new-submission queueing with `update public.icsh_form_email_settings set enabled=true where id=true;`. Verify each live form path using clearly designated test submissions, inspect recipient delivery, and clean up test records deliberately. Existing application records are never emailed retrospectively.

Stopping delivery: set the runtime enabled flag to false and redeploy. Disable the database setting as well to stop queue creation. Preserve uncertain outcomes for provider-log reconciliation before any manual resend.

## Verification to date

The TypeScript check passed. All 319 application tests, including five new email-adapter tests, passed. A production build passed using Webpack; the default Turbopack build could not resolve the pre-existing node_modules symlink outside its configured filesystem roots. Database fixtures exercised all six source paths, skipped test/blank/example recipients, rejected the wrong claim, prevented reclaiming accepted mail, held interrupted sends for review, and checked public access denial. Fixtures were rolled back. The additive schema was then installed with queueing disabled and zero emails queued. The subsequent membership lifecycle migration was separately verified with rolled-back fixtures.

No real email delivery or deployed email integration is established by these offline and database checks. Domain verification, Agent sending status, secure key configuration, deployment and an internal delivery test are still required.

Primary references: [Zoho CPaaS send API](https://www.zoho.com/cpaas/help/api/email-sending.html), [regional endpoints](https://www.zoho.com/cpaas/help/api/multiple-data-centers.html), [authentication](https://www.zoho.com/cpaas/help/api/api-authentication.html).

## Paid membership policy — revised 26 October 2026

The owner superseded the initial membership acknowledgement. Apply `database/membership-payment-emails.sql` after the original queue setup. No email is sent on membership form submission. Instead:

- A paid application schedules one reminder eligible after 24 hours if checkout is never completed. A recorded failure or expiry advances eligibility to 30 minutes later. These are grace periods, not guaranteed delivery times: the current recovery schedule is daily, and a more frequent worker is required for precise reminder timing. A card decline that does not produce a stored failure still uses the delayed fallback.
- Verified payment suppresses outstanding reminders immediately. A payment still processing after a completed asynchronous checkout is also excluded from reminders.
- One combined “Payment received – your membership is active” email queues only after the existing activation process records `active` against the same verified live payment, account and PaymentIntent. Payment alone, pending activation or activation errors cannot generate that success email. Refund/dispute state suppresses unsent success emails.
- Queue uniqueness and final pre-send eligibility checks prevent repeated webhook deliveries from duplicating confirmations and suppress stale reminders. A reminder already sent before a later successful payment is followed by the combined confirmation.
- Reminder wording asks the applicant to use their original website confirmation, or contact ICSH with their reference. It does not invent a usable recovery link: receipt capabilities are deliberately not stored in the email queue. The existing expired-checkout flow may require organiser assistance.
- Free memberships are excluded from payment reminders and payment-received emails. Their activation-only email requires a separately verified free-activation lifecycle; it is not implemented by pretending a zero-fee application was paid.

The Stripe webhook route now schedules email processing after its successful response. The existing daily recovery job also processes queued mail. No old applications are backfilled. Sending stays disabled until domain verification, secure key setup, deployment and delivery testing are complete.

## Repair and confirmed membership fields — 26 October 2026

Restored the email worker and form/webhook hooks into the section-title release, retaining its current design. Restored the earlier unpaid membership retry implementation that was absent from this source snapshot.

Paid-member messages now require the member number confirmed in Bigin and dates from the matching active membership record. A service-role-only function returns those fields only to the worker holding the email claim, after the existing verified-payment checks. Missing details hold the email for review. No dates or member numbers are inferred from form input.

The internal POST `/api/admin/form-emails/setup-test` is disabled unless `FORM_EMAIL_SETUP_TEST_ENABLED=true` and a separate 32-character-or-longer bearer secret matches `FORM_EMAIL_SETUP_TEST_SECRET`. It only accepts one supported kind; the recipient is fixed to events@icsh.org.uk. All content is marked TEST with fictional details. Each kind can be attempted once per setup secret, with its claim recorded before contacting Zoho. It never changes membership or payment data. Turn the test flag off after testing. The public form queue stays disabled until provider acceptance and delivery are checked.

DNS DKIM and bounce records are present at the authoritative nameserver, Google Public DNS and Cloudflare. Zoho shows both verified but its overall check still reports MailHosting failed. The original agent_1 was permanently shutdown; an active replacement ICSH_Website_Forms was created and linked to icsh.org.uk. This did not clear the overall Pending status. Do not change Google Workspace MX records to address this transactional sending error.

## Live delivery verification — 27 October 2026

The user saved the sending key as a Production secret and submitted the Zoho Customer Validation form. Zoho now shows the domain verified. Its submission confirmation permits up to 100 messages/day and 10000 trial messages total while review is pending, with review/follow-up within 3 business days.

Live testing found two adapter issues and fixed them: copied Authorization header prefixes/outer whitespace now normalise before validating the sending key; dotted Zoho request identifiers are recognised in both the adapter and the private finish function. Embedded whitespace and malformed responses still fail safely. The delivered first membership test was reconciled from its Gmail message and X-App-Message-ID rather than resent. The other five test kinds were accepted by Zoho and received in the events@icsh.org.uk inbox. The paid-member message contains the member number and dates; DKIM, SPF and DMARC passed in the delivered membership message headers. Tests use fictional data and did not activate membership or take payment. 332 application checks plus the rolled-back receipt-format database checks passed; local and hosted production builds passed.

No historical applications were backfilled. Internal setup testing must be disabled on the final production release. Existing free-membership and daily reminder-worker limitations above remain applicable.


## Free membership activation (27 October 2026)

Eligible live zero-fee student applications use the durable free activation flow in `database/free-membership-activation.sql`. Once the matched Bigin membership is Active with a confirmed member number and saved term dates, one `membership_active` email is queued for that application. Its private details include `activation_kind: free`; the existing worker selects “Your membership is active” and activation-only wording with number, start and expiry. It does not require or claim a payment. Paid applications retain verified-payment requirements and wording. No incomplete-payment reminder is queued for a zero-fee application. Unique source/application records prevent repeat activation emails on retries.

Activation-only messages contain confirmed membership details and no payment wording. The temporary setup-test endpoint is disabled in production. Only the durable activation lifecycle queues these messages.
