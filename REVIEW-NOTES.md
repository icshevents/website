# ICSH website verification — 16 October 2026

The latest membership brief supersedes earlier proposed-rate and simulation work. The actual development website remains website-nine-beta-11.vercel.app in the existing website project and icshevents/website repository.

Implemented: original required personal fields/new-renewal options/UK country code and terms retained; mandatory British DOB with manual entry/date picker; confirmed central pricing; conditional education/student declaration; universal accuracy declaration; five steps with Back, review/edit and in-memory answer retention; on-screen completion; confirmed homepage/card/popup wording; privacy information. Original source inventory and authorised adaptations are documented in docs/MEMBERSHIP-FORM.md.

No submission endpoint, transport, CRM/payment connection, permanent applicant storage, membership activation, date allocation, email or receipt. No changes to the official icsh.org.uk site or old registration system. The previous simulation route and mock workflows were removed.

Validation: thirty unit checks cover all eight requested pricing cases, DOB and birthday boundaries, missing fields/declarations, edit reset, no transport/persistence and removed endpoint. Browser checks cover all five steps, declaration gating, UK picker/manual entry, review/edit, retained answers, category changes, completion and session reset, desktop and mobile. Production build and full route/deployment results are recorded in the final handover.
