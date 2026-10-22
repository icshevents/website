import { membershipMobileKey } from '../membership-eligibility.ts';
import { normaliseMemberName, parseMemberSearch, type MemberSearchInput, type MembershipSearchRecord } from '../member-search.ts';
import { londonDate, parseDate } from '../membership.ts';

export type EventMemberIdentity = { method: 'email' | 'mobile'; value: string };
type Attendee = { name: string; ticket: string; membershipIdentity?: EventMemberIdentity };
type Event = { id: string; version?: number; membershipCheckRequired?: boolean };
type Lookup = (input: MemberSearchInput) => Promise<{ records: MembershipSearchRecord[]; hasMore: boolean }>;
export type EventMemberResult =
  | { status: 'active'; verified: true; membershipDate: string; membershipExpiry: string; checkedOn: string }
  | { status: 'inactive'; verified: false; reason: 'expired' | 'expired_undated' | 'inactive' | 'unpaid' | 'not_started'; membershipExpiry?: string; checkedOn: string }
  | { status: 'not_found' | 'ambiguous' | 'identity_mismatch' | 'review_required'; verified: false; checkedOn: string };
export class EventMembershipError extends Error {
  readonly status: number;
  readonly membership?: EventMemberResult;
  readonly attendeeIndex?: number;
  constructor(message: string, status = 400, membership?: EventMemberResult, attendeeIndex?: number) {
    super(message); this.name = 'EventMembershipError'; this.status = status; this.membership = membership; this.attendeeIndex = attendeeIndex;
  }
}
function attendeeIdentity(attendee: Attendee) {
  if (!attendee.name?.trim() || attendee.name.length > 120 || /[<>\u0000-\u001f]/.test(attendee.name)) throw new EventMembershipError('Enter the attendee’s full name as recorded in Bigin.');
  const identity = attendee.membershipIdentity;
  if (!identity || typeof identity.value !== 'string' || identity.value.length > 254) throw new EventMembershipError('Enter this attendee’s own email address or phone number to check member pricing.');
  let input: MemberSearchInput;
  try {
    if (identity.method === 'email') input = parseMemberSearch({ method: 'email', email: identity.value });
    else if (identity.method === 'mobile') {
      const mobile = membershipMobileKey(identity.value);
      if (!mobile) throw new Error('Invalid phone');
      input = { method: 'mobile', mobile };
    } else throw new Error('Invalid method');
  } catch { throw new EventMembershipError('Enter a valid email address or phone number for this attendee.'); }
  return { input, key: JSON.stringify([normaliseMemberName(attendee.name), input]) };
}

/** Read-only, exact matching. A group contact never qualifies another attendee. */
export async function lookupEventAttendee(attendee: Attendee, lookup: Lookup, on = londonDate()): Promise<{ result: EventMemberResult; contactId?: string }> {
  const { input } = attendeeIdentity(attendee);
  if (!parseDate(on)) throw new EventMembershipError('Membership checking is temporarily unavailable.', 503);
  let response: Awaited<ReturnType<Lookup>>;
  try { response = await lookup(input); }
  catch { throw new EventMembershipError('Membership could not be checked right now. Try again later, or choose an available nonmember ticket.', 503); }
  if (response.hasMore) return { result: { status: 'ambiguous', verified: false, checkedOn: on } };
  const matches = new Map<string, MembershipSearchRecord>();
  for (const record of response.records) {
    const exact = input.method === 'email' ? record.email?.trim().toLowerCase() === input.email : input.method === 'mobile' && record.mobile && membershipMobileKey(record.mobile) === input.mobile;
    if (exact) matches.set(record.id, record);
  }
  if (!matches.size) return { result: { status: 'not_found', verified: false, checkedOn: on } };
  if (matches.size > 1) return { result: { status: 'ambiguous', verified: false, checkedOn: on } };
  const member = [...matches.values()][0];
  if (normaliseMemberName(member.fullName ?? '') !== normaliseMemberName(attendee.name)) return { result: { status: 'identity_mismatch', verified: false, checkedOn: on } };
  const start = member.membershipDate?.trim(), expiry = member.membershipExpiry?.trim();
  if (!start || !expiry) return { result: { status: 'inactive', verified: false, reason: 'expired_undated', checkedOn: on } };
  if (!parseDate(start) || !parseDate(expiry) || start >= expiry) return { result: { status: 'review_required', verified: false, checkedOn: on } };
  if (expiry <= on) return { result: { status: 'inactive', verified: false, reason: 'expired', membershipExpiry: expiry, checkedOn: on } };
  if (start > on) return { result: { status: 'inactive', verified: false, reason: 'not_started', checkedOn: on } };
  if (member.membershipStatus?.trim().toLowerCase() !== 'active') return { result: { status: 'inactive', verified: false, reason: 'inactive', checkedOn: on } };
  if (member.paymentStatus?.trim().toLowerCase() !== 'completed') return { result: { status: 'inactive', verified: false, reason: 'unpaid', checkedOn: on } };
  return { contactId: member.id, result: { status: 'active', verified: true, membershipDate: start, membershipExpiry: expiry, checkedOn: on } };
}

// The opaque proof exists only inside this server process. Browser-submitted
// flags, stale quote results and copied JSON can never become a verification.
type Proof = { eventId: string; eventVersion: number; checkedOn: string; entries: Map<number, { key: string; result: EventMemberResult }> };
const proofs = new WeakMap<object, Proof>();
export async function prepareEventMembershipChecks(event: Event, attendees: Attendee[], lookup: Lookup, on = londonDate()): Promise<object | null> {
  if (event.membershipCheckRequired !== true) return null;
  const needed = attendees.map((attendee, index) => ({ attendee, index })).filter(item => item.attendee.ticket !== 'nonmember');
  if (!needed.length) return null;
  const entries: Proof['entries'] = new Map();
  const contacts = new Set<string>();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, needed.length) }, async () => {
    while (next < needed.length) {
      const { attendee, index } = needed[next++];
      const { key } = attendeeIdentity(attendee);
      const checked = await lookupEventAttendee(attendee, lookup, on);
      if (!checked.result.verified) throw new EventMembershipError(`Attendee ${index + 1}: ${eventMembershipMessage(checked.result)}`, 409, checked.result, index);
      if (!checked.contactId || contacts.has(checked.contactId)) throw new EventMembershipError('Each member ticket must belong to a different member. Check the details entered for each attendee.', 409);
      contacts.add(checked.contactId); entries.set(index, { key, result: checked.result });
    }
  }));
  const proof = Object.freeze({});
  proofs.set(proof, { eventId: event.id, eventVersion: event.version ?? 0, checkedOn: on, entries });
  return proof;
}
export function verifiedEventAttendee(event: Event, attendee: Attendee, index: number, proof: object | null | undefined, on = londonDate()): EventMemberResult | null {
  if (event.membershipCheckRequired !== true || attendee.ticket === 'nonmember') return null;
  const checked = proof && proofs.get(proof), entry = checked && checked.entries.get(index);
  if (!checked || !entry || checked.eventId !== event.id || checked.eventVersion !== (event.version ?? 0) || checked.checkedOn !== on || entry.key !== attendeeIdentity(attendee).key) throw new EventMembershipError('Membership needs to be checked again before confirming these tickets. Review the registration again.', 409);
  return { ...entry.result };
}
export function eventMembershipMessage(result: EventMemberResult): string {
  switch (result.status) {
    case 'active': return 'Active membership confirmed. This attendee qualifies for the active paid member ticket rate.';
    case 'inactive': return result.reason === 'unpaid' ? 'Event discounts require an active membership with completed membership payment. Choose the standard event rate.' : result.reason === 'expired' ? `Membership expired on ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(result.membershipExpiry + 'T12:00:00Z'))}. Choose an available nonmember ticket, or renew membership before booking a member ticket.` : 'The active paid member discount could not be confirmed. Choose a standard ticket or contact ICSH.';
    case 'not_found': return 'No membership record was found under these details. Check this attendee’s details or choose an available nonmember ticket.';
    case 'ambiguous': return 'These contact details match more than one record. Use this attendee’s other contact detail, or contact ICSH.';
    case 'identity_mismatch': return 'The full name does not match the membership record for these contact details. Check this attendee’s own details.';
    case 'review_required': return 'We could not confirm the membership dates. Contact ICSH, or choose an available nonmember ticket.';
  }
}
