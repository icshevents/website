# Membership renewal reminders — 13 November 2026

Uses the existing Zoho CPaaS transactional sender and Bigin membership grant, separately from the paused promotional Campaigns sequence. No subscription upgrades or new providers.

Four notices: exactly 30 days before expiry, 7 days before expiry, on expiry, and 7 days after expiry. Inclusive Hello greeting; member ID and expiry; renewal form link. Student/free wording explains current eligibility and no payment where eligible.

Schedule: daily UK morning slot (09:00 UTC during BST; 10:00 UTC otherwise), with a 15:00 UTC catch-up for remaining/explicitly rate-limited work. Platform invocation precision applies. Three separate daily cron definitions support the existing plan; no hourly-plan upgrade. A timezone check makes only the appropriate morning slot active. The existing 02:00 UTC activation job is retained.

Before sending: complete CRM pagination, unique email, valid current term and verified Completed payment or Student/Not required membership. Check current Bigin fields again after claiming, and check current website renewal/payment state. Verified payment awaiting activation holds renewal notices; a later confirmed expiry stops notices for the earlier term. Duplicate contacts, incomplete CRM responses, cancelled memberships, refunds/disputes and private suppressions do not send. Marketing preferences are not changed: website membership-service requests are separate from marketing; historical contacts with Email Opt Out require recorded membership-service permission.

Private tables: icsh_renewal_notice_settings, icsh_renewal_notices, icsh_renewal_suppressions. RLS enabled and browser roles denied all access. Suppressions are keyed by lower-case email. Durable notice uniqueness is contact + expiry + stage. Accepted/uncertain/abandoned requests cannot automatically resend. Only an explicit provider rate-limit rejection can retry on the same stage date, maximum three attempts. Each send rechecks state. No historical mass backfill or reminders later than seven days after expiry.

Early renewals: verified same-person renewal opens in the final 30 days. New-member duplicate protection remains. A claimed activation saves renewal_base_expiry once and extends it by one calendar year; remaining days are preserved, including leap-day handling. Paid activation continues to start on the verified payment date; its saved expiry includes remaining days. Existing identity checks, verified payment/free eligibility, membership type, member ID and WhatsApp controls remain. No recurring charge is created.

Tests: exactly one each to admin@icsh.org.uk, fictional DEMO0001 details and [TEST] subjects. All four accepted by Zoho and found in the admin inbox. Tests did not create a member, application or payment. Temporary test access revoked after verification; durable test uniqueness prevents repeats.

Operation: disabling icsh_renewal_notice_settings.enabled stops future sends. Review rows with review_required before any manual action; never replay uncertain sends blindly. The test endpoint is fixed to the admin address, uses a short-lived hashed one-purpose token and is disabled after setup. Cron endpoints require the existing private CRON_SECRET.
