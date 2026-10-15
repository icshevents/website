# Membership preview — 16 October 2026

The owner chose to continue with the preview first, without authenticated Bigin test access. Proposed rates: Standard £20; Pensioner £15 from age 66; Student £0 only for under-21s in full-time education with the exact required declaration. All categories provide twelve months. The live site, existing form, CRM and payment pricing are unchanged.

## What works in this preview

Three pricing cards, custom joining/renewal form, native date picker, full-birthday age calculation using the current UK date, education question, unticked mandatory student declaration, automatic summary, review and result screens. Address is omitted because no address was present in the public existing form.

The server recalculates eligibility, fee and dates and ignores browser-supplied fee/category/age/start/expiry values. The preview API only accepts same-origin JSON, limits input to 8 KiB, returns private no-store responses, and does not log submitted details. It has no live CRM/payment transport and cannot be switched to live writes through an environment variable. Each request uses an isolated temporary sample repository which is discarded. No real membership or charge is created. Under-18 registration is blocked pending the approved guardian and safeguarding process.

Paid success, failure and pending outcomes are clearly labelled simulations. Free student examples skip payment after declaration checks. Sample duplicate/renewal checks do not query actual member records. The homepage, shared calls to action, popup, metadata and privacy information consistently describe the proposed model. Approved branding, inclusive wording and committee portraits are retained.

## Read-only inspection of existing registration

Entry: https://zfrmz.eu/oovk3j9ncZ265ImJpKtG

Redirect: https://forms.icsh.org.uk/icshportal1/form/ICSHAnnualMembershipFormAUTOMATED1/formperma/pCBllZBF3fei7OneZ6GMEv4GABvBqDRxNfB6wzNfp5I

Observed fields: New Member / Membership Renewal (`Radio`), first/last name (`Name`), mobile (`PhoneNumber`), email (`Email`), amount (`PaymentAmount`) and terms (`TermsConditions`). Provider label: **Zoho Checkout**. Terms still describe calendar-year validity, non-refundable fees and automatic WhatsApp/email communications. No DOB, student, declaration or address fields were present. No data was submitted, payment taken, or real membership searched.

Public Zoho Forms identifiers are not Bigin API names. Private CRM mappings, workflows, unique fields and merchant/webhook configuration cannot be verified from the public form. No Bigin connector is installed. Plugin discovery returned a Zoho CRM plugin, which is not proof of Bigin compatibility. No new connector or credentials were configured.

## Bigin field mapping preparation

`lib/bigin-mapping.ts` provides a mapping contract and field presence, read-only and collision checks, tested against synthetic metadata. It creates no custom fields, performs no OAuth authentication and sends no records. Real field types, picklists, lengths, layouts and workflow effects still need verification.

| Data | Intended field type | Status |
| --- | --- | --- |
| First / last name | Standard contact fields | Verify First_Name / Last_Name in target layout |
| Email / mobile | Standard contact fields | Verify Email / Mobile; agree member identity strategy |
| Date of birth | Date | Discover existing field or propose new one |
| Calculated age | Integer, optional | Confirm need before storing |
| Category | Picklist | Verify field and approved values |
| Fee | GBP currency | Verify existing field |
| Start / expiry | Date | Verify existing fields |
| Student declaration | Boolean | Discover or propose field |
| Declaration timestamp | UTC date-time | Discover or propose field |
| Payment status | Picklist | Verify paid / not-required / pending / failed mappings |
| Registration / renewal date | UTC date-time | Verify semantics and field |
| Registration kind | Picklist | Verify joining / renewal mapping |

The declaration text is defined in `lib/membership.ts`. No evidence upload is requested. A future evidence feature needs a separate privacy, retention and access review.

## Required before activation

1. Supply authorised Bigin and Zoho Checkout test access through secure service configuration, never pasted API secrets or NEXT_PUBLIC values. Inspect metadata, layouts, existing mappings, workflows and unique constraints before approving any new fields.
2. Implement server-only OAuth with the correct Zoho data-centre endpoint and limited scopes. Store refresh credentials in encrypted hosting configuration. The preview contains no production OAuth or CRM adapter.
3. Add verified member identity before reading/updating existing membership. An email alone is not authentication; shared family emails need an agreed identity strategy. Ambiguous duplicates must go to review. Agree a race-safe unique member key and then use the documented Bigin upsert API.
4. Add durable pending registration state, idempotent verified payment callbacks, and server-to-server provider verification. Match merchant, member reference, amount and GBP currency. Never activate from a browser redirect, client success flag or this simulation endpoint. Handle replay, retries and failure recovery.
5. Confirm the guardian/safeguarding process, lawful basis, child-friendly notices, data retention and membership privacy notice before collecting real data, especially for minors. No guardian-consent or retention policy has been assumed. No automatic communications enrolment is added.
6. Test the authenticated browser → server → Bigin → payment → callback → CRM flow with approved test records, including fields, workflows, duplicates, concurrent submissions and recovery. The 30 current tests are simulations, not authenticated integration tests.
7. Obtain owner approval of proposed rates and live launch before changing the live registration or payment system.

## Early renewal decision

**For review only, not implemented:** add twelve months to the verified current expiry, preserving the paid period. For example, current expiry 15 June 2027 and renewal 16 October 2026 could produce new expiry 15 June 2028. ICSH must approve the exact date rule, term start, expiry boundary and whether age is assessed at renewal/payment date or next-term start. The preview holds early renewals for review and leaves their existing expiry unchanged. Expired sample renewals recalculate from the UK renewal date. A 29 February start clamps to 28 February the following non-leap year; confirm that convention before launch.

## Reviewing and testing

Membership → Try a sample applicant provides Standard, Pensioner, Student, Expired renewal, Early renewal and Duplicate examples. Student starts with the declaration unticked. Review the summary, then try the clearly labelled successful/failed/pending payment simulations or free-registration preview.

Synthetic lookup emails: `renewal@example.test` (expired), `early@example.test` (future expiry), `duplicate@example.test` (ambiguous duplicates). Other emails have no sample record. These fixtures are public fictional test data only.

Run `node --test tests/membership.test.mjs` with Node 24. The 30 checks cover the eight requested age cases, exact birthdays, UK date boundaries, leap-year expiry, invalid DOBs, missing declarations, tampered browser pricing/dates, required fields, payment outcomes, new/existing/early/unknown renewals, duplicate records, under-18 blocking, isolated test repositories and mapped CRM contract. Production build and browser results are recorded in the final handover.

Sources: [Bigin upsert API](https://www.bigin.com/developer/docs/apis/v2/upsert-records.html), [Bigin field metadata](https://www.bigin.com/developer/docs/apis/v2/field-meta.html), [ICO children and UK GDPR](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/children-and-the-uk-gdpr/).

Local HTTP verification: all eight pricing scenarios plus validation, body-size limit, origin/content-type checks, price/date tampering, failed/pending payment, renewal, duplicates and under-18 gating passed (24 checks). Desktop student free-registration, pensioner payment failure, early-renewal protection and 390px mobile review were also checked in the browser; no horizontal overflow was observed at 390px.
