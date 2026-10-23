import { parsePhoneNumberFromString } from 'libphonenumber-js/min';
import { londonDate, parseDate } from './membership.ts';
import { normaliseMemberName, type MemberSearchInput, type MembershipSearchRecord } from './member-search.ts';

export type MembershipIdentity = { kind: 'new' | 'renewal'; firstName: string; lastName: string; email: string; mobile: string };
export type MembershipEligibility =
  | { status: 'allowed' }
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
  // Each identifier is checked independently. Name-only matches must never block
  // unrelated people, and a different phone cannot evade an existing email.
  const [emailResult, phoneResult] = await Promise.all([
    search({ method: 'email', email: identity.email }),
    search({ method: 'mobile', mobile: identity.mobile }),
  ]);
  if (emailResult.hasMore || phoneResult.hasMore) return { status: 'review_required' };
  const unique = (records: MembershipSearchRecord[]) => [...new Map(records.map(record => [record.id, record])).values()];
  const emails = unique(emailResult.records.filter(record => record.email?.trim().toLowerCase() === identity.email));
  const phones = unique(phoneResult.records.filter(record => record.mobile && membershipMobileKey(record.mobile) === identity.mobile));
  if (emails.length > 1 || phones.length > 1) return { status: 'review_required' };
  if (!emails.length && !phones.length) return { status: identity.kind === 'new' ? 'allowed' : 'new_required' };
  if (emails.length !== 1 || phones.length !== 1 || emails[0].id !== phones[0].id) return { status: 'identity_conflict' };
  const member = emails[0];
  // Check both returned projections so a changing CRM record fails closed.
  const agrees = (record: MembershipSearchRecord) => record.email?.trim().toLowerCase() === identity.email &&
    !!record.mobile && membershipMobileKey(record.mobile) === identity.mobile &&
    normaliseMemberName(record.fullName ?? '') === normaliseMemberName(identity.firstName + ' ' + identity.lastName);
  if (!agrees(member) || !agrees(phones[0])) return { status: 'identity_conflict' };
  if (member.membershipDate !== phones[0].membershipDate || member.membershipExpiry !== phones[0].membershipExpiry ||
    member.membershipStatus !== phones[0].membershipStatus) return { status: 'review_required' };
  const start = member.membershipDate?.trim(), expiry = member.membershipExpiry?.trim();
  // The agreed lookup policy treats missing dates as needing renewal.
  if (!start || !expiry) return { status: identity.kind === 'renewal' ? 'allowed' : 'renewal_required' };
  if (!parseDate(start) || !parseDate(expiry) || start >= expiry) return { status: 'review_required' };
  if (expiry <= on) return { status: identity.kind === 'renewal' ? 'allowed' : 'renewal_required' };
  if (start > on || member.membershipStatus?.trim().toLowerCase() !== 'active') return { status: 'review_required' };
  return { status: 'active', membershipDate: start, membershipExpiry: expiry,
    daysUntilExpiry: Math.ceil((Date.parse(expiry + 'T12:00:00Z') - Date.parse(on + 'T12:00:00Z')) / 86400000) };
}

export function membershipEligibilityMessage(result: MembershipEligibility): string {
  switch (result.status) {
    case 'allowed': return 'Your details have been checked. You can continue.';
    case 'active': return 'You are still an active ICSH member. You do not need to join or renew yet.';
    case 'identity_conflict': return 'An email address or phone number is already linked to a member, but the details do not all agree. Check your full name, email and phone number, or contact ICSH for help.';
    case 'review_required': return 'We need to confirm your membership details before you can continue. Please contact ICSH for help.';
    case 'renewal_required': return 'Your membership needs renewal. Please choose Membership Renewal to continue with your existing details.';
    case 'new_required': return 'We cannot find an existing membership under these contact details. Check your details or choose New Member.';
  }
}

/** Explicit public boundary: never forward provider/contact extras. */
export function publicMembershipEligibility(result: MembershipEligibility): MembershipEligibility {
  if (result.status === 'active') {
    if (!parseDate(result.membershipDate) || !parseDate(result.membershipExpiry) || !Number.isSafeInteger(result.daysUntilExpiry) || result.daysUntilExpiry < 1) throw new Error('INVALID_MEMBERSHIP_DECISION');
    return { status: 'active', membershipDate: result.membershipDate, membershipExpiry: result.membershipExpiry, daysUntilExpiry: result.daysUntilExpiry };
  }
  if (!['allowed', 'identity_conflict', 'review_required', 'renewal_required', 'new_required'].includes(result.status)) throw new Error('INVALID_MEMBERSHIP_DECISION');
  return { status: result.status };
}
