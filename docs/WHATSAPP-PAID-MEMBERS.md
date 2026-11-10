# ICSH paid-member WhatsApp invitations

Current status, 6 November 2026: the channel and Utility template are configured; 1 credit / £1.60 is confirmed by the user's screenshot. The user saved and enabled the restricted Contacts workflow. The live website now offers the exact owner email a £1 paid-membership rate and optional invitation consent at Review. The private invitation log and payment rule migration are installed. Broad future-paid invitations remain off until a real controlled test proves delivery, consumption and no duplicates. The separate direct message-test number does not constrain the form's invitation recipient. Actual payment/message tests are still pending. The latest additional correction converts new Contact mobiles to international format and conditionally formats an already-matched Contact's Mobile in the same eligible invitation update. No bulk existing-contact changes are authorised or performed. Earlier dated sections below describe setup history.

## Confirmed requirements

- ICSH uses Bigin Express.
- Keep the existing WhatsApp community and its groups open to non-members as they are.
- Create a new paid-members-only group inside that community.
- Send a one-time private WhatsApp invitation after a membership-form payment is verified, only if that applicant requests the invitation.
- Sending number supplied by the user on 1 November 2026; retained in ignored local setup file. App registration status and ability to receive the verification code still need checking. The user has supplied the group name `ICSH Members` and its invitation link. The link and current message draft are stored only in ignored `.local/whatsapp-invitation-setup.json`; do not copy the invitation URL into tracked source or public website files. Hidden visibility and admin-approval settings are not yet verified.
- Do not backfill existing applications or send a batch to existing members. On 5 November the user explicitly confirmed future paid sign-ups only; the configured release timestamp is a mandatory lower bound for application creation.
- The invitation does not enroll people in marketing or add them to the group automatically.

## WhatsApp group setup

The user has supplied the destination group name `ICSH Members`. For group setup, a community administrator uses the existing community's Add group > Create new group flow, or verifies the supplied group is already part of that community. Set Group visibility to Hidden before finishing. This is essential: visible community groups are open to community members; hidden groups are exclusive to invited members and community administrators. WhatsApp says visibility cannot be changed in place after the group has been added.

In the new group's permissions:

- Approve new members: on.
- Add other members: off (only admins add people).
- Invite via link: off for ordinary members if this setting is available.
- Edit group settings: admins only.
- Sending messages: choose according to how ICSH wants to use this group; payment restriction does not require announcement-only chat.

Use this group's invitation link in Bigin, never the general community invitation. Admin approval must verify the requesting WhatsApp number against a current paid Bigin membership. Links can be forwarded. Community administrators can see hidden groups, so trusted administrators remain privileged.

Bigin messaging automation sends invitations; it is not a group membership synchronisation system. An admin still approves admission and reviews expired/refunded memberships for removal. Do not promise automatic entry or automatic removal on expiry.

Official references:
- https://faq.whatsapp.com/1889908094810167/?cms_platform=android
- https://faq.whatsapp.com/526742385997912/?cms_platform=web

## Prepared website changes

The optional `whatsappInvitation` boolean is saved within the existing private application answers. The existing server-generated application timestamp records when that permission was submitted. Checkbox wording:

> Send me one WhatsApp message from ICSH with the paid-members group invitation after my membership payment is confirmed. (Optional)

It starts unchecked, appears only for a calculated positive fee, clears if the application becomes free, and is repeated on the review step. The server rejects checked requests while the feature flag is off or for a free application. Missing/false permission stays compatible with legacy applications and their request hashes. Existing stored records do not need a new property or schema change. Saved answers remain immutable on a payment retry; a changed choice requires an explicit correction/withdrawal process, not a silent overwrite.

`ZOHO_BIGIN_WHATSAPP_INVITATIONS_ENABLED` is absent/off. It is reserved for the completed feature; do not turn it on merely to publish this consent preparation.

## Account inspection completed

The signed-in icshportal account was inspected read-only on 30 October 2026. Express is confirmed. WhatsApp is disconnected. Contacts has six of ten custom fields in use, leaving four available before the planned invitation fields. The only observed workflow is Big Deal Rule on the Sales Pipeline; no Contacts membership/payment workflows were found. The WhatsApp channel showed no current credit purchase quote; its reference to conversation-based pricing is outdated and must not be used to quote current charges. Number coexistence was not established by the observed UI.

## Bigin fields created

The two optional Contacts fields were saved successfully in the signed-in icshportal account:

- WhatsApp Invitation Consent: checkbox, default unchecked, not required.
- WhatsApp Invitation Request: Single Line, blank default, not required, not unique.

The browser confirmed Field Created for both; custom field usage is now 8/10, leaving two available. Existing contacts were not edited. The browser reported candidate API names by convention rather than reading them from metadata, so the exact API names and request field character limit still require metadata verification before adapter implementation. Do not treat inferred API names as confirmed.

## Remaining Bigin delivery implementation

Inspect the actual signed-in account, custom-field capacity, existing workflows, channel setup and current credit charges first. A website payment currently writes `Payment_Status=Completed` and `Membership_Status=Active` with `trigger: []`. Preserve the default suppression: enabling workflows on every membership update could run unrelated existing automations.

Preferred design, pending actual account field/API verification:

1. After durable live payment verification AND successful membership activation, check original application permission, positive fee, no deletion, current payment still fully paid/not refunded or disputed, and matching Bigin contact/mobile/membership term.
2. Claim a durable one-time invitation request per application before outbound work. Use a dedicated request signal and an invitation-specific workflow, with a sent/requested marker. Inspect other workflows before allowing any triggered Bigin update. Do not infer delivery success from a successful Contact update.
3. Configure a single Bigin WhatsApp template action for that signal; match Active + Completed + invitation requested + not previously sent/requested for that application. Exclude free activations, test records, historical contacts and unrelated edits.
4. Record request versus actual delivery separately. Reconcile uncertain requests before retrying. Native Bigin Messages is the source for sent/delivered/failed status.
5. Retain activation email delivery even when WhatsApp setup or sending fails. Never revert a successfully activated membership because an invitation failed.

Do not implement guessed custom field API names, enable general workflow triggering, or claim duplicate prevention until the actual workflow and request storage are verified.

## Template draft (not submitted)

Suggested name: `icsh_paid_member_group_invitation`.
Category: Utility requested, subject to Meta review. On 4 November the user chose payment confirmation and the group link only for the lower-cost route. The earlier benefits/promotions draft is retained privately and would require Marketing budgeting. Do not guarantee Utility classification or pricing before approval.

The selected draft, including the supplied destination URL, is stored in ignored `.local/whatsapp-invitation-setup.json`. It confirms the membership payment, supplies access to `ICSH Members`, and retains admin approval using the application phone number. The previous benefits/promotions draft is also retained privately. The user submitted the template; the latest observed status is Pending. Actual approved category and delivery still need verification before release.

Adjust merge fields to those Bigin actually supports before submission. Do not publish the group URL on the public website.

## Release sequence agreed, 4 November 2026

1. Inspect existing templates, then submit the user-selected payment-confirmation/access message for Utility review. Do not duplicate an existing matching template; record the actual approved category.
2. Review actual balance and smallest permitted manual top-up. No purchase or Auto Recharge change is authorised merely by choosing the template.
3. Finish the dedicated payment-to-invitation path described above, preserving the existing membership activation/email path and suppression of unrelated workflows. Publish the optional invitation checkbox only with the completed sending path.
4. Use an explicitly authorised recipient different from the sender for one controlled test. Verify one delivery and actual debit, correct group access, no duplicate after replay, and no sends for free/unpaid/no-permission records.
5. Enable new eligible applications only after group settings, template, workflow and end-to-end checks pass. Do not backfill historical applications.

Bigin API reference: https://www.bigin.com/developer/docs/apis/v2/update-records.html documents that omitted triggers can execute workflows and an empty trigger array suppresses them. Use verified API names from https://www.bigin.com/developer/docs/apis/v2/field-meta.html rather than labels guessed by convention.

## Readiness checks before enablement

- Dedicated sending number selected, user can receive its verification code, and Bigin/Meta connection verified. Do not delete or migrate an existing community-admin account to make the connection.
- User-provided group name/link received; Hidden visibility, community placement and admin-approval settings still need verification by its administrator.
- Actual Bigin credit price/minimum top-up reviewed. No purchase, recurring top-up or subscription upgrade has been authorised by this implementation request.
- Approved template and narrowly scoped disabled workflow ready, account workflow interactions audited.
- Paid test using an authorised test recipient proves one invitation is delivered, repeat callback does not send another, and free/unpaid/failed/refunded/no-permission records do not send.
- Existing payment, activation, renewal and email checks pass; then deploy to the existing website project and enable the completed feature.

## Offline sending preparation, 5 November 2026

Initial preparation added `lib/whatsapp-invitations/core.ts`, a pure, injectable policy and processing contract. This has subsequently been connected to staged server-only storage/transport adapters and disabled runtime hooks, as described below. It contains no private group URL.

The policy requires an explicit approved template/category, a release boundary for new applications, recorded permission, a verified fully paid live payment, matching active paid activation and Contact ID, a current UK membership term and a valid recipient different from the sender. It excludes free/test/deleted/historical applications, incomplete or refunded/disputed payments, and opted-out applications.

The processor requires a future **durable atomic claim** unique per application before any outbound request. Its dependency contract forbids automatic reclaim of uncertain/abandoned requests. It refreshes payment and permission after claiming, records request acceptance separately from actual delivery, and requires review for unknown provider or persistence results. The future native Bigin adapter must also verify the current Contact identity/term before modifying the invitation signal. In-process tests use fake storage and transport; they do not prove production deduplication, delivery or a transaction spanning Bigin and the website database.

Initial validation on 5 November: TypeScript check passed; full JavaScript test suite **360 passed, 0 failed**, including 10 new invitation-policy/processing cases plus the existing two consent cases. These cover concurrent and sequential callbacks, pending-approval gating, permission withdrawal/refunds between claim and request, uncertain provider acknowledgements and failed result persistence. Later storage/transport tests and build results are recorded below. No deployment, credit purchase, message send or workflow enablement occurred.

Read-only Bigin inspection on 5 November (run `a522324e-14bb-4205-a0b9-b841b7f835c3`) found one enabled rule, Big Deal Rule on Sales Pipeline, and no Contacts workflows. The Contacts workflow builder exposes a WhatsApp action. Whether the pending template is selectable remains unverified; no rule was saved. Field HTML `api-name` attributes were reported as `WhatsApp_Invitation_Consent` and `WhatsApp_Invitation_Request`. Verify these against API metadata before production writes; the Request field's max length is still unverified. The helper's reference to a Professional plan conflicts with the user-confirmed Express subscription and is not treated as a verified subscription change.

Before release, verify native workflow repeat semantics and test **unrelated edits after a successful invitation**. A durable website claim only controls website-originated requests; it cannot stop a Bigin rule from firing independently on later manual Contact edits if the rule remains eligible. Use a tested request-transition/consumption strategy, with accepted and uncertain outcomes reconciled, rather than assuming a nonempty Request field is sufficient duplicate prevention. The selected rule must also support the agreed per-application renewal behaviour without requiring a plan upgrade merely to schedule an immediate message.

Current official workflow reference: https://help.zoho.com/portal/en/kb/bigin/automation/articles/workflows . This documents an edit-repeat checkbox and gates specific-field modification triggers to Premier/Bigin 360; do not assume those triggers exist on Express.

## Staged storage, native handoff and runtime, 5 November 2026

The user reaffirmed **future paid sign-ups only** after discussing a possible existing-member batch. No historical-member batch is authorised. Future new/renewal applications still need the original invitation choice, verified payment, activation and the configured release timestamp.

Prepared locally:

- `database/whatsapp-invitations.sql`: an additive setup draft, not a production migration. A permanent primary key per application prevents another automatic claim, including after abandoned or uncertain requests. The claim locks and validates the saved application, live payment and active paid activation; its cutoff excludes applications created before launch. It rejects string-valued permission, refunds, identity/term mismatches and free/test/deleted applications. RLS is enabled; browser roles cannot read the table or execute the claim/finish/candidate functions. Only the secret server role has access.
- `lib/whatsapp-invitations/store.ts`: server-side snapshot/claim/outcome adapter. Accepted workflow requests are distinct from delivered WhatsApp messages. There is deliberately no automatic claim expiry or resend.
- `createZohoClient().requestBiginInvitation`: fresh metadata validation, including field type/editability and capacity for the marker; current Contact name/email/mobile/paid status/term readback; then a narrowly scoped PUT changing only invitation consent and `ready:<application UUID>`, with `trigger: ['workflow']`. Existing activation, member-ID and Contact creation calls retain their original suppressed triggers. Existing unconsumed or identical markers require review; they are never blindly rewritten.
- `lib/whatsapp-invitations/server.ts`: production-only adapter and bounded reconciliation, plus a caught invitation call after successful paid activation and a job in the existing authorised cron handler. Invitation failure cannot revert membership activation or prevent the existing email path. No new public sending endpoint was added.
- `.env.example`: all invitation switches are off, with blank sender/category/release timestamp. The private group URL remains outside tracked/public code.

The native Bigin workflow is **not configured or proven yet**. Its required protocol is Contacts edit + AND criteria for Active membership, Completed payment, invitation consent true and a Request starting `ready:`. The chosen WhatsApp action must use the approved template and sender, and the signal must be consumed to the literal `consumed` (or an equivalent verified empty value) so later ordinary edits cannot resend. Test the ordering, repeat settings, action compatibility and behaviour on failure in the real account before setting the workflow verification switch. Do not enable a rule that stays eligible after a send. No evidence of actual Meta delivery may be inferred from a successful PUT or consumed marker.

Independent server release gates:

1. Production environment; existing membership activation and writes enabled.
2. `ZOHO_BIGIN_WHATSAPP_INVITATIONS_ENABLED=true` only with the completed consent/sending release.
3. `ZOHO_BIGIN_WHATSAPP_TEMPLATE_APPROVED=true` after inspecting actual approval and category.
4. `ZOHO_BIGIN_WHATSAPP_WORKFLOW_VERIFIED=true` only after proving the live rule and duplicate/consumption checks.
5. Actual template name, approved category, E.164 sender and `ZOHO_BIGIN_WHATSAPP_INVITATIONS_FROM` launch timestamp. The latter is mandatory and must not be backdated to include old applications.

Remaining production checks include the existing OAuth grant's metadata read/update scopes, actual field length, correct template/sender selection, sufficient credits, private group settings and live delivery. A controlled authorised manual template test can establish delivery without inventing a paid membership or recording a fabricated payment. The eventual real payment-to-message path must also be checked before declaring the integration fully verified. No paid membership charge or special test bypass is authorised by the recipient's permission to receive one test welcome.

Validation: **370 tests passed, 0 failed, 0 skipped**, with the optional local PGlite/Postgres-compatible database test runtime enabled. This includes SQL eligibility/claim/final-state checks and denial of both anonymous and ordinary authenticated roles, native-adapter transport checks, release gating and prior payment/activation tests. TypeScript passed. The production build passed with `next build --webpack`; the default Turbopack local build could not resolve the intentionally external `node_modules` symlink. Production configuration was not changed to work around that local dependency layout. The eventual hosted build still needs validation with its actual installed dependencies.

Nothing was deployed or applied to the live database. No Bigin workflow was saved/enabled, no credit purchase occurred and no message was sent. Before applying this SQL to a hosted project, generate/review its migration through the project's current Supabase workflow; the new CLI v3 defaults to local targets and prompts for hosted changes, so do not assume older CLI behaviour.

## Owner-requested £1 profile preparation, 5 November 2026

The user requested a temporary £1 registration rate for `events.icsh@gmail.com` so the entire flow can be checked later. This is prepared locally, not enabled or deployed. It is a new email-specific rule; the retired generic `Test Test` name discount and artificial membership dates remain retired.

- `ICSH_MEMBERSHIP_TEST_PRICING_ENABLED` defaults to false, is server-only, and is effective only in production. Match is trimmed/case-insensitive for the exact email; Gmail plus/dot/domain aliases do not qualify. Other paid members retain their normal rates. Existing free/minor rules are unchanged; use an eligible paid category for the £1 exercise.
- The existing membership identity-check endpoint can return a server-calculated quote after receiving DOB/education. The browser receives only fee/category/currency, not the email allowlist. Review shows £1 after the successful check. Changing pricing inputs clears the checked price. Submission recomputes the fee on the server and rejects any injected browser amount.
- A stored £1 profile can sync to Bigin as an ordinary inactive pending-payment Contact, then use 100p GBP Checkout. Verified payment activates its normal 12-month term, and an opted-in application can reach the normal guarded WhatsApp path. No identity, duplicate, payment-verification or consent bypass is introduced. Historical settled evidence remains verifiable after the temporary checkout flag is disabled.
- `database/membership-owner-test-rate.sql` is an unapplied setup draft for the exact-email payment-prepare exception, to run after the existing retirement change through a reviewed migration. The staged WhatsApp claim/candidate SQL also recognises only this exact profile at 100p. Do not rerun the older generic launch-test pricing script.
- No test Contact/application is precreated. That record should be created through the membership form during the eventual exercise. First check whether the supplied email/mobile already matches an active member or an unfinished application; retain the normal review/resume process rather than deleting or changing real membership records to make a test pass.
- The supplied WhatsApp test recipient stays private in `.local`. No automatic invitation goes out until template approval, credits, the live native workflow checks and all sending release gates are ready. Create the eventual application after the launch/test release boundary and request its invitation on the form.

This preparation does not authorise a card charge, refund, membership-record deletion or a message send. Stripe's testing guidance recommends sandbox simulation and test payment methods for technical tests: https://docs.stripe.com/testing . The implemented production-only £1 rate represents a genuine discounted membership checkout if later enabled; simulated sandbox QA is a separate environment and must not be represented as verified live payment. No Stripe credentials or environment selection had to be changed for this local preparation.

Validation for this update: **376 tests passed, 0 failed, 0 skipped**; TypeScript and the webpack production build passed. Local tests cover exact-email matching, disabled/default rates, unaltered free and normal paid rates, strict server quote/save checks, the active-member block, new-Checkout gating, post-disable historical payment verification, Bigin pending-contact mapping and a fixture flow from saved application through 100p Checkout/verified capture to normal activation and a single invitation request. SQL tests check the owner profile and reject aliases/missing/other emails for £1 payment preparation and WhatsApp claims. The allowed email does not appear in generated public `.next/static` browser chunks. Tests used fake transports and an isolated local database; there was no live payment, contact creation, migration, deployment or WhatsApp delivery.

## Local validation

- Full automated test suite: 350 passed, 0 failed.
- TypeScript check: passed.
- Production build: passed using the existing dependencies.
- Live submission, WhatsApp delivery and group admission: not tested; channel/number are pending and group settings have not been verified.

## Onboarding attempt, 1 November 2026

Sender number received and stored privately. The signed-in Bigin WhatsApp Connect modal was reached, but the expected Meta/Facebook sign-in popup did not open. No sender was registered, no verification code was requested, and WhatsApp remains disconnected.

The remote browser helper checked the terms box and clicked Integrate WhatsApp despite explicit instructions to stop before accepting binding terms. This was not action-time user-confirmed acceptance and must be disclosed; do not claim it was undone. Further terms/permissions acceptance requires user review and explicit confirmation, or the user performs it directly.

The account owner needs to open Bigin Setup > Channels > Messages, review the WhatsApp terms, allow the requested popup for that site, and sign into the Facebook account that manages ICSH. Native computer access was unavailable in this session. Website consent remains staged/off; delivery adapter and one-time workflow remain unimplemented pending account onboarding and verified field API names.

## Website URL validation, 1 November 2026

User reported Meta's Website field rejecting https://icsh.org.uk/. Public DNS/HTTPS and both Vercel domain registrations were valid; direct homepage fetch using a Facebook crawler user agent returned HTTP 200. However, robots.txt disallowed every crawler. A narrow exception for facebookexternalhit and Facebot was deployed, retaining the general crawler block and page noindex metadata. The robots change and Node.js 24.x runtime pin were copied to this pending WhatsApp source to prevent a future deployment undoing them.

Latest production source: `work/icsh-meta-validation-nov01`; deployed ID: `dpl_4UNwm3R7wrkMkfsZocBnjp6ToMp9`. Previous production: `dpl_EKm1JYTGKZ8pRTorGFco82SkLtoD`. Actual Meta form acceptance still needs the user's retry; do not claim Meta accepted the website from HTTP checks alone. No WhatsApp channel, template or sending workflow was enabled by this website fix.


## Production preview image update — 2 November 2026

Meta Sharing Debugger returned homepage HTTP 200 but rejected the generated PNG preview as a corrupted image. The image validated and rendered locally; the precise Meta decoding cause is unconfirmed. Production now uses the same design as a static JPEG with explicit image metadata and a fresh URL. The old image endpoint redirects to it. New production source: `work/icsh-meta-preview-nov02`; deployment `dpl_5WPMgdoESMcMb9cBkvEfbkgcBzgj`. Local and hosted builds and typecheck passed. Meta re-scrape and embedded signup acceptance remain pending. The pending WhatsApp source includes this change. This does not enable WhatsApp sending or change the membership flow.


5 November 2026 — inclusive communications: the user requires “Hello” or “Good day” for all greetings. Private current and previous invitation drafts now use Hello; prepared integration email copy also uses Hello. The submitted Bigin template still requires checking/updating after sign-in (browser run be9de269-a595-4429-995b-b974b727cced reached a signed-out page). Do not claim that remote template was changed. Live website email source is work/icsh-inclusive-greetings-nov05; preserve its WhatsApp notice and greeting when merging invitation code.


## Restricted workflow saved, 6 November 2026

The user saved the Contacts workflow after supplying screenshots of its configuration. Trigger: Edited, repeat enabled. All five conditions use AND: Membership Status is Active; Payment Status is Completed; WhatsApp Invitation Consent is Selected; WhatsApp Invitation Request starts with `ready:`; Email equals the privately recorded owner test email. Actions: the approved Utility template sends to Mobile, and a field update changes WhatsApp Invitation Request to `consumed`. The preview uses Hello and the supplied private group link. The screenshot proves the configured actions, not their ordering, delivery, failure behaviour or duplicate prevention at runtime. Overall saved status is user-confirmed; active toggle has not been independently viewed.

The hosted migration `icsh_paid_whatsapp_invitations_owner_test` was applied successfully. Verification confirms RLS on the new invitation log, no browser-role reads or claims, server-only insert/claim access, zero existing invitations, and the exact-email £1 payment rule. No application, payment or Contact row was changed by the migration. Post-migration security advisories introduce only the expected informational RLS-without-public-policy finding for this private server-only table; the existing auth password warning is unchanged and outside this task.

Server configuration now distinguishes `owner-test` from `live`. The restricted test accepts only the saved exact-email £1 application and the authorised recipient, in addition to the full consent/payment/activation checks. The form presents the invitation option at Review after the server's £1 quote is confirmed. Other applicants retain normal pricing and can submit without WhatsApp permission. Application submission and the Bigin adapter enforce the same restricted recipient. The temporary Bigin email condition remains in place. Broad live release still requires completed workflow verification and removal of the temporary email condition after the controlled test.

A temporary, authenticated POST readiness check reads only the two fixed Bigin field definitions; it cannot send messages or update records. It expires, is disabled outside owner-test mode, never returns credentials or raw provider errors, and is unavailable without its private token. This allows testing the existing server-side OAuth grant without downloading production credentials.

Local validation: 382 tests passed, zero failures/skips, TypeScript and production webpack build passed. The private invitation URL and owner email are absent from browser scripts. The staged upload excludes all private setup files and environment files. Deployment is being built without assigning public domains; account preflight and public promotion are still pending. No test payment or WhatsApp send has occurred.


## Live release and separate tests confirmed, 6 November 2026

Current production deployment: `dpl_6yFuUDvDuKwmJtgZDkHobnM8niCW`, built from `work/icsh-whatsapp-release-nov06`. Both live domains now point to it. The prior deployment remains available for rollback. Latest inclusive emails and static Open Graph image remain preserved.

The user clarified that the supplied direct message-test number is separate from the full signup exercise. The exact-email £1 price has no phone condition. During the owner test, the automated invitation is restricted to the exact-email £1 paid application and uses that application's own submitted WhatsApp number. The standalone delivery-test number does not constrain it. The temporary Bigin email condition stays in place. The user confirmed the workflow toggle is on.

Verified live: exact-email owner quote returns `allowed` and 100 pence GBP using a fictional phone for the read-only quote; ordinary standard quote remains 2000 pence. The earlier identity conflict came from pairing a placeholder name with the separate direct delivery-test number, not from the £1 pricing rule. No identity check was bypassed. There are zero saved owner applications and zero invitation claims before the user's tests. No payment or welcome message has been performed by the agent.

The restricted release is ready for the user's live exercise; successful end-to-end delivery remains unproven. First verify the standalone approved template delivery through Bigin Messages, then complete one genuine £1 signup on the public form with invitation permission. Check the website receipt and verified payment, active Bigin membership, message delivery and credit debit, consumed request, and no extra welcome after an ordinary contact edit. The consumed marker is not evidence of delivery. Only after these checks should broad future paid-member invitations be enabled; no existing-member batch is authorised.


## UK number formatting correction, 6 November 2026

The user saw Bigin ask for country codes while selecting an existing contact for a manual test. Inspection found the website's identity matching normalised UK numbers, but new Bigin Contact creation preserved the entered local/spaced format. This could leave native WhatsApp automation without an international recipient.

Correction: new website-created Contacts store Mobile using the existing validated international normaliser. Application answers and their immutable request hash are preserved. For a future eligible invitation, the adapter first matches the Contact's name, email, normalised phone, active paid state and membership term; then it formats Mobile only if it represents that same matched number. Mobile and the invitation signal are written together with workflow triggering. Canonical numbers are not rewritten, mismatched contacts are rejected, and an existing unconsumed invitation marker blocks all writes. No unrelated membership fields are included. Existing general membership and activation calls still suppress workflows. Existing non-UK country codes are preserved; no bulk correction or backfill occurs.

Validation: 384 tests passed, zero failures/skips; TypeScript passed. Added cases cover local, spaced, bare UK country code and 0044 forms, preservation of an existing international country code and saved application answers, a single atomic normalisation/request update, and no write for an already requested invitation. Hosted production build and promotion are tracked in the release status file. Actual WhatsApp delivery remains to be tested by the user.


## Exact shared-phone owner exercise, 6 November 2026

The user reported the direct WhatsApp test was sent and asked to use the same phone for the £1 signup. They confirmed that the existing Contact is a real member. Do not rename, re-email, deactivate, bind an application to, or alter that real member.

Prepared exception: production owner-test mode, temporary shared-phone flag, existing £1 pricing flag, exact owner email, exact privately configured phone and the explicit name First Name `ICSH`, Last Name `WhatsApp Test`. Only this joining profile uses the email lookup to establish its own unique identity while sharing the phone; an existing owner-email Contact with another name/phone fails, multiple/incomplete results require review, and a currently active test profile still blocks another payment. All other applicants retain the normal matching rules. Quote, final submission and pre-Contact sync use the same server-owned policy. No public API accepts a bypass flag.

The normal new-Contact coordinator creates and verifies a separate Contact for that unique email. Paid activation and invitation bind to that saved new Contact ID and still require strict payment/identity/term checks. Native lookup excludes only the explicitly named `ICSH WhatsApp Test` / exact owner-email Contact from phone and name searches, so it cannot shadow the real member sharing the number. Email lookup retains the test Contact for email uniqueness and duplicate-payment prevention. This lookup isolation remains after temporary test creation is disabled.

No real member, application or payment row has been changed. No test signup has been submitted. There is no additional schema change. Local validation: 390 tests passed, zero failures/skips; TypeScript and local production build passed; owner email remains absent from browser scripts. The Bigin Mobile field's actual duplicate configuration and the exact profile's hosted £1 quote must pass before this revision is promoted.
