# Private event booking limits

Maximum ticket bookings is edited in Event details and shown only in the organiser hub. Existing configured limits are reused; no production event limit or booking is changed by installation. Paid/free online events still require a limit; other sign-up events may leave it blank.

A shared event limit counts live active ticket attendees, Iftari guests, and one place for each other linked event-form submission. Pending Stripe checkouts reserve their places. Failed, cancelled, expired and refunded source records do not consume places; internal review labels and recoverable list deletion do not alter paid reservations. The public payloads suppress numeric capacity. Published public descriptions are retained verbatim.

Effective form availability closes at the limit. Public pages show an accessible pop-up with: “We've reached the maximum bookings for this event. Please contact events@icsh.org.uk.” Submission APIs and a database insert trigger repeat the check, including stale forms. Advisory transaction locks prevent different linked forms from taking the same final place; a competing write is asked to retry. Lowering a published limit below existing bookings/reservations is rejected. Existing payment updates and refunds are not issued or blocked by this feature.

Increasing the limit or a verified release makes places available again without republishing the form. Existing idempotent responses can still be recovered after a final place is taken.

Validation includes full-limit and over-limit submissions, adults/children sharing capacity, pending reservations, linked custom forms, parallel final-place attempts, Iftari, idempotent replay, lowering limits, and portal/database role denial. Production verification is read-only.
