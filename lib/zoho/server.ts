import 'server-only';
import { createZohoClient } from './client';
import { syncTestMembershipApplication as deliverTestApplication, type BiginMembershipApplication } from './membership-applications';

export { getZohoConfiguration } from './client';
export { checkBiginConnection } from './bigin';
export { checkCampaignsConnection } from './campaigns';
export { handleZohoCheck } from './check';
export { searchBiginContactsByEmail, getBiginContact, createBiginContact } from './client';
// Separate lookup credentials preserve the existing registration connection.
// A partial configuration fails closed; never mix two OAuth clients or grants.
const memberLookupClient = createZohoClient({
  ZOHO_BIGIN_ACCOUNTS_URL: process.env.ZOHO_BIGIN_LOOKUP_ACCOUNTS_URL,
  ZOHO_BIGIN_API_DOMAIN: process.env.ZOHO_BIGIN_LOOKUP_API_DOMAIN,
  ZOHO_BIGIN_CLIENT_ID: process.env.ZOHO_BIGIN_LOOKUP_CLIENT_ID,
  ZOHO_BIGIN_CLIENT_SECRET: process.env.ZOHO_BIGIN_LOOKUP_CLIENT_SECRET,
  ZOHO_BIGIN_REFRESH_TOKEN: process.env.ZOHO_BIGIN_LOOKUP_REFRESH_TOKEN,
  ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED: process.env.ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED,
  ZOHO_BIGIN_MEMBERSHIP_ACTIVATION_ENABLED: process.env.ZOHO_BIGIN_MEMBERSHIP_ACTIVATION_ENABLED,
});
export const searchBiginMembershipRecords = memberLookupClient.searchBiginMembershipRecords;
export const lookupBiginMembership = memberLookupClient.lookupBiginMembership;
export const membershipActivationClient = memberLookupClient;
// Use the approved grant that already supports Contact search/read/create.
// The original registration connection remains unchanged.
export function syncTestMembershipApplication(application: BiginMembershipApplication) {
  return deliverTestApplication(application, { client: memberLookupClient });
}
export type { BiginMembershipApplication, BiginMembershipSyncOutcome } from './membership-applications';
