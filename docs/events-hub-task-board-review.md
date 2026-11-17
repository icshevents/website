# Events Hub task board revision

Implemented locally for the current request. No live migration, new file upload, form copy or event deactivation has been performed by this revision.

- Task table columns: Task, Task Description, Relevant Files, Assigned To, Due Date, Status. Status options are Not Started, In Progress and Done, mapping Done to the existing completed status.
- Compact task editor, explicit DD/MM/YYYY input, task-specific inline feedback and viewport notifications after saves. The separate private-planning section is removed from the interface; its existing stored data is retained.
- Floating success/error/progress notifications for Events saves, form copies, uploads, availability changes, access management, entry reviews and Admin membership actions/CSV preparation. Success is reported after confirmed action completion.
- Event homepages use two boxes: description/details on the left and planning summary/progress on the right. Edit Website Event Feature and Manage Event Forms are below the left box; Manage Tasks is below the right box.
- Active switches on event cards and event pages. Deactivation uses the existing complete action, hides the public event and places it under Past Events. Existing hidden published events also appear under Past Events. Reactivation uses restore. Dates alone never deactivate events; records, forms and tasks remain stored.
- Duplicate form for listed custom, ticket, participation and stall forms. Copies are drafts with their own form identity, entries and form-specific CSV filename. A ticket copy targets a different, unpublished ticket event with no existing bookings; it reuses that target's empty draft form and preserves the target event's dates, pricing and capacity. It copies the source questionnaire without changing any existing booked event.
- Annual participation forms use a slug-scoped public route/API context. The original 2026 participation and receipt URLs continue to work. Copied questionnaires and booking engines reuse the original services; no Stripe payments/refunds/settings or Bigin records are changed.
- Relevant Files accepts PDF, JPG/JPEG, PNG, WebP, DOCX, XLSX, PPTX and TXT, up to 10 MB each and 20 files per saved task. Files download through an authenticated task-scoped route. Attachments have uploader name/time and remain restricted to the team. Save a new task before attaching files.

## Database release

`database/events-hub-task-files-and-duplicates.sql` adds `icsh_task_files` with RLS/no anon or ordinary authenticated grants, a private `icsh-task-files` storage bucket, token-checked file/copy functions, and replaces the existing safe public projection/form availability functions. Existing form/submission/task rows are not copied or removed automatically. The new copy action is explicit and audited.

Apply the additive SQL before the new application release. No environment-variable or subscription changes are needed. Source-only rollback is possible: retain the new table/bucket/files and restore the old application; original event routes remain available.

## Validation

- Full regression: 517 tests, 515 passed, 0 failed, 2 existing skips.
- Isolated Postgres tests execute the new SQL and exercise private file scope/role denial, form-copy identity/empty records/draft state, template routing and status updates, and event completion/reactivation.
- Attachment signature/type validation and per-year participation state/write isolation are tested. Public JavaScript syntax checks pass.
- The actual task-table component was visually inspected with fictional examples. Status changes and task-save inline confirmation were verified. Date/status inputs have equal top edges and 40 px heights.
- The cloud browser subsequently blocked the preview through its URL security policy. No workaround was attempted. The final floating notification/homepage/toggle visual recheck remains limited by that restriction; those changes are covered by the production build and source review.

## Publication status

Automatic approval review rejected uploading this revised source/database implementation to GitHub because it requires explicit approval of this new version. The source remains local. No new live database setup, file upload, form copy, event deactivation or deployment has been performed. A reviewed source patch is available beside the checkout.

## Approved live release — 17 November 2026

User explicitly approved deployment and asked that future requested changes be implemented and deployed directly. Source commit `11234001ec7f950733cdb644794133e9dd2aab19` deployed successfully as `dpl_6rNzcW4XtvVHaez2hgSjQSuhqH4N`. The task-file/copy database setup was applied. Existing counts remain 6 forms, 13 submissions and 1 task; the attachment bucket is private.

Live checks confirmed the two equal-width homepage boxes and correctly grouped action buttons, the six requested columns, Active switches and Past Events, and unsigned attachment requests returning 401. The existing sample task was saved unchanged to verify real persistence and the floating/inline success notifications. This exposed an ambiguous `updates` variable in the original task-update SQL; `database/events-hub-task-save-fix.sql` fixes it, and a regression test now exercises the update path. The live save then succeeded. Attachment uploads and form duplication were validated with isolated data rather than creating production test files/forms.
