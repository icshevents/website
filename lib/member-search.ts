import { parsePhoneNumberFromString } from 'libphonenumber-js/min';
import { londonDate, parseDate } from './membership.ts';

export type MemberSearchInput =
  | { method: 'name'; firstName: string; lastName: string }
  | { method: 'email'; email: string }
  | { method: 'mobile'; mobile: string };
export type MemberSearchResult =
  | { status: 'found'; membershipDate: string; membershipExpiry: string; daysUntilExpiry: number }
  | { status: 'expired'; membershipExpiry: string }
  | { status: 'not_found' | 'ambiguous' | 'expired_undated' | 'dates_unavailable' };
export type MembershipSearchRecord = {
  id: string; fullName: string | null; email: string | null; mobile: string | null;
  membershipStatus: string | null; paymentStatus: string | null;
  membershipDate: string | null; membershipExpiry: string | null;
  membershipType?: string | null;
};
export class MemberSearchInputError extends Error {}
export const normaliseMemberName = (value: string) => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-GB');

export function normaliseMemberMobile(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 30 || !/^[+\d\s().-]+$/.test(value)) return null;
  let cleaned = value.trim().replace(/[\s().-]/g, '').replace(/^00/, '+');
  // Historic imports sometimes omitted the UK's leading zero.
  if (/^7\d{9}$/.test(cleaned)) cleaned = '0' + cleaned;
  if (/^44\d{10}$/.test(cleaned)) cleaned = '+' + cleaned;
  const phone = parsePhoneNumberFromString(cleaned, 'GB');
  return phone?.isValid() ? phone.number : null;
}

export function parseMemberSearch(value: unknown): MemberSearchInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MemberSearchInputError('Choose one search option and enter your details.');
  const input = value as Record<string, unknown>;
  const string = (key: string, max: number) => typeof input[key] === 'string' && (input[key] as string).length <= max ? (input[key] as string).normalize('NFKC').trim() : '';
  const only = (keys: string[]) => Object.keys(input).length === keys.length && Object.keys(input).every(key => keys.includes(key));
  if (input.method === 'name' && only(['method', 'firstName', 'lastName'])) {
    const firstName = string('firstName', 80).replace(/\s+/gu, ' '), lastName = string('lastName', 80).replace(/\s+/gu, ' ');
    const name = (v: string) => v.length > 0 && /\p{L}/u.test(v) && /^[\p{L}\p{M} .'’ʼ-]+$/u.test(v);
    if (name(firstName) && name(lastName)) return { method: 'name', firstName, lastName };
    throw new MemberSearchInputError('Enter both your first name and last name as registered with ICSH.');
  }
  if (input.method === 'email' && only(['method', 'email'])) {
    const email = string('email', 254).toLowerCase();
    if (/^[^\s@<>\u0000-\u001f]+@[^\s@<>\u0000-\u001f]+\.[^\s@<>\u0000-\u001f]+$/.test(email)) return { method: 'email', email };
    throw new MemberSearchInputError('Enter a valid email address.');
  }
  if (input.method === 'mobile' && only(['method', 'mobile'])) {
    const mobile = normaliseMemberMobile(input.mobile);
    if (mobile) return { method: 'mobile', mobile };
    throw new MemberSearchInputError('Enter a valid mobile number, including the country code for numbers outside the UK.');
  }
  throw new MemberSearchInputError('Use your first and last name, OR email address, OR mobile number.');
}

export function projectMembershipSearch(input: MemberSearchInput, records: MembershipSearchRecord[], hasMore: boolean, on = londonDate()): MemberSearchResult {
  if (hasMore) return { status: 'ambiguous' };
  const matches = new Map<string, MembershipSearchRecord>();
  for (const record of records) {
    const exact = input.method === 'name'
      ? record.fullName !== null && normaliseMemberName(record.fullName) === normaliseMemberName(`${input.firstName} ${input.lastName}`)
      : input.method === 'email'
        ? record.email?.trim().toLowerCase() === input.email
        : normaliseMemberMobile(record.mobile) === input.mobile;
    if (exact) matches.set(record.id, record);
  }
  if (!matches.size) return { status: 'not_found' };
  // Resolve ambiguity before checking status or dates. Never select the first,
  // newest or active record from people sharing the same search details.
  if (matches.size > 1) return { status: 'ambiguous' };
  const member = [...matches.values()][0];
  const start = member.membershipDate, expiry = member.membershipExpiry;
  if (!parseDate(on)) return { status: 'dates_unavailable' };
  const blank = (date: string | null) => date === null || date.trim() === '';
  // Owner policy: a uniquely matched contact with a blank term needs renewal.
  // Keep this distinct from a missed match and never invent an expiry date.
  if (blank(start) || blank(expiry)) return { status: 'expired_undated' };
  if (!start || !expiry || !parseDate(start) || !parseDate(expiry) || expiry <= start) return { status: 'dates_unavailable' };
  const daysUntilExpiry = Math.round((parseDate(expiry)!.getTime() - parseDate(on)!.getTime()) / 86_400_000);
  if (daysUntilExpiry <= 0) return { status: 'expired', membershipExpiry: expiry };
  if (member.membershipStatus !== 'Active' || !['Completed','Not required'].includes(member.paymentStatus??'')) return { status: 'dates_unavailable' };
  // Explicit public projection. No identity, payment, CRM ID or contact fields.
  return { status: 'found', membershipDate: start, membershipExpiry: expiry, daysUntilExpiry };
}
