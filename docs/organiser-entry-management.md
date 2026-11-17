# Entry management across both hubs

Membership, Rishta, donation and event/Iftari entry tables now share search, CSV, an Entry status selector and Delete entry. The separate original booking/payment statuses remain visible.

Cancelled and Refunded are workspace labels. They do not issue Stripe refunds, alter verified payment evidence, release reserved tickets, deactivate Bigin memberships, or change submitted answers. The interface and confirmations state this clearly. Original status removes the workspace label. Every action records a timestamp and the portal actor.

Delete entry hides the row from Current entries and its CSV. Deleted entries is a separate view with Restore entry and a separate CSV. Original submissions and linked financial records are retained. Existing historical membership deletions remain unchanged; this feature does not resurrect previously removed applications.

The server actions validate the appropriate existing portal session, UUIDs, bounded action enums and edit versions. Database functions repeat portal/type/event/source-entry checks. Events identities can manage only event and Iftari entries, never membership, donation or Rishta entries. The new server-only management table uses RLS, no public or authenticated table grants, and service-only security-invoker functions with an empty search path. Concurrent and stale writes are rejected.

Verification uses isolated PostgreSQL tests covering all five entry types, restore/reset, concurrent versions, cross-portal and cross-event denial, anonymous/authenticated denial, audit records and unchanged source payment/booking data. Production QA is read-only.
