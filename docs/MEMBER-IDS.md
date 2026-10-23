# Website Member IDs

New website membership contacts receive a Member_ID formed from the first two letters of each name, uppercased, followed by four cryptographically random digits. Tricia Hilario can receive TRHI1254. Leading zeroes are retained. Spaces and punctuation are ignored, accents are folded, and a one-letter name is padded with X. Other Unicode letters are retained. Names without letters require review.

IDs are assigned once and preserved for renewals and repeated delivery. Existing Bigin Member_ID values are retained. The private registry reserves each generated ID before a write, with uniqueness across website contacts. A Bigin search also checks existing IDs before assignment. Collisions found before a write select another candidate; uncertain writes reuse the same reservation and verify the remote value before completing. Identity is checked before writes and readback. Only Member_ID is updated, with workflows disabled; membership status, payment, dates, names, contact details and communications consent are unchanged.

The creation flow attempts assignment after the new contact is verified. Paid activation ensures assignment for the matched contact. The existing private daily recovery job handles missed assignments, including linked website contacts created earlier. Existing contacts outside website-linked applications are not bulk-modified. The organiser membership view displays confirmed IDs.

ZOHO_BIGIN_MEMBER_IDS_ENABLED enables assignment in Production. /api/cron/member-ids is protected by MEMBER_ID_JOB_SECRET and supports a bounded recovery run. Existing Stripe, Zoho Forms and OAuth credentials are not rotated.
