# Membership form — original inventory and implementation

Updated 16 October 2026. This is the form interface for the existing ICSH development website, https://website-nine-beta-11.vercel.app/. The same GitHub repository (icshevents/website) and Vercel project (website, prj_DCOHiPxvqSLB5or751jMeLsDeYzr) are retained. No separate website, repository, CRM/payment connection or preview project is created.

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
| Member Search Tool | Existing membership search form link | Conditional informational link | Step 1 renewal guidance; disabled lookup, no iframe, remote call or applicant transmission |
| Secure Payment Gateway | Zoho Checkout; GBP; Amount to be paid; fixed 15.00 in source | Yes in original | Replaced by read-only automatically calculated annual fee in steps 2–4. No gateway, provider redirect or payment controls, as explicitly required |
| Terms and Conditions | Membership Period; Refund Policy; Communication and Notifications | Yes | Step 3 with required original checkbox; reviewed in step 4 |
| Terms checkbox | I understand and agree. | Yes | Step 3, exact checkbox wording, unticked by default |
| Navigation | Next, Back, Submit | Navigation | Back / Continue, final Complete Form; no submission |

No address, other personal questions, additional choice questions, education fields or proof upload was present in either condition of the inspected form. No extra original fields have been guessed. Date of birth, education eligibility, student declaration and general accuracy declaration are additions expressly requested in the new brief.

Original renewal guidance: “Use the email address from your original membership signup. If you can't remember it, use our membership search tool below to find your details. If no records are found, you can opt in for a new signup.” The redesigned wording preserves that guidance while explaining that lookup is not yet available and providing a Switch to New Member action. It does not perform a real membership lookup.

Original mobile guidance: “Please provide your direct mobile number so we can add you to the official ICSH WhatsApp Group! This is where we share instant event updates, community news, and member-only announcements. You can remove yourself manually if you wish.” The question, direct-number request, communication purposes and opt-out information are retained across steps 1 and 3. No communications enrolment occurs now.

### Original terms and authorised changes

Original membership period: “Membership is valid from 1st January to 31st December of each calendar year, regardless of the date of registration.” This is replaced by the owner’s 22 October 2026 decision: paid membership and renewals last twelve calendar months from confirmed membership fee payment. Free membership retains confirmed activation as its start. The unpaid, disconnected form does not allocate a membership period.

Original refund policy, retained: “Membership fees are non-refundable under any circumstances once payment has been received.”

Original communication policy, retained: “By completing the membership registration, members will be automatically enrolled in the ICSH official WhatsApp group and email subscription list to receive updates and relevant communications. Members may opt out of these communications at any time.” The form explicitly distinguishes on-screen completion from registration and does not enrol anyone. ICSH must review the communications policy, lawful basis and preferences before enabling live registration.

## Implementation

- `lib/membership-pricing.ts`: single confirmed configuration, £20 standard / £15 from age 65 / £0 for full-time students aged 17–21 inclusive and for minors aged 16 and below; twelve months.
- `lib/membership.ts`: strict calendar parsing, DD/MM/YYYY conversion, complete-birthday age calculation, eligibility, GBP presentation and exact owner-supplied declaration texts. No activation or expiry calculation.
- `lib/membership-validity.ts`: a separate date resolver for trusted Bigin creation/corrected dates and verified membership payment dates. It calculates the twelve-calendar-month anniversary and date-window status without activating a membership or verifying identity/payment. See the 22 October decision below.
- `lib/membership-validation.ts`: required field, per-step and final validation; answer updates clear stale student/accuracy declarations. The education confirmation checkbox sits directly below DOB, starts unchecked (No), and is available only at ages 17–21 inclusive. Unchecked is a valid standard-rate answer. The existing Yes/No education question in step 2 is retained and synchronised with the checkbox. DOB changes below 17, to 22 or above, invalid or blank reset education to No. Both controls immediately update the shared price summary; the student declaration reflects ages 17–21 inclusive; the general accuracy declaration remains unchanged. A 200ms collapse/fade transition respects reduced-motion preferences.
- `components/MembershipForm.tsx`: personal details → eligibility → membership information → review/declaration → on-screen completion. Back and edit actions preserve answers in component state. No HTML form submission, fetch, API, CRM, payment, analytics, storage or cookie writes. Inputs disable autocomplete. Completing only changes local state. Return to Membership Page, leaving the page or reload resets the session.
- `lib/membership-integration.ts`: types-only future boundary. No implementation, credentials, OAuth, endpoints or network transport. Activation and expiry fields remain null and payment is not started.

Removed the previous sample applicants, mock CRM/payment workflow, simulation buttons, proposed-rate notices and `/api/membership/preview` route. The old endpoint must return 404 after deployment. Privacy text and homepage/invitation membership copy reflect the final interface and confirmed rates.

## Decisions before enabling live registration

ICSH must approve the under-18 parent/guardian consent and safeguarding process, lawful basis, data retention, member privacy information and communication preferences. Under-18s can use the disconnected form interface without an extra invented guardian question. Before later integration, agree member identity verification, shared-email/duplicate handling, approved CRM fields, verified payments, idempotent processing and activation rules. A paid renewal starts from its confirmed payment date under the 22 October decision; it does not automatically add a year to the previous expiry. Live processing remains disconnected.

The original public ICSH site, its Zoho Form, Bigin records, merchant settings and live membership system remain unchanged.

## Verification

Thirty-three automated checks pass, covering all eight requested pricing scenarios, exact birthdays, British date parsing, impossible/future DOBs, mandatory personal fields, default unchecked education and toggling, all declarations, stale declaration reset on edits, preservation of other answers, final revalidation, no calculated activation/expiry dates, no transport/persistence/native submission, and removal of the old endpoint/mock workflow.

Browser checks passed for blank-field errors, manual DOB, native calendar opening, unchecked education at £20, checkbox toggling, missing student/terms/accuracy declarations, review/edit, changing age 20 to 21, answer retention, standard and free student completion, renewal guidance, clearing the form on return, and no console errors. Desktop and 390px phone layouts were checked again for the checkbox update, including the clickable label, no horizontal overflow, and synchronisation with the existing eligibility question. The full redesign was also previously checked at 768px tablet width. Local server output during form completion contained page GET requests only, with no application POST. No real data was entered in the original public form.

## Confirmed minimum applicant age — 21 October 2026

Joining and renewal accept ages 17 and above only. Ages 16 and below are blocked with: “Minors aged 16 and below are eligible for FREE ICSH membership. This registration form is for applicants aged 17 and above.” Their displayed fee is FREE regardless of education status, with no student declaration required. This is an eligibility explanation, not enrolment. The DOB error is immediate once a valid blocked date is entered and is enforced on Continue and final revalidation. Student membership covers full-time students aged 17–21 inclusive; the 17th and 22nd birthdays define its boundaries. Event participation and stall applications are unchanged, as confirmed by the owner.

## Confirmed membership dates — 22 October 2026

The owner replaced the old calendar-year expiry with a rolling twelve-calendar-month term. New paid memberships and paid renewals start on the verified membership fee payment date. A renewal starts a fresh term from that payment date, rather than automatically adding a year to the previous expiry. Free membership retains the existing confirmed-activation rule. The disconnected, unpaid application quote does not allocate a start or expiry date.

For existing members, the individual Bigin Contact record's `Created_Time` is the authorised provisional start until an accurate current-term membership start is available. `resolveBiginMembershipValidity()` accepts this as `createdTime` and records `source: 'bigin_created_time'` and `provisional: true`. A valid `correctedStartDate` overrides the fallback and automatically recalculates expiry, with `source: 'corrected_start_date'` and `provisional: false`. The actual Bigin API field for corrected membership dates still needs to be selected; no substitute field is assumed. Preserve the record's audit creation timestamp and store the corrected membership start separately.

`resolvePaidMembershipValidity()` takes a trusted, verified payment timestamp for the new term. It must receive the actual successful fee-payment time from server-side payment verification, not the application submission time, webhook receipt time, or a browser-supplied payment claim. The result records `source: 'verified_payment'` and `provisional: false`.

Dates use `Europe/London`. The start is inclusive and the expiry is the exclusive anniversary/renewal boundary: 22 October 2026 produces an expiry of 22 October 2027 and is valid through 21 October 2027. A 29 February start expires on 28 February the following year. The calculation adds calendar months through the calendar-year anniversary; it does not add a fixed 365 days, use 31 December, or roll an old term forward into the current year.

Missing or invalid dates return `unresolved`; a future start returns `not_started`; a reached anniversary returns `expired`. An invalid non-empty correction does not silently fall back to the creation date. Consequently, records created more than twelve months ago calculate as expired until an accurate start or a new verified paid term is supplied. Date validity alone does not establish identity, active membership status, payment, or category.

The existing event test checker now uses fixed synthetic Contact creation dates and requires a current date window alongside its active/paid flags for the member ticket. It recalculates both when quoting and at final registration, including expiry between those operations. The test fixtures do not renew themselves automatically; their dates are explicit in `lib/event-forms/domain.js`. Other ticket category rules are unchanged.

Focused automated tests cover corrected-date precedence, unresolved inputs, London date boundaries, leap years, anniversary expiry, verified-payment terms, and rejection of expired/inactive/unpaid synthetic member tickets. This implements the calculation and test flow only. Real Bigin Contact lookup, mapped membership date fields, payment processing and CRM writes remain to be connected; no existing Bigin record or expiry field has been updated.
