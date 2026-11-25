# ICSH membership rules

Confirmed by ICSH on 25 November 2026. Change these rules only at the explicit request of the ICSH owner.

## New Member

- The primary email address in Zoho Bigin is the sole member identifier. Compare exact addresses after trimming spaces and ignoring case. Names and mobile numbers are contact details. Family members can share a mobile number and must use separate emails.
- An existing Bigin email blocks a new application at both the eligibility check and final submission. This applies to active and inactive memberships and to existing records with incomplete dates. A different name or mobile number cannot permit a new application for that email.
- A confirmed active match is shown as **Active ICSH member**. Other registered emails are shown as **Email already registered**. Both offer **Switch to Membership Renewal** with the entered details carried across.

## Membership Renewal

- Use the existing Bigin email to find the record. A changed name or mobile number is allowed. If Bigin returns multiple matching records, refer the case to ICSH for review.
- Show the membership status before submission. For active members, show the current expiry and the projected expiry after renewal. Early renewal preserves the existing term and adds 12 calendar months to its expiry. For inactive members, display **Inactive ICSH member, please renew.** A lapsed term restarts on confirmed payment or free activation, as applicable.
- Confirm a changed name or mobile number with a code sent to the registered email. The code screen tells the applicant to check **Spam or Junk**. Bind the proof to the requested changes and use the same international mobile format for verification and saving.
- Hold the verified changes on the renewal application until it is confirmed. Update the existing Bigin record only after Stripe payment is verified and the renewed paid membership is active, or after the free renewal is successfully activated. Submitting an application or entering the email code leaves the details pending.

## Membership status search

The public Member Search Tool on the website and inside the renewal form uses the registered email address. Both the form and its endpoint accept email searches only. Multiple records under the same email are referred to ICSH and no dates are shown.

## Regression checks

Run `pnpm test:membership-policy` before releasing membership changes. The GitHub **Membership policy** workflow runs the same suite for pull requests into `main` and pushes to `main`. The suite uses fictional data.
