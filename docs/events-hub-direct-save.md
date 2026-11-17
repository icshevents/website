# Direct event saves and visibility

The event editor has one Save changes action and a Website visibility choice: Published, Hidden or Archive. New events start Hidden. Published events appear on the public Events page; Hidden events stay within the hub; Archive sends the saved event to Past Events and the public carousel. Preview remains optional. The event-level Draft / Ready for Review dropdown and separate publishing step are removed; form-template statuses remain separate.

`icsh_hub_save_live` wraps the existing event save and publication functions in one database transaction. It preserves the existing capacity, occupied-ticket, version, pricing, source-form, Iftari and membership checks. It does not create or refund Stripe payments. `icsh_hub_set_visibility` enforces the same Events Hub session in the database. Hidden visibility closes bookings and removes the event from both public upcoming and past sections; Archive closes bookings and retains the published event snapshot for the carousel. Existing events are not automatically published or changed by this migration.

Posters are selected locally, previewed, then uploaded with event details in the same Save request. JPG, PNG and WebP signatures and request sizes are validated server-side. A failed save removes an unreferenced new storage object, while an ambiguous result keeps any object referenced by an event. Remove image/poster clears the selection and image reference on Save; it does not delete planning attachments. The existing private image bucket and authenticated preview route are reused.

The Back buttons record prior hub screens, event selection, task selection, filters and scroll positions. Unsaved event/task edits warn before being discarded. Returning between event information, booking settings and optional preview retains the current editing buffer.

The global planning overview now has a searchable task table with event, assignees, British dates, status and direct Edit task actions. The three dashboard count cards are removed; the existing per-event task board remains in place.

Validation includes multipart parsing, rejected file types/sizes, one-request image saves/removal, direct publication, version/portal/role checks, failed-save transaction rollback, preserved booking answers, all three visibility transitions and the existing regression suite. No production event content or booking records are changed for verification.

Hub screen changes now create browser history entries. Both browser Back/Forward and the in-page Back controls restore the saved view, filters and selected task. Reloading retains the current saved navigation frame. Root navigation uses an explicit Choose hub link; Back no longer falls through to a previous sign-in page when no internal view exists.
