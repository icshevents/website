# Direct event saves and visibility

The event editor has one Save changes action and a Website visibility choice: Published, Unpublished or Archive. New events start Unpublished. Published events appear on the public Events page; Unpublished events stay within the hub; Archive sends the saved event to Archived Events in the hub and the public Past Events carousel. Preview remains optional. The event-level Draft / Ready for Review dropdown and separate publishing step are removed; form-template statuses remain separate.

`icsh_hub_save_live` wraps the existing event save and publication functions in one database transaction. It preserves the existing capacity, occupied-ticket, version, pricing, source-form, Iftari and membership checks. It does not create or refund Stripe payments. `icsh_hub_set_visibility` enforces the same Events Hub session in the database. Hidden visibility closes bookings and removes the event from both public upcoming and past sections; Archive closes bookings and retains the published event snapshot for the carousel. Existing events are not automatically published or changed by this migration.

Posters are selected locally, previewed, then uploaded with event details in the same Save request. JPG, PNG and WebP signatures and request sizes are validated server-side. A failed save removes an unreferenced new storage object, while an ambiguous result keeps any object referenced by an event. Remove image/poster clears the selection and image reference on Save; it does not delete planning attachments. The existing private image bucket and authenticated preview route are reused.

The Back buttons record prior hub screens, event selection, task selection, filters and scroll positions. Unsaved event/task edits warn before being discarded. Returning between event information, booking settings and optional preview retains the current editing buffer.

The global planning overview now has a searchable task table with event, assignees, British dates, status and direct Edit task actions. The three dashboard count cards are removed; the existing per-event task board remains in place.

Validation includes multipart parsing, rejected file types/sizes, one-request image saves/removal, direct publication, version/portal/role checks, failed-save transaction rollback, preserved booking answers, all three visibility transitions and the existing regression suite. No production event content or booking records are changed for verification.

Hub screen changes now create browser history entries. Both browser Back/Forward and the in-page Back controls restore the saved view, filters and selected task. Reloading retains the current saved navigation frame. Root navigation uses an explicit Choose hub link; Back no longer falls through to a previous sign-in page when no internal view exists.

Event Calendar is removed from the hub. Unpublished and Archived Events are the user-facing labels; existing stored hidden/archive values remain compatible and older history entries are normalised.

The Iftari menu is editable in Event details. Existing courses are used as the fallback until an organiser saves a replacement. Menu heading, course names, dishes and button visibility save in the existing event JSON; no new service/table or redeployment is needed for subsequent menu edits. Both the closed-booking page and open booking form use the same published menu. Optional private preview shows the edited pop-up. Menu schema bounds headings, courses and dishes; isolated save tests preserve Iftari pricing, capacity and booking evidence.

Every event now has a separate optional Event menu editor. Non-Iftari events start with their menu switched off and no inherited dishes. The existing Iftari menu remains the fallback. Published menus appear in public event cards and detail pages, with independent accessible pop-ups when several events have menus. Poster/image fields remain separate. Empty menu lines are ignored on the server; a completely empty enabled course produces a clear named-course validation message.

Organiser action buttons and table dropdowns are compact and vertically aligned. Booking/review status cells and dates stay on one line; tables retain horizontal scrolling on smaller screens. Event forms actions share a spaced footer row, stacking on mobile.
