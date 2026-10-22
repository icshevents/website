# Membership form — original inventory and implementation

Updated 22 October 2026. This documents the membership form and fictional test-application implementation for the existing ICSH development website, https://website-nine-beta-11.vercel.app/. The same GitHub repository (icshevents/website) and Vercel project (website, prj_DCOHiPxvqSLB5or751jMeLsDeYzr) are retained. The additive database setup and database assertions are verified; deployment/browser verification remains outstanding, and Bigin contact creation still requires separate authorisation. No separate website or preview project is created.

## Original form inspection

The Join links on https://www.icsh.org.uk/ point to https://zfrmz.eu/oovk3j9ncZ265ImJpKtG, redirecting to https://forms.icsh.org.uk/icshportal1/form/ICSHAnnualMembershipFormAUTOMATED1/formperma/pCBllZBF3fei7OneZ6GMEv4GABvBqDRxNfB6wzNfp5I.

Inspected read-only in the browser, including New Member and Membership Renewal conditions, the complete rendered DOM field list, country-code options and the second-page terms/payment controls. No personal information was entered and the form was not submitted.

| Original question / element | Original options or content | Required? | Redesigned placement |
| --- | --- | --- | --- |
| Not sure if you are a member already? | Click here to check your Membership Status | Informational link | Step 1: same question, lookup unavailable until integration opens, contact guidance |
| Membership Category | New Member; Membership Renewal | Yes | Step 1, exact options retained, initially unselected unless explicitly arriving from Join/Renew |
| New Member Information | Heading shown for new members | Conditional information | Step 1 conditional heading |
| Membership Renewal | Heading and renewal instructions | Conditional information | Step 1 when renewal selected |
| Name — First Name | Text | Yes | Step 1 |
| Name — Last Name | Text | Yes | Step 1 |
| Mobile Number | Country selector: United Kingdom +44; phone input | Yes | Step 1, UK +44 retained as the only observed country option |
| Email | Text | Yes | Step 1 |
| Member Search Tool | Existing membership search form link | Conditional informational link | Step 1 renewal guidance; public member lookup remains unavailable |
| Secure Payment Gateway | Zoho Checkout; GBP; Amount to be paid; fixed 15.00 in source | Yes in original | Replaced by read-only automatically calculated annual fee in steps 2–4. No gateway, provider redirect or payment controls, as explicitly required |
| Terms and Conditions | Membership Period; Refund Policy; Communication and Notifications | Yes | Step 3 with required original checkbox; reviewed in step 4 |
| Terms checkbox | I understand and agree. | Yes | Step 3, exact checkbox wording, unticked by default |
| Navigation | Next, Back, Submit | Navigation | Back / Continue, final Submit Test Application; saved reference only after confirmed website save |

No address, other personal questions, additional choice questions, education fields or proof upload was present in either condition of the inspected form. No extra original fields have been guessed. Date of birth, education eligibility, student declaration and general accuracy declaration are additions expressly requested in the new brief.

Original renewal guidance: “Use the email address from your original membership signup. If you can't remember it, use our membership search tool below to find your details. If no records are found, you can opt in for a new signup.” The current test form requests fictional details and an `@example.invalid` email, explains that lookup remains unavailable, and retains Switch to New Member. A pending renewal never changes an existing member’s status or dates.

Original mobile guidance: “Please provide your direct mobile number so we can add you to the official ICSH WhatsApp Group! This is where we share instant event updates, community news, and member-only announcements. You can remove yourself manually if you wish.” The current form requests a fictional mobile number for testing and explains the future communication purposes. The original terms remain available in step 3; no communications enrolment occurs through a test application.

### Original terms and authorised changes

Original membership period: “Membership is valid from 1st January to 31st December of each calendar year, regardless of the date of registration.” This is replaced by the owner’s 22 October 2026 decision: paid membership and renewals last twelve calendar months from confirmed membership fee payment. Free membership retains confirmed activation as its start. Saving a test application does not allocate a membership period.

Original refund policy, retained: “Membership fees are non-refundable under any circumstances once payment has been received.”

Original communication policy, retained: “By completing the membership registration, members will be automatically enrolled in the ICSH official WhatsApp group and email subscription list to receive updates and relevant communications. Members may opt out of these communications at any time.” The form explains that a saved test application does not activate membership or enrol anyone. ICSH must review the communications policy, lawful basis and preferences before enabling live registration.

## Implementation

- `lib/membership-pricing.ts`: single confirmed configuration, £20 standard / £15 from age 65 / £0 for full-time students aged 17–21 inclusive and for minors aged 16 and below; twelve months.
- `lib/membership.ts`: strict calendar parsing, DD/MM/YYYY conversion, complete-birthday age calculation, eligibility, GBP presentation and exact owner-supplied declaration texts. No activation or expiry calculation.
- `lib/membership-validity.ts`: a separate date resolver for trusted Bigin creation/corrected dates and verified membership payment dates. It calculates the twelve-calendar-month anniversary and date-window status without activating a membership or verifying identity/payment. See the 22 October decision below.
- `lib/membership-validation.ts`: required field, per-step and final validation; answer updates clear stale student/accuracy declarations. The education confirmation checkbox sits directly below DOB, starts unchecked (No), and is available only at ages 17–21 inclusive. Unchecked is a valid standard-rate answer. The existing Yes/No education question in step 2 is retained and synchronised with the checkbox. DOB changes below 17, to 22 or above, invalid or blank reset education to No. Both controls immediately update the shared price summary; the student declaration reflects ages 17–21 inclusive; the general accuracy declaration remains unchanged. A 200ms collapse/fade transition respects reduced-motion preferences.
- `components/MembershipForm.tsx`: personal details → eligibility → membership information → review/declaration → confirmed website receipt. Answers remain in memory until explicit submission, and back/edit preserves them. The test acknowledgement starts unchecked. Submission requires fictional details and an email ending `@example.invalid`; no personal answers or receipt tokens enter browser storage. Errors retain answers and the request key for an unchanged retry. Review remains available after success; only an explicit reset or leaving/reloading clears the open form.
- `lib/membership-applications/`: current application model, server validation, private receipt projection, database adapter and organiser access. The server recalculates category and fee and saves `awaiting_payment` or `not_required`, `application_status=received`, and null start/expiry dates. A public response confirms success only after the save commits.
- `database/membership-applications.sql`: additive `icsh_membership_applications` table and server-only save/sync-claim/sync-completion functions in the existing database. RLS and grants deny browser roles direct access. The script depends on the existing event runtime’s audit and request-limit support and does not alter existing event registrations or memberships.
- `lib/zoho/membership-applications.ts`: separate organiser-controlled test delivery, gated by narrow OAuth scopes and `ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED=true`. It searches before creating an eligible new pending contact and reads the contact back before confirming Bigin delivery. Renewals, existing matches and uncertain results require review; it never updates an existing contact.
- `lib/membership-integration.ts`: unused legacy types retained for compatibility, with pointers to the current application model. It is not an activation or submission implementation.

Removed the previous sample applicants, mock CRM/payment workflow, simulation buttons, proposed-rate notices and `/api/membership/preview` route. The old endpoint must return 404 after deployment. Privacy text and homepage/invitation membership copy reflect the final interface and confirmed rates.

### Saved test applications and Bigin delivery

| Action | Route | Result |
| --- | --- | --- |
| Submit Test Application | `GET` then `POST /api/membership/applications` | Creates a necessary security cookie and validates CSRF; saves one durable test application and returns its reference |
| Check Bigin delivery | `GET /api/membership/applications/[id]` with the in-memory receipt token | Reads only the limited website receipt; never resubmits or calls Bigin |
| Review saved applications | `/admin/memberships`; `GET /api/membership/admin` | Approved organisers can inspect saved answers and separate delivery status |
| Send or verify a selected test application | `POST /api/membership/admin/[id]/sync` | Requires organiser access and the enabled write gate; records the controlled Bigin outcome |

The initial Bigin state is `awaiting_authorisation`. The verified grant currently covers metadata only. Before the organiser test route can create a contact, authorise and securely configure `ZohoBigin.modules.contacts.READ`, `ZohoBigin.modules.contacts.CREATE` and `ZohoSearch.securesearch.READ`, retaining metadata READ scopes for connection checks. No UPDATE, WRITE or ALL scope is required. Keep the write flag false until the separate controlled test is authorised and configured. See [Zoho connection setup](ZOHO-CONNECTIONS.md) for the exact sequence.

An approved new test contact receives only supported name/email/mobile fields, `Membership_Status=Pending application`, `Payment_Status=Awaiting payment` or `Not required`, and `Email_Opt_Out=true`. The create request uses `trigger: []`; existing external syncs still require review. DOB, declarations, category, fee and membership dates are not guessed into unmapped Bigin fields. Full answers remain in the private website application.

The saved website reference is not a membership number or proof of Bigin delivery. A receipt shows delivery confirmed only after the returned contact ID has been read back and verified. Concurrent delivery attempts use a durable claim. An uncertain create outcome without a saved contact ID requires manual reconciliation; it cannot automatically create another contact. A saved contact ID permits verification reads only.

## Decisions before enabling live registration

ICSH must approve the under-18 parent/guardian consent and safeguarding process, lawful basis, data retention, member privacy information and communication preferences. Age-17 scenarios may be tested with fictional details; no extra guardian question has been invented. Before accepting real applications, agree member identity verification, shared-email/duplicate handling, approved CRM fields, verified payments and activation rules. A paid renewal starts from its confirmed payment date under the 22 October decision; it does not automatically add a year to the previous expiry. Stripe, live event membership lookup, Campaigns enrolment and email delivery remain disabled.

The original public ICSH site, its Zoho Form, Bigin records, merchant settings and live membership system remain unchanged.

## Verification

Run `pnpm test`, `pnpm typecheck` and `pnpm build` for the current source. Focused membership tests cover pricing, exact birthdays, British date parsing, eligibility, required fields/declarations, answer retention/reset, explicit submission, receipt reads and absence of personal browser storage. Persistence and Bigin adapter suites exercise retries, access boundaries, pending states, readback and uncertain outcomes using synthetic dependencies. The reviewed schema was applied to the existing database on 22 October 2026; `tests/membership-applications-database.sql` passed with all fixtures rolled back.

The earlier interface-only version was browser-checked at desktop, tablet and phone widths for all steps, calendar entry, declarations, review/edit and pricing changes. Those historical checks did not send application POSTs. The new saved-application flow requires its own deployed browser → API → database confirmation; a Bigin create/readback additionally requires the new grant and enabled write gate. This document does not claim those end-to-end checks have completed. No real data was entered in the original public form.

## Confirmed minimum applicant age — 21 October 2026

Joining and renewal accept ages 17 and above only. Ages 16 and below are blocked with: “Minors aged 16 and below are eligible for FREE ICSH membership. This registration form is for applicants aged 17 and above.” Their displayed fee is FREE regardless of education status, with no student declaration required. This is an eligibility explanation, not enrolment. The DOB error is immediate once a valid blocked date is entered and is enforced on Continue and final revalidation. Student membership covers full-time students aged 17–21 inclusive; the 17th and 22nd birthdays define its boundaries. Event participation and stall applications are unchanged, as confirmed by the owner.

## Confirmed membership dates — 22 October 2026

The owner replaced the old calendar-year expiry with a rolling twelve-calendar-month term. New paid memberships and paid renewals start on the verified membership fee payment date. A renewal starts a fresh term from that payment date, rather than automatically adding a year to the previous expiry. Free membership retains the existing confirmed-activation rule. A saved test application keeps start and expiry dates null.

For existing members, the individual Bigin Contact record's `Created_Time` is the authorised provisional start until an accurate current-term membership start is available. `resolveBiginMembershipValidity()` accepts this as `createdTime` and records `source: 'bigin_created_time'` and `provisional: true`. A valid `correctedStartDate` overrides the fallback and automatically recalculates expiry, with `source: 'corrected_start_date'` and `provisional: false`. The actual Bigin API field for corrected membership dates still needs to be selected; no substitute field is assumed. Preserve the record's audit creation timestamp and store the corrected membership start separately.

`resolvePaidMembershipValidity()` takes a trusted, verified payment timestamp for the new term. It must receive the actual successful fee-payment time from server-side payment verification, not the application submission time, webhook receipt time, or a browser-supplied payment claim. The result records `source: 'verified_payment'` and `provisional: false`.

Dates use `Europe/London`. The start is inclusive and the expiry is the exclusive anniversary/renewal boundary: 22 October 2026 produces an expiry of 22 October 2027 and is valid through 21 October 2027. A 29 February start expires on 28 February the following year. The calculation adds calendar months through the calendar-year anniversary; it does not add a fixed 365 days, use 31 December, or roll an old term forward into the current year.

Missing or invalid dates return `unresolved`; a future start returns `not_started`; a reached anniversary returns `expired`. An invalid non-empty correction does not silently fall back to the creation date. Consequently, records created more than twelve months ago calculate as expired until an accurate start or a new verified paid term is supplied. Date validity alone does not establish identity, active membership status, payment, or category.

The existing event test checker now uses fixed synthetic Contact creation dates and requires a current date window alongside its active/paid flags for the member ticket. It recalculates both when quoting and at final registration, including expiry between those operations. The test fixtures do not renew themselves automatically; their dates are explicit in `lib/event-forms/domain.js`. Other ticket category rules are unchanged.

Focused automated tests cover corrected-date precedence, unresolved inputs, London date boundaries, leap years, anniversary expiry, verified-payment terms, and rejection of expired/inactive/unpaid synthetic member tickets. This implements the calculation and test flow only. Public live Bigin membership lookup, mapped membership date fields and payment processing remain disconnected. The separate pending test-contact route cannot update an existing Bigin record or expiry field and remains disabled until authorised.


## Member Search Tool — 22 October 2026

The renewal guidance now opens an inline lookup without leaving or submitting
the application form. A standalone lookup is at /membership/search. It accepts
exactly one alternative: first AND last name, OR email address, OR mobile number.
The name fields may contain the same value. Searches are submitted only when the
visitor presses Find my membership; there are no live suggestions or public lists.

The server reads Bigin Contacts/search and checks exact normalised matches locally.
Any duplicate name, email or phone returns an ambiguity response with no dates,
identifiers or candidates; the visitor can switch method or contact ICSH. It never
chooses the newest/first/active contact from a shared identity. A truncated provider
response also fails closed. UK phone variants normalise to E.164, with explicit
international country codes supported.

For a single Active / payment Completed contact with valid saved dates, the public
response contains only Membership_Date, Expiry_Date and the calendar-day
difference to expiry, using today's Europe/London date. On or after expiry, the
response contains only the expiry date and the UI says Membership was expired;
no start date or day count is returned, including for inactive expired records. No Created_Time or Member_Year fallback is used.
Missing dates or ineligible records direct the visitor to ICSH for review.

The same-origin POST endpoint /api/membership/search rejects unknown/mixed fields
and oversized requests. Private no-store headers prevent result caching. Existing
server-only Supabase rate limits enforce 15 searches per network address and 500
globally per ten minutes. Only a keyed address hash and count are retained. No
search details or CRM results are stored in browser storage or application records.
This feature performs no Bigin writes, registration, payment or event eligibility
changes. The supplied approved OAuth grant is configured under separate server-only
ZOHO_BIGIN_LOOKUP_* variables. Existing registration credentials stay unchanged.
The lookup code permits only fixed Contact GET searches; it cannot update or
delete records. Stored Bigin date fields are reused.
