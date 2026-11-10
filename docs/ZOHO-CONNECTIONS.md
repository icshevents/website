# ICSH website: Zoho connection setup

## Current stage

The existing website has an organiser-only connection page at `/admin/connections` and a protected `POST /api/zoho/check` route. Those diagnostics remain read-only metadata checks. The new source also saves fictional membership applications privately on the website and adds a separate organiser-controlled Bigin create/readback route. Public form submission never invokes Bigin. Contact creation remains disabled pending its separate narrow authorisation and write flag; Stripe, activation, live event membership lookup, Campaigns enrolment and email delivery remain disabled.

The website remains the existing Vercel project `website`, team `icsh`, with the existing `icsh-website-preview` branch. Its name is historical; it is the actual website under development. Do not create a separate website or change DNS for this connection work.

**The earlier metadata authorisations are configured; membership contact creation is not yet authorised.** Separate Bigin and Campaigns refresh tokens were saved in the existing Vercel project's Production environment using the confirmed EU data centre. Bigin OAuth refresh and metadata reads passed through the application adapter. Campaigns OAuth refresh and metadata reads succeeded, including its nested field-definition response. These observations establish metadata access only. The organiser page says “Connection verified” after its own successful check; that label does not establish contact-search/create permissions or a completed membership integration.

| Service | Confirmed account | Metadata discovered |
| --- | --- | --- |
| Bigin | `icshportal` | 26 Contacts field definitions |
| Campaigns | Islamic and Cultural Society of Harrow | 5 mailing lists, 1 topic, 24 contact field definitions; inventory not truncated |

The Campaigns lists include **ICSH Members 2026**, **ICSH Membership Record Search** and **ICSH Events TestList**. The returned topic is **Marketing**. These names are an inventory, not an instruction to subscribe contacts or run existing automations. The correct membership/event destinations and their consent behaviour still need to be selected before any write integration.

## 1. Obtain account authorisation securely

Use an ICSH account with permission to authorise the intended Bigin organisation and Campaigns workspace. Check the actual regional address shown by each service. The organisation's UK address and the operator's location do not determine the Zoho data centre.

For Bigin, follow the official [Self Client overview](https://www.bigin.com/developer/docs/apis/v2/self-client-overview.html). In the [API Console](https://api-console.zoho.com/), create or select a Self Client, generate a short-lived code and select **Bigin** and the correct ICSH organisation. The existing metadata-only grant uses:

```text
ZohoBigin.org.READ,ZohoBigin.settings.fields.READ
```

For the separately authorised controlled membership test, retain those diagnostic scopes and add only Contacts READ/CREATE and secure-search READ:

```text
ZohoBigin.org.READ,ZohoBigin.settings.fields.READ,ZohoBigin.modules.contacts.READ,ZohoBigin.modules.contacts.CREATE,ZohoSearch.securesearch.READ
```

Do not request Contacts UPDATE, WRITE, ALL or broad module scopes for this flow. It never updates an existing contact. The current verified token must not be assumed to include the new scopes; obtain the new grant, save it securely and verify the intended account before enabling the organiser test action. `ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED` stays false until that setup is authorised and complete.

Exchange that code once at the matching accounts server's `/oauth/v2/token` endpoint with a form-encoded POST containing `grant_type=authorization_code`, `client_id`, `client_secret` and `code`. Preserve the returned refresh token and `api_domain`. The code must be exchanged before its short validity window expires. A Bigin Self Client does not need a redirect URI.

For Campaigns, authorise a separate service grant with:

```text
ZohoCampaigns.contact.READ
```

Use the account's supported [OAuth flow](https://www.zoho.com/campaigns/help/developers/access-token.html). The configured ICSH connection uses a separate Campaigns authorisation-code grant from the same Zoho Self Client, selecting **Islamic and Cultural Society of Harrow** in the Campaigns portal selector. This Self Client flow does not require a callback URL. If instead using a web-server client, use its registered redirect URI and request offline access. Keep Campaigns and Bigin grants separate even if the account reuses a client ID. Campaigns' API origin is the **Campaigns** host, not the generic `zohoapis` domain that an OAuth response may return.

Never put client secrets, access tokens, refresh tokens, authorization codes or token response bodies in chat, GitHub, screenshots, frontend code or application logs. A ChatGPT Zoho connector authorises the assistant; it does not itself configure the deployed website's runtime credentials.

## 2. Save settings in the existing Vercel project

| Setting | Purpose |
| --- | --- |
| `ZOHO_BIGIN_ACCOUNTS_URL` | Exact regional OAuth origin |
| `ZOHO_BIGIN_API_DOMAIN` | Regional Bigin API origin from the token response |
| `ZOHO_BIGIN_CLIENT_ID` | Bigin client ID |
| `ZOHO_BIGIN_CLIENT_SECRET` | Bigin client secret |
| `ZOHO_BIGIN_REFRESH_TOKEN` | Bigin organisation's refresh token |
| `ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED` | Defaults false; exact `true` enables the separately authorised organiser test route |
| `ZOHO_CAMPAIGNS_ACCOUNTS_URL` | Exact regional Campaigns OAuth origin |
| `ZOHO_CAMPAIGNS_API_DOMAIN` | Exact regional Campaigns API origin |
| `ZOHO_CAMPAIGNS_CLIENT_ID` | Campaigns client ID |
| `ZOHO_CAMPAIGNS_CLIENT_SECRET` | Campaigns client secret |
| `ZOHO_CAMPAIGNS_REFRESH_TOKEN` | Campaigns refresh token |

Store credential values as secrets. These are server-side variables: never prefix them with `NEXT_PUBLIC_`. Do not invent an account region or populate blank placeholders as if they were credentials.

For example, **only for confirmed EU accounts**, the accounts origin is `https://accounts.zoho.eu`; Bigin's origin is `https://www.zohoapis.eu` and Campaigns' origin is `https://campaigns.zoho.eu`. Supply origins without an API path. The code checks an explicit regional allowlist and rejects mixed data centres or unexpected hosts before sending credentials.

Apply settings to the Vercel environment serving the intended website. The current website URL is served by the project's Production deployment even though the website has not launched. Preview/Development variables do not configure that deployment. Scope any local or branch testing separately, and redeploy after changing settings.

Website persistence uses the existing server-only `SUPABASE_SECRET_KEY` and the additive `database/membership-applications.sql` setup. It is independent of Zoho credentials: an application can be saved with Bigin authorisation pending. The write flag alone does not grant OAuth permission or prove successful provider delivery.

## 3. Run the protected checks

Sign in through `/admin/sign-in`, open **Zoho connection settings**, and check each service separately.

| Check | Requests | What to confirm |
| --- | --- | --- |
| Bigin | `GET /bigin/v2/org`; `GET /bigin/v2/settings/fields?module=Contacts` | Correct organisation; actual API field names and types |
| Campaigns | `GET /api/v1.1/getmailinglists`; `GET /api/v1.1/topics`; `GET /api/v1.1/contact/allfields` | Correct lists, topics and custom fields |

Bigin results are limited to organisation name/ID and field definitions. Campaigns results contain list/topic names and identifiers plus field definitions, with bounded pagination and a truncation notice where necessary. These checks do not read membership contact records.

The website verifies the organiser's current identity and the existing `icsh_organisers` allowlist before inspecting configuration or contacting Zoho. Responses use `private, no-store`; arbitrary browser-supplied service URLs and credential values are rejected. OAuth access tokens are cached and refreshes are coalesced within a running server instance. This is appropriate for occasional organiser diagnostics; high-volume member lookups will require shared refresh coordination across instances before launch.

## 4. Controlled membership test flow

Only fictional details and an `@example.invalid` address are accepted. Explicit **Submit Test Application** performs the CSRF/session check, then posts to `/api/membership/applications`. The server validates the answers, calculates the category and fee, and commits a private test application before returning its reference. Payment is `awaiting_payment` or `not_required`; start and expiry remain null. Its first Bigin status is `awaiting_authorisation`. No public submission automatically contacts Zoho.

Approved organisers review saved applications at `/admin/memberships`. After the new narrow grant and write flag are configured, the selected application's **Send test application to Bigin** action calls protected `POST /api/membership/admin/[id]/sync`:

1. Claim that application's delivery in durable storage so simultaneous requests cannot create two contacts.
2. Leave renewals for manual review. For a new application, search its fictional email; any match or incomplete result requires review and prevents creation.
3. Create one pending contact using only `First_Name`, `Last_Name`, `Email`, `Mobile`, `Membership_Status=Pending application`, `Payment_Status=Awaiting payment` or `Not required`, and `Email_Opt_Out=true`. The request includes `trigger: []` and does not populate membership dates, member IDs or unmapped fields.
4. Read the returned contact ID back and compare the supported fields before recording `synced`. The private organiser record retains the ID; the public receipt exposes only the delivery status.

An uncertain creation outcome without a saved ID is held for manual reconciliation. It is not retried automatically. If an ID is known but readback fails, the next authorised action only verifies that contact and cannot create another one. Existing contacts are never updated; pending renewals cannot change their active status, payment, start or expiry.

**Check Bigin delivery** on the applicant's confirmation reads the website receipt using its in-memory token. It neither sends the form again nor performs a provider lookup. Full answers and declarations remain in the website's private application record. Review existing external Bigin/Campaigns syncs before the controlled create test: `trigger: []` suppresses that operation's Bigin workflows but does not disable every external integration.

The reviewed database setup was applied on 22 October 2026 and its database assertions passed with fixtures rolled back. Deployment/browser verification of the website save and the authorised provider create/readback remain separate outstanding steps.

## 5. Account-specific decisions before live membership

### Confirmed date policy — 22 October 2026

Membership now follows a rolling twelve-calendar-month term instead of the old 31 December expiry. The owner has authorised each member Contact's creation date as a temporary start until accurate current-term membership dates are corrected.

| Situation | Start source | Calculation provenance |
| --- | --- | --- |
| Existing Bigin member without a corrected start | Individual Contact `Created_Time` | `bigin_created_time`, provisional |
| Existing member with an accurate current-term start | Corrected membership-start date | `corrected_start_date`, confirmed |
| New paid membership or paid renewal | Verified membership fee payment timestamp | `verified_payment`, confirmed |
| Free membership | Confirmed activation | Existing activation rule; live processing remains disconnected |

`lib/membership-validity.ts` implements the date calculation separately from membership status and pricing. A future live membership-status adapter must pass the actual Contact `Created_Time` to `resolveBiginMembershipValidity({ createdTime, correctedStartDate })`; the pending test-contact adapter does not activate terms. The Bigin API field for `correctedStartDate` is not yet selected, so no guessed field name is used. A valid correction replaces the provisional date and recalculates expiry. Preserve the audit creation timestamp and store the corrected membership start separately.

For a new paid term, use `resolvePaidMembershipValidity(verifiedPaidAt)` with the successful fee-payment timestamp verified on the server. Neither a form submission, a webhook's arrival time, a pending payment, nor a browser-supplied timestamp can establish payment. A paid renewal starts from its confirmed payment date; it does not add a year to the old expiry.

Full timestamps are converted to `Europe/London` calendar dates before calculation. The start is inclusive and the anniversary expiry is exclusive: 22 October 2026 → 22 October 2027, valid through 21 October 2027. A 29 February start uses 28 February in the following year. Missing/invalid input remains unresolved, future starts are not yet active, and old terms remain expired. Date validity must still be combined with verified identity, the approved membership/payment status mapping and the appropriate category.

The event test checker now enforces these date boundaries for its fixed synthetic member records at quotation and final registration. The existing OAuth grants remain metadata-only: live Contacts lookup and any Bigin expiry-field writes are separate integration steps. No records have been recalculated in Bigin, no fields have been created, and no bulk update is part of this change.

### Bigin membership checks and registration

- The verified Contacts schema already contains `Member_ID`, `Membership_Status`, `Payment_Status` and `Member_Year`, all as free-text fields, plus `Email` and the boolean `Email_Opt_Out`. Field metadata does not establish actual status values, email uniqueness, or how membership validity is calculated.
- This Contacts schema does not contain dedicated membership-category, date-of-birth, membership-start, renewal or expiry-date fields. These may be stored in another module or related record. Under the owner’s 22 October decision, the individual Contact record’s `Created_Time` is an authorised provisional start-date fallback until accurate current-term dates are corrected. Do not infer dates from `Member_Year`, `Modified_Time`, or the creation date of the Zoho organisation.
- Identify the actual fields/modules for email, date of birth, membership status, membership category, full-time-education eligibility, start date and expiry date. Do not create substitute fields until the current schema is reviewed.
- Retain the owner’s 21 October rules: joining and renewal forms accept ages 17 and above; free student eligibility is ages 17–21 inclusive in full-time education; ages 16 and below are free but cannot submit these forms. Earlier age-threshold notes are superseded. Do not infer existing CRM classifications from the test application.
- Verify the visitor's identity before revealing existing member status or awarding a discount. An arbitrary-email lookup can expose personal membership information; an unauthenticated submission must not overwrite an existing member's contact.
- Treat missing records, multiple matches and failed API requests as different outcomes. Shared household emails need explicit matching rules.
- The controlled test uses only the READ/CREATE/search scopes listed above. Live identity-based membership lookup and any future record updates require their own agreed implementation; no UPDATE, WRITE or ALL scope is requested here.
- New paid memberships and renewals start from the verified membership fee payment date, with expiry twelve calendar months later. Form submission, a pending payment or a recently created Contact alone must not activate a paid membership.
- For an approved isolated CRM test write, use `trigger: []` to suppress Bigin workflows for that operation; review other syncs separately because that flag does not disable every external integration.

### Campaigns signups and event communications

- Select the intended list, topics and contact field mapping. Review existing Bigin syncs before enabling another path to avoid duplicates or conflicting updates.
- Review marketing consent separately from required membership or event administration messages. Retain consent history and respect unsubscribe status; renewal alone must not resubscribe an opted-out contact.
- Use an explicitly designated internal test recipient and dedicated list/topic for the first delivery test. Review confirmation emails, double opt-in and active list workflows first.
- A future `POST /api/v1.1/json/listsubscribe` integration would require `ZohoCampaigns.contact.UPDATE` and can immediately send a confirmation email. That permission and operation remain outside this test flow; no provider dry-run is assumed.
- Define the exact workflow for each website event (membership completed, renewal completed, event registration, cancellation). Inspect actual workflow keys and re-entry behavior before enabling API enrollment. Payment-dependent emails must wait for verified payment events.

## Verification and limitations

Offline tests cover OAuth construction, regional validation, redacted failures, metadata parsing, organiser access, pending test mapping, duplicate/renewal review, write gating, contact readback and uncertain creation outcomes. They use synthetic provider responses. The Campaigns fixture covers the observed `response.fieldnames.fieldname` wrapper. Run `pnpm test`, `pnpm typecheck` and `pnpm build` for the current source.

Earlier real-account evidence established metadata access for both services and anonymous denial on protected diagnostics. It did not grant or verify membership contact creation. The reviewed database setup and rollback assertions passed on 22 October 2026. Deployment/browser verification and a separately authorised fictional provider create/readback with the write gate enabled remain outstanding. Live membership classification/lookup, existing-record updates, payments, Campaigns subscriptions and workflow delivery remain pending. No end-to-end membership delivery is claimed here.

Useful primary references:

- [Bigin code generation and organisation selection](https://www.bigin.com/developer/docs/apis/v2/self-client-generate-code.html)
- [Bigin refresh token usage](https://www.bigin.com/developer/docs/apis/v2/self-client-refresh-token-usage.html)
- [Bigin fields metadata](https://www.bigin.com/developer/docs/apis/v2/field-meta.html)
- [Bigin contact search](https://www.bigin.com/developer/docs/apis/v2/search-records.html)
- [Campaigns regional domains](https://www.zoho.com/campaigns/help/developers/data-centers.html)
- [Campaigns mailing lists](https://www.zoho.com/campaigns/help/developers/get-mailing-lists.html)
- [Campaigns topics](https://www.zoho.com/campaigns/help/developers/get-topics.html)
- [Campaigns subscription behavior](https://www.zoho.com/campaigns/help/developers/contact-subscribe.html)
