# ICSH website: Zoho connection setup

## Current stage

The existing website has an organiser-only connection page at `/admin/connections` and a protected `POST /api/zoho/check` route. The implementation verifies OAuth read access and discovers metadata. It does not subscribe contacts, enrol workflows, create or update CRM records, activate membership, change payments, or send email.

The website remains the existing Vercel project `website`, team `icsh`, with the existing `icsh-website-preview` branch. Its name is historical; it is the actual website under development. Do not create a separate website or change DNS for this connection work.

**The approved read-only account authorisations are configured.** Separate Bigin and Campaigns refresh tokens are saved in the existing Vercel project's Production environment, using the confirmed EU data centre. Bigin's real OAuth refresh and metadata reads passed through the application adapter. Campaigns' real OAuth refresh and three metadata reads succeeded; its captured responses also passed through the application's client, parser and check handler after accommodating the account's nested field-definition response. The organiser page only says “Connection verified” after its own successful live check.

| Service | Confirmed account | Metadata discovered |
| --- | --- | --- |
| Bigin | `icshportal` | 26 Contacts field definitions |
| Campaigns | Islamic and Cultural Society of Harrow | 5 mailing lists, 1 topic, 24 contact field definitions; inventory not truncated |

The Campaigns lists include **ICSH Members 2026**, **ICSH Membership Record Search** and **ICSH Events TestList**. The returned topic is **Marketing**. These names are an inventory, not an instruction to subscribe contacts or run existing automations. The correct membership/event destinations and their consent behaviour still need to be selected before any write integration.

## 1. Obtain account authorisation securely

Use an ICSH account with permission to authorise the intended Bigin organisation and Campaigns workspace. Check the actual regional address shown by each service. The organisation's UK address and the operator's location do not determine the Zoho data centre.

For Bigin, follow the official [Self Client overview](https://www.bigin.com/developer/docs/apis/v2/self-client-overview.html). In the [API Console](https://api-console.zoho.com/), create or select a Self Client, generate a short-lived code and select **Bigin** and the correct ICSH organisation. Request the minimum scopes used by this release:

```text
ZohoBigin.org.READ,ZohoBigin.settings.fields.READ
```

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
| `ZOHO_CAMPAIGNS_ACCOUNTS_URL` | Exact regional Campaigns OAuth origin |
| `ZOHO_CAMPAIGNS_API_DOMAIN` | Exact regional Campaigns API origin |
| `ZOHO_CAMPAIGNS_CLIENT_ID` | Campaigns client ID |
| `ZOHO_CAMPAIGNS_CLIENT_SECRET` | Campaigns client secret |
| `ZOHO_CAMPAIGNS_REFRESH_TOKEN` | Campaigns refresh token |

Store credential values as secrets. These are server-side variables: never prefix them with `NEXT_PUBLIC_`. Do not invent an account region or populate blank placeholders as if they were credentials.

For example, **only for confirmed EU accounts**, the accounts origin is `https://accounts.zoho.eu`; Bigin's origin is `https://www.zohoapis.eu` and Campaigns' origin is `https://campaigns.zoho.eu`. Supply origins without an API path. The code checks an explicit regional allowlist and rejects mixed data centres or unexpected hosts before sending credentials.

Apply settings to the Vercel environment serving the intended website. The current website URL is served by the project's Production deployment even though the website has not launched. Preview/Development variables do not configure that deployment. Scope any local or branch testing separately, and redeploy after changing settings.

## 3. Run the protected checks

Sign in through `/admin/sign-in`, open **Zoho connection settings**, and check each service separately.

| Check | Requests | What to confirm |
| --- | --- | --- |
| Bigin | `GET /bigin/v2/org`; `GET /bigin/v2/settings/fields?module=Contacts` | Correct organisation; actual API field names and types |
| Campaigns | `GET /api/v1.1/getmailinglists`; `GET /api/v1.1/topics`; `GET /api/v1.1/contact/allfields` | Correct lists, topics and custom fields |

Bigin results are limited to organisation name/ID and field definitions. Campaigns results contain list/topic names and identifiers plus field definitions, with bounded pagination and a truncation notice where necessary. These checks do not read membership contact records.

The website verifies the organiser's current identity and the existing `icsh_organisers` allowlist before inspecting configuration or contacting Zoho. Responses use `private, no-store`; arbitrary browser-supplied service URLs and credential values are rejected. OAuth access tokens are cached and refreshes are coalesced within a running server instance. This is appropriate for occasional organiser diagnostics; high-volume member lookups will require shared refresh coordination across instances before launch.

## 4. Finish account-specific mappings before enabling forms

### Bigin membership checks and registration

- The verified Contacts schema already contains `Member_ID`, `Membership_Status`, `Payment_Status` and `Member_Year`, all as free-text fields, plus `Email` and the boolean `Email_Opt_Out`. Field metadata does not establish actual status values, email uniqueness, or how membership validity is calculated.
- This Contacts schema does not contain dedicated membership-category, date-of-birth, membership-start, renewal or expiry-date fields. These may be stored in another module or related record. Do not infer rolling validity from `Member_Year` or repurpose record-created/modified timestamps as membership dates.
- Identify the actual fields/modules for email, date of birth, membership status, membership category, full-time-education eligibility, start date and expiry date. Do not create substitute fields until the current schema is reviewed.
- Review the latest approved membership decision log. The repository contains dated 21 October changes to age thresholds that differ from earlier project notes; retain the existing website's rules while connecting, and resolve that discrepancy before applying CRM classification or rewriting existing records.
- Verify the visitor's identity before revealing existing member status or awarding a discount. An arbitrary-email lookup can expose personal membership information; an unauthenticated submission must not overwrite an existing member's contact.
- Treat missing records, multiple matches and failed API requests as different outcomes. Shared household emails need explicit matching rules.
- Add `ZohoBigin.modules.contacts.READ` and `ZohoSearch.securesearch.READ` when implementing contact search. Add only the write scopes actually required when implementing approved contact creation/updates.
- Keep membership activation and 12-month validity dependent on the approved membership/payment process. Form submission alone must not activate a paid membership.
- For an approved isolated CRM test write, use `trigger: []` to suppress Bigin workflows for that operation; review other syncs separately because that flag does not disable every external integration.

### Campaigns signups and event communications

- Select the intended list, topics and contact field mapping. Review existing Bigin syncs before enabling another path to avoid duplicates or conflicting updates.
- Review marketing consent separately from required membership or event administration messages. Retain consent history and respect unsubscribe status; renewal alone must not resubscribe an opted-out contact.
- Use an explicitly designated internal test recipient and dedicated list/topic for the first delivery test. Review confirmation emails, double opt-in and active list workflows first.
- `POST /api/v1.1/json/listsubscribe` requires `ZohoCampaigns.contact.UPDATE` and can immediately send a confirmation email. There is no provider dry-run assumed by this implementation.
- Define the exact workflow for each website event (membership completed, renewal completed, event registration, cancellation). Inspect actual workflow keys and re-entry behavior before enabling API enrollment. Payment-dependent emails must wait for verified payment events.

## Verification and limitations

Offline tests cover OAuth request construction, regional validation, token caching, redacted failures, metadata response parsing, access control and service dispatch. A production build verifies the server/client boundary. Real account authorisation and metadata discovery are complete for both services; the Campaigns regression fixture uses synthetic data and covers the observed `response.fieldnames.fieldname` wrapper. Anonymous production requests have been verified to require organiser sign-in. A signed-in check on the deployed organiser page remains separate from the successful provider/adapter verification. Membership classification, CRM writes, Campaigns subscriptions, workflow delivery and end-to-end signup tests are still pending.

Useful primary references:

- [Bigin code generation and organisation selection](https://www.bigin.com/developer/docs/apis/v2/self-client-generate-code.html)
- [Bigin refresh token usage](https://www.bigin.com/developer/docs/apis/v2/self-client-refresh-token-usage.html)
- [Bigin fields metadata](https://www.bigin.com/developer/docs/apis/v2/field-meta.html)
- [Bigin contact search](https://www.bigin.com/developer/docs/apis/v2/search-records.html)
- [Campaigns regional domains](https://www.zoho.com/campaigns/help/developers/data-centers.html)
- [Campaigns mailing lists](https://www.zoho.com/campaigns/help/developers/get-mailing-lists.html)
- [Campaigns topics](https://www.zoho.com/campaigns/help/developers/get-topics.html)
- [Campaigns subscription behavior](https://www.zoho.com/campaigns/help/developers/contact-subscribe.html)
