import 'server-only';

import { createEventService } from '../event-forms/service.js';
import { organiserSession } from '../supabase/server';
import { checkMembershipEligibility } from '../membership-eligibility';
import { searchBiginMembershipRecords, syncTestMembershipApplication } from '../zoho/server';
import { handleMembershipAdmin, handleMembershipApplications, handleMembershipReceipt, membershipFailure, type MembershipApiDependencies } from './api';
import { claimMembershipBiginSync, completeMembershipBiginSync, getMembershipApplication, listMembershipApplications, saveMembershipApplication } from './store';
import type { MembershipApplication, MembershipBiginSyncOutcome } from './model';
import {isMembershipPaymentTest} from '../membership-pricing';

async function sync(application: MembershipApplication): Promise<MembershipBiginSyncOutcome> {
  if (!['new', 'renewal'].includes(application.answers.kind) || (![0, 1500, 2000].includes(application.feePence) && !(application.feePence===100&&isMembershipPaymentTest(application.answers)))) return { status: 'failed', errorCode: 'INVALID_APPLICATION' };
  if (!application.biginRecordId) {
    const eligibility = await checkMembershipEligibility({ kind: application.answers.kind as 'new' | 'renewal', firstName: application.answers.firstName, lastName: application.answers.lastName, email: application.answers.email, mobile: application.answers.mobile }, searchBiginMembershipRecords);
    if (eligibility.status !== 'allowed') return { status: 'review_required', errorCode: 'BIGIN_MATCH_REVIEW_REQUIRED' };
  }
  const result = await syncTestMembershipApplication({
    id: application.id, kind: application.answers.kind as 'new' | 'renewal', mode: application.mode, testData: application.testData,
    applicant: application.answers, annualFee: application.feePence / 100 as 0 | 1 | 15 | 20,
    biginContactId: application.biginRecordId,
    // The database cannot claim an unknown creation without a saved Contact ID.
    // A saved ID always causes readback only, never another Contact POST.
  });
  switch (result.status) {
    case 'writes_disabled': return { status: 'awaiting_authorisation', errorCode: 'BIGIN_AUTHORISATION_REQUIRED' };
    case 'review_required': return { status: 'review_required', errorCode: result.reason.toUpperCase() };
    case 'synced': return { status: 'synced', biginRecordId: result.contactId };
    case 'created_unverified': return { status: 'outcome_unknown', biginRecordId: result.contactId, errorCode: result.code };
    case 'failed': return { status: 'failed', errorCode: result.code };
    case 'outcome_unknown': return { status: 'outcome_unknown', errorCode: result.code };
  }
}

function dependencies(): MembershipApiDependencies {
  const db = createEventService();
  const secret = process.env.SUPABASE_SECRET_KEY ?? '';
  return {
    secret,
    checkIdentity: identity => checkMembershipEligibility(identity, searchBiginMembershipRecords),
    available: async () => {
      const check = await db.from('icsh_membership_applications').select('id', { head: true, count: 'exact' });
      return !check.error;
    },
    rateLimit: async (key, maximum) => {
      const result = await db.rpc('icsh_event_rate_limit', { p_key: key, p_max: maximum });
      if (result.error) throw new Error('Membership rate limit unavailable');
      return result.data === true;
    },
    save: input => saveMembershipApplication(input, db),
    get: id => getMembershipApplication(id, db),
    list: () => listMembershipApplications(100, db),
    session: organiserSession,
    claim: (id, claimId) => claimMembershipBiginSync(id, claimId, db),
    complete: (id, claimId, outcome) => completeMembershipBiginSync(id, claimId, outcome, db),
    sync,
    writesEnabled: process.env.ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED === 'true',
  };
}

export async function runMembershipApplications(request: Request) {
  try { return await handleMembershipApplications(request, dependencies()); }
  catch (error) { return membershipFailure(error); }
}
export async function runMembershipReceipt(request: Request, id: string) {
  try { return await handleMembershipReceipt(request, id, dependencies()); }
  catch (error) { return membershipFailure(error); }
}
export async function runMembershipAdmin(request: Request, id?: string) {
  try { return await handleMembershipAdmin(request, id, dependencies()); }
  catch (error) { return membershipFailure(error, 'delivery'); }
}

/** Called only after the page has verified the organiser session. */
export async function membershipApplicationsForOrganiser() {
  return listMembershipApplications(100, createEventService());
}

