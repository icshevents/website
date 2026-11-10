import { parseMemberSearch, type MemberSearchInput, type MembershipSearchRecord } from '../member-search.ts';
import { londonDate, parseDate } from '../membership.ts';

export type BookingEvent = {
  id: string; version?: number; pricingStrategy?: string;
  rates: { member: number; pensioner: number; student: number; nonmember: number };
};
export type BookingLookup = (input: MemberSearchInput) => Promise<{ records: MembershipSearchRecord[]; hasMore: boolean }>;
export type BookingPrice = {
  memberStatus: 'active' | 'inactive' | 'non_member' | 'ambiguous' | 'unavailable' | 'unverified';
  discountEligible: boolean; unitAmount: number | null; total: number | null;
  quantity: number; currency: 'GBP'; configurationVersion: number; checkedOn: string;
  priceRule: string; canRegister: boolean;
};
export type BookingDiagnostics = {
  emailSearched: string; found: boolean | null; hasMore: boolean; matchedCount: number;
  records: Array<{ contactId: string; membershipType: string | null; membershipStatus: string | null;
    paymentStatus: string | null; membershipDate: string | null; membershipExpiry: string | null }>;
};
type Proof = { eventId: string; version: number; email: string; quantity: number; fallback: boolean; quote: BookingPrice };
const proofs = new WeakMap<object, Proof>();
export const BOOKING_LOOKUP_ERROR = "We couldn't verify your ICSH membership automatically. Please try again or continue as a non-member.";

/** A fresh read at signup. Shared emails remain ambiguous even if one record is active. */
export async function prepareBookingPrice(event: BookingEvent, email: string, quantity: number, lookup: BookingLookup,
  continueAsNonMember = false, on = londonDate()): Promise<{ quote: BookingPrice; proof: object; diagnostics: BookingDiagnostics }> {
  const input = parseMemberSearch({ method: 'email', email });
  if (input.method !== 'email' || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 12 || !parseDate(on) || event.pricingStrategy !== 'booking_email') throw new Error('INVALID_BOOKING_PRICE_REQUEST');
  for (const amount of (['member','pensioner','student','nonmember'] as const).map(key => event.rates[key])) if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1000000) throw new Error('INVALID_EVENT_RATES');
  const diagnostics: BookingDiagnostics = { emailSearched: input.email, found: null, hasMore: false, matchedCount: 0, records: [] };
  let memberStatus: BookingPrice['memberStatus'] = 'unverified', discountEligible = false;
  let priceRule = 'nonmember_by_choice', unitAmount: number | null = event.rates.nonmember;
  if (!continueAsNonMember) {
    try {
      const response = await lookup(input);
      const matches = [...new Map(response.records.filter(r => r.email?.trim().toLowerCase() === input.email).map(r => [r.id, r])).values()];
      diagnostics.found = Boolean(matches.length); diagnostics.hasMore = response.hasMore; diagnostics.matchedCount = matches.length;
      diagnostics.records = matches.map(r => ({ contactId: r.id, membershipType: r.membershipType ?? null, membershipStatus: r.membershipStatus,
        paymentStatus: r.paymentStatus, membershipDate: r.membershipDate, membershipExpiry: r.membershipExpiry }));
      if (response.hasMore || matches.length > 1) { memberStatus = 'ambiguous'; priceRule = 'duplicate_email_review'; unitAmount = null; }
      else if (!matches.length) { memberStatus = 'non_member'; priceRule = 'no_membership_record'; }
      else {
        const r = matches[0], start = r.membershipDate?.trim(), expiry = r.membershipExpiry?.trim();
        const datesValid = start && expiry && parseDate(start) && parseDate(expiry) && start < expiry && start <= on && expiry > on;
        const active = r.membershipStatus?.trim().toLowerCase() === 'active' && datesValid;
        const paid = r.paymentStatus?.trim().toLowerCase() === 'completed';
        if (active) {
          memberStatus = 'active'; discountEligible = paid;
          unitAmount = paid ? event.rates.member : event.rates.nonmember;
          priceRule = paid ? 'active_paid_member' : 'active_without_completed_payment';
        } else { memberStatus = 'inactive'; priceRule = 'inactive_or_expired'; }
      }
    } catch { memberStatus = 'unavailable'; priceRule = 'lookup_unavailable'; unitAmount = null; }
  }
  const quote: BookingPrice = { memberStatus, discountEligible, unitAmount, total: unitAmount === null ? null : unitAmount * quantity,
    quantity, currency: 'GBP', configurationVersion: event.version ?? 0, checkedOn: on, priceRule, canRegister: unitAmount !== null };
  const proof = Object.freeze({}); proofs.set(proof, { eventId: event.id, version: event.version ?? 0, email: input.email, quantity, fallback: continueAsNonMember, quote: { ...quote } });
  return { quote, proof, diagnostics };
}

/** Public quote JSON is never accepted as authority to discount a booking. */
export function verifiedBookingPrice(event: BookingEvent, email: string, quantity: number, fallback: boolean, proof: object, on = londonDate()): BookingPrice {
  const p = proof && proofs.get(proof);
  if (!p || p.eventId !== event.id || p.version !== (event.version ?? 0) || p.email !== email.trim().toLowerCase() || p.quantity !== quantity || p.fallback !== fallback || p.quote.checkedOn !== on || !p.quote.canRegister) throw new Error('BOOKING_PRICE_RECHECK_REQUIRED');
  return { ...p.quote };
}
