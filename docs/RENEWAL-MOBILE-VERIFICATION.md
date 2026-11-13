# Renewal mobile-number changes

Email remains the unique identifier; name matching is retained. A changed/missing CRM mobile no longer blocks eligible renewal. Only an exact email match to one Bigin Contact may proceed. New-member duplicates, 30-day renewal window, failed-payment retries, verified paid/free activation, member numbers and WhatsApp consent remain.

The eligibility response exposes only a mobileChanged flag, never the stored number or Contact ID. A native modal asks whether the entered number is new. Edit returns focus to the mobile field; confirming sends a six-digit code to the matching membership email. Correct verification advances to review. Changing kind, name, email or number invalidates the browser's proof. The opaque proof token stays in memory and the submit request, never browser storage, receipts, CSVs or saved application answers.

Codes use cryptographic randomness and a purpose-bound keyed digest. Ten-minute expiry, five guesses, per-address request cooldown, five sends per recipient per day and existing private request limits. Only accepted code delivery permits verification. Proof must be used to save an application within 30 minutes; the resulting binding remains valid for the saved application's later payment. Incorrect/expired codes, forged/missing proof, changed email/number and duplicate Bigin matches cannot create a changed-number renewal. Application attachment is transactional. Payment retry compares personal answers and preserves the original bound verification.

Private RLS-protected icsh_membership_mobile_verifications is service-role only. No old phone, hash, code, Contact ID or proof is returned publicly. No raw code is saved or logged. Codes and proofs are not promotional subscriptions.

Membership activation may match the verified old-or-new mobile against the email-selected Contact, using its saved proof and Contact binding. Membership fields are updated/read back before activation is marked active. Only then may a separate durable mobile change claim update the Mobile field. Workflows are suppressed on this PUT. It must match the proven email/name, old-or-new number and active term; an unrelated organiser edit cannot be overwritten. Readback must confirm the new number. Uncertain writes get readback only, not an automatic replay. Number updates cannot run for unpaid/unconfirmed, refunded/disputed or deleted applications.

WhatsApp is held before any invitation claim until the new number is confirmed in Bigin. Daily reconciliation checks mobile changes before invitations, so a verified new number receives subsequent applicable membership messages. Existing invitation claims are never replayed.

Verification used mocked browser responses on desktop/mobile and rolled-back SQL fixtures. No real member/application/payment/phone/email/WhatsApp change was performed as a test.
