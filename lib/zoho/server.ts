import 'server-only';
import {createMembershipZohoClient} from './membership-client';
import { syncTestMembershipApplication as deliverTestApplication, type BiginMembershipApplication } from './membership-applications';

export { getZohoConfiguration } from './client';
export { checkBiginConnection } from './bigin';
export { checkCampaignsConnection } from './campaigns';
export { handleZohoCheck } from './check';
export { searchBiginContactsByEmail, getBiginContact, createBiginContact } from './client';
// Separate lookup credentials preserve the existing registration connection.
// A partial configuration fails closed; never mix two OAuth clients or grants.
const memberLookupClient = createMembershipZohoClient(process.env);
export const searchBiginMembershipRecords = memberLookupClient.searchBiginMembershipRecords;
export const lookupBiginMembership = memberLookupClient.lookupBiginMembership;
export const membershipActivationClient = memberLookupClient;
// Use the approved grant that already supports Contact search/read/create.
// The original registration connection remains unchanged.
export function syncTestMembershipApplication(application: BiginMembershipApplication) {
  return deliverTestApplication(application, { client: memberLookupClient });
}
export type { BiginMembershipApplication, BiginMembershipSyncOutcome } from './membership-applications';
