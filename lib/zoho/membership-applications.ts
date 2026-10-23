// Import via lib/zoho/server.ts in application code. This injectable module
// performs no persistence; the caller owns the durable application and lease.
import { membershipMobileKey } from '../membership-eligibility.ts';
import {isMembershipPaymentTest} from '../membership-pricing.ts';
import {
  BiginContactCreateError, ZohoError, createBiginContact, getBiginContact, searchBiginContactsByEmail,
  type BiginContact, type BiginContactSearch, type BiginPendingContactCreate, type ZohoEnvironment, type ZohoErrorCode,
} from './client.ts';

export type BiginMembershipApplication = {
  id: string;
  kind: 'new' | 'renewal';
  mode: 'test' | 'live';
  testData: boolean;
  applicant: { firstName: string; lastName: string; email: string; mobile: string };
  /** Server-calculated pounds, never a fee trusted from the submitted browser. */
  annualFee: 0 | 1 | 15 | 20;
  /** Read from durable state, never from the public form payload. */
  biginContactId?: string | null;
  /** A prior creation attempt with no saved ID must be reconciled manually. */
  creationAttempted?: boolean;
};

export type BiginMembershipSyncOutcome =
  | { status: 'writes_disabled' }
  | { status: 'review_required'; reason: 'renewal' | 'existing_contact' | 'search_incomplete' | 'previous_creation_attempt' }
  | { status: 'synced'; contactId: string }
  | { status: 'created_unverified'; contactId: string; code: ZohoErrorCode | 'CONTACT_VERIFICATION_MISMATCH' }
  | { status: 'failed'; code: ZohoErrorCode | 'INVALID_TEST_APPLICATION' }
  | { status: 'outcome_unknown'; code: ZohoErrorCode };

export type BiginMembershipClient = {
  searchBiginContactsByEmail(email: string): Promise<BiginContactSearch>;
  getBiginContact(contactId: string): Promise<BiginContact>;
  createBiginContact(payload: BiginPendingContactCreate): Promise<{ contactId: string }>;
};

const defaultClient: BiginMembershipClient = { searchBiginContactsByEmail, getBiginContact, createBiginContact };
const validId = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{0,29}$/.test(value);
const safeCode = (error: unknown): ZohoErrorCode => error instanceof ZohoError ? error.code : 'ZOHO_UNAVAILABLE';

function validApplication(value: BiginMembershipApplication): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !['test', 'live'].includes(value.mode) || value.testData !== (value.mode === 'test') ||
    typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.id) ||
    !['new', 'renewal'].includes(value.kind) || ![0, 1, 15, 20].includes(value.annualFee) ||
    (value.creationAttempted !== undefined && typeof value.creationAttempted !== 'boolean') ||
    (value.biginContactId !== undefined && value.biginContactId !== null && !validId(value.biginContactId))) return false;
  const applicant = value.applicant;
  if (!applicant || typeof applicant !== 'object' || Array.isArray(applicant)) return false;
  if(value.annualFee===1&&!isMembershipPaymentTest(applicant))return false;
  for (const name of [applicant.firstName, applicant.lastName]) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80 || /[<>\u0000-\u001f]/.test(name)) return false;
  }
  if (typeof applicant.email !== 'string' || applicant.email.length > 254 || /[\u0000-\u001f]/.test(applicant.email) ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/i.test(applicant.email.trim()) || (value.mode === 'test' && !applicant.email.trim().toLowerCase().endsWith('@example.invalid'))) return false;
  if (typeof applicant.mobile !== 'string' || applicant.mobile.length > 25 || !/^[\d() .+-]+$/.test(applicant.mobile) ||
    applicant.mobile.replace(/\D/g, '').length < 7 || applicant.mobile.replace(/\D/g, '').length > 15) return false;
  return true;
}

function contactMatches(contact: BiginContact, id: string, payload: BiginPendingContactCreate): boolean {
  return Boolean(contact && contact.id === id && contact.email === payload.Email &&
    contact.firstName?.trim() === payload.First_Name && contact.lastName?.trim() === payload.Last_Name &&
    typeof contact.mobile === 'string' && membershipMobileKey(contact.mobile) === membershipMobileKey(payload.Mobile) &&
    contact.membershipStatus === payload.Membership_Status && contact.paymentStatus === payload.Payment_Status && contact.emailOptOut === true &&
    contact.membershipDate === null && contact.membershipExpiry === null);
}

/**
 * Deliver one stored application as an inactive Contact. The caller must hold a durable
 * lease and persist the outcome. An existing Contact is never updated. The
 * result is for organisers/server code and must not be forwarded wholesale to
 * an anonymous applicant (which would disclose existing-member information).
 */
export async function syncTestMembershipApplication(
  application: BiginMembershipApplication,
  options: { client?: BiginMembershipClient; env?: ZohoEnvironment } = {},
): Promise<BiginMembershipSyncOutcome> {
  if (!validApplication(application)) return { status: 'failed', code: 'INVALID_TEST_APPLICATION' };
  if (application.kind === 'renewal') return { status: 'review_required', reason: 'renewal' };
  const env = options.env ?? process.env;
  if (env.ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED !== 'true') return { status: 'writes_disabled' };
  const client = options.client ?? defaultClient;
  // New, explicit values for controlled test applications. They are not a map
  // of existing membership statuses. No membership benefits or dates are set.
  const payload: BiginPendingContactCreate = {
    First_Name: application.applicant.firstName.trim(), Last_Name: application.applicant.lastName.trim(),
    Email: application.applicant.email.trim().toLowerCase(), Mobile: application.applicant.mobile.trim(),
    Membership_Status: 'Inactive', Payment_Status: application.annualFee === 0 ? 'Not required' : 'Awaiting payment', Email_Opt_Out: true,
  };
  const savedContactId = application.biginContactId;
  const verify = async (id: string): Promise<BiginMembershipSyncOutcome> => {
    try {
      const contact = await client.getBiginContact(id);
      return contactMatches(contact, id, payload) ? { status: 'synced', contactId: id } :
        { status: 'created_unverified', contactId: id, code: 'CONTACT_VERIFICATION_MISMATCH' };
    } catch (error) {
      return { status: 'created_unverified', contactId: id, code: safeCode(error) };
    }
  };
  if (savedContactId) return verify(savedContactId);
  if (application.creationAttempted) return { status: 'review_required', reason: 'previous_creation_attempt' };

  try {
    // Search afresh within the caller's durable delivery lease. An email match
    // can identify a review candidate, but is not verified member identity.
    const search = await client.searchBiginContactsByEmail(payload.Email);
    if (!search || !Array.isArray(search.matches) || typeof search.hasMore !== 'boolean') throw new ZohoError('ZOHO_INVALID_RESPONSE');
    if (search.matches.length) return { status: 'review_required', reason: 'existing_contact' };
    if (search.hasMore) return { status: 'review_required', reason: 'search_incomplete' };
  } catch (error) {
    return { status: 'failed', code: safeCode(error) };
  }

  let contactId: string;
  try {
    const created = await client.createBiginContact(payload);
    if (!created || !validId(created.contactId)) return { status: 'outcome_unknown', code: 'ZOHO_INVALID_RESPONSE' };
    contactId = created.contactId;
  } catch (error) {
    if (error instanceof BiginContactCreateError || !(error instanceof ZohoError)) {
      return { status: 'outcome_unknown', code: safeCode(error) };
    }
    // Only the production transport's pre-POST failures use ordinary ZohoError.
    return error.code === 'ZOHO_MEMBERSHIP_WRITES_DISABLED' ? { status: 'writes_disabled' } : { status: 'failed', code: error.code };
  }
  return verify(contactId);
}
