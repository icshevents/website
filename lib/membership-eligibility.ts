import { parsePhoneNumberFromString } from 'libphonenumber-js/min';
import { londonDate, parseDate } from './membership.ts';
import { membershipAnniversary } from './membership-validity.ts';
import { normaliseMemberName, type MemberSearchInput, type MembershipSearchRecord } from './member-search.ts';

export type MembershipIdentity = { kind: 'new' | 'renewal'; firstName: string; lastName: string; email: string; mobile: string };
export type RenewalStatus =
  | { status: 'inactive' }
  | { status: 'active'; currentExpiry: string; renewedExpiry: string };
export type MembershipEligibility =
  | { status: 'allowed'; mobileChanged?:true; nameChanged?:true; renewal?: RenewalStatus }
  | { status: 'active'; membershipDate: string; membershipExpiry: string; daysUntilExpiry: number }
  | { status: 'identity_conflict' | 'review_required' | 'renewal_required' | 'new_required' };
export type MembershipRecordSearch = { records: MembershipSearchRecord[]; hasMore: boolean };
export type MembershipIdentityLookup = (input: MemberSearchInput) => Promise<MembershipRecordSearch>;

/** Possible numbers include the reserved fictional numbers used by the test form. */
export function membershipMobileKey(value: string): string | null {
  if (value.length > 25 || !/^[\d() .+-]+$/.test(value)) return null;
  let text = value.trim().replace(/^00/, '+');
  if (/^7\d{9}$/.test(text)) text = '0' + text;
  if (/^44\d{10}$/.test(text)) text = '+' + text;
  const phone = parsePhoneNumberFromString(text, 'GB');
  return phone?.isPossible() ? phone.number : null;
}
export function parseMembershipIdentity(value: unknown): MembershipIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_MEMBERSHIP_IDENTITY');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 5 || !['kind', 'firstName', 'lastName', 'email', 'mobile'].every(key => Object.hasOwn(v, key)) ||
    !['new', 'renewal'].includes(String(v.kind))) throw new Error('INVALID_MEMBERSHIP_IDENTITY');
  const name = (text: unknown): text is string => typeof text === 'string' && text.trim().length > 0 && text.trim().length <= 80 && !/[<>\u0000-\u001f]/.test(text);
  if (!name(v.firstName) || !name(v.lastName) || typeof v.email !== 'string' || v.email.length > 254 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v.email.trim()) || typeof v.mobile !== 'string' || !membershipMobileKey(v.mobile)) throw new Error('INVALID_MEMBERSHIP_IDENTITY');
  return { kind: v.kind as MembershipIdentity['kind'], firstName: v.firstName.trim(), lastName: v.lastName.trim(), email: v.email.trim().toLowerCase(), mobile: membershipMobileKey(v.mobile)! };
}

export async function checkMembershipEligibility(value: MembershipIdentity, search: MembershipIdentityLookup, on = londonDate()): Promise<MembershipEligibility> {
  const identity = parseMembershipIdentity(value);
  if (!parseDate(on)) throw new Error('INVALID_MEMBERSHIP_CHECK_DATE');
  // Email identifies the member. A mobile number may be shared by a family;
  // never search it here or use another member's mobile as a uniqueness gate.
  const emailResult = await search({ method: 'email', email: identity.email });
  if (emailResult.hasMore) return { status: 'review_required' };
  const emails = [...new Map(emailResult.records
    .filter(record => record.email?.trim().toLowerCase() === identity.email)
    .map(record => [record.id, record])).values()];
  if (emails.length > 1) return { status: 'review_required' };
  if (!emails.length) return { status: identity.kind === 'new' ? 'allowed' : 'new_required' };
  const member = emails[0];
  const submittedName = identity.firstName + ' ' + identity.lastName;
  const mobileChanged = membershipMobileKey(member.mobile || '') !== identity.mobile;
  if (identity.kind === 'new' &&
    (normaliseMemberName(member.fullName ?? '') !== normaliseMemberName(submittedName) || mobileChanged)) return { status: 'identity_conflict' };
  // The registered email selects the renewal contact. Differences are verified
  // through that mailbox before saving, including changes to spelling or case.
  const nameChanged = member.firstName !== undefined && member.lastName !== undefined
    ? member.firstName?.trim() !== identity.firstName || member.lastName?.trim() !== identity.lastName
    : member.fullName?.trim() !== submittedName;
  const allowRenewal = (renewal: RenewalStatus): MembershipEligibility => ({
    status: 'allowed', ...(mobileChanged ? { mobileChanged: true } : {}), ...(nameChanged ? { nameChanged: true } : {}), renewal,
  });
  const start = member.membershipDate?.trim(), expiry = member.membershipExpiry?.trim();
  // The agreed lookup policy treats missing dates as needing renewal.
  if (!start || !expiry) return identity.kind === 'renewal' ? allowRenewal({ status: 'inactive' }) : { status: 'renewal_required' };
  if (!parseDate(start) || !parseDate(expiry) || start >= expiry) return { status: 'review_required' };
  if (expiry <= on) return identity.kind === 'renewal' ? allowRenewal({ status: 'inactive' }) : { status: 'renewal_required' };
  if (start > on || member.membershipStatus?.trim().toLowerCase() !== 'active') return { status: 'review_required' };
  // A verified existing member can renew at any time; the activation claim
  // preserves any remaining days and adds another calendar year to expiry.
  if (identity.kind === 'renewal') {
    const renewedExpiry = membershipAnniversary(expiry);
    return renewedExpiry ? allowRenewal({ status: 'active', currentExpiry: expiry, renewedExpiry }) : { status: 'review_required' };
  }
  return { status: 'active', membershipDate: start, membershipExpiry: expiry,
    daysUntilExpiry: Math.ceil((Date.parse(expiry + 'T12:00:00Z') - Date.parse(on + 'T12:00:00Z')) / 86400000) };
}

export function membershipEligibilityMessage(result: MembershipEligibility): string {
  switch (result.status) {
    case 'allowed': return 'Your details have been checked. You can continue.';
    case 'active': return 'You already have an active ICSH membership. Choose Membership Renewal if you would like to renew early.';
    case 'identity_conflict': return 'Your details do not match the membership record for this email address. Check your full name and membership email address, or contact ICSH for help. For new applications, also check the mobile number. Mobile numbers may be shared.';
    case 'review_required': return 'We need to confirm your membership details before you can continue. Please contact ICSH for help.';
    case 'renewal_required': return 'Your membership needs renewal. Please choose Membership Renewal to continue with your existing details.';
    case 'new_required': return 'We cannot find an existing membership under this email address. Check your details or choose New Member.';
  }
}

export function parseRenewalStatus(value: unknown): RenewalStatus | null {
  if (!value || typeof value !== 'object' || !('status' in value)) return null;
  if (value.status === 'inactive') return { status: 'inactive' };
  if (value.status !== 'active' || !('currentExpiry' in value) || !('renewedExpiry' in value) ||
    typeof value.currentExpiry !== 'string' || typeof value.renewedExpiry !== 'string' ||
    membershipAnniversary(value.currentExpiry) !== value.renewedExpiry) return null;
  return { status: 'active', currentExpiry: value.currentExpiry, renewedExpiry: value.renewedExpiry };
}

/** Explicit public boundary: never forward provider/contact extras. */
export function publicMembershipEligibility(result: MembershipEligibility): MembershipEligibility {
  if (result.status === 'active') {
    if (!parseDate(result.membershipDate) || !parseDate(result.membershipExpiry) || !Number.isSafeInteger(result.daysUntilExpiry) || result.daysUntilExpiry < 1) throw new Error('INVALID_MEMBERSHIP_DECISION');
    return { status: 'active', membershipDate: result.membershipDate, membershipExpiry: result.membershipExpiry, daysUntilExpiry: result.daysUntilExpiry };
  }
  if (!['allowed', 'identity_conflict', 'review_required', 'renewal_required', 'new_required'].includes(result.status)) throw new Error('INVALID_MEMBERSHIP_DECISION');
  if (result.status !== 'allowed') return { status: result.status };
  const renewal = parseRenewalStatus(result.renewal);
  if (result.renewal && !renewal) throw new Error('INVALID_MEMBERSHIP_DECISION');
  return { status: 'allowed', ...(result.mobileChanged === true ? { mobileChanged: true } : {}),
    ...(result.nameChanged === true ? { nameChanged: true } : {}), ...(renewal ? { renewal } : {}) };
}
