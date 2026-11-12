import { z } from 'zod';
import { londonDate, parseDate } from '../membership.ts';
import { membershipMobileKey } from '../membership-eligibility.ts';
import type { BookingLookup } from '../event-forms/booking-membership.ts';

export const IFTARI_SLUG = 'ramadan-iftari-2027';
export const ticketKeys = ['member', 'nonmember', 'child', 'under5'] as const;
export type TicketKey = typeof ticketKeys[number];
export const ticketLabels: Record<TicketKey, string> = {
  member: 'Adult ICSH Members (12+)', nonmember: 'Adult Non-Members (12+)',
  child: 'Children aged 5–11', under5: 'Children under 5',
};
const price = z.number().int().min(0).max(100000);
export const settingsSchema = z.object({
  version: z.number().int().positive(), title: z.string().trim().min(1).max(140),
  venue: z.string().trim().min(1).max(240),
  date: z.string().nullable().refine(v => v === null || Boolean(parseDate(v)), 'Enter a valid date.'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  status: z.enum(['draft', 'published', 'closed']),
  prices: z.object({ member: price.min(30), nonmember: price.min(30), child: price.min(30), under5: price.nullable() }).strict(),
  capacity: z.number().int().min(1).max(10000).nullable(),
  maxGuests: z.number().int().min(1).max(50), allowRepeatMemberDiscounts: z.boolean(),
}).strict();
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = {
  version: 1, title: 'ICSH Ramadan Iftari 2027', venue: 'The Clay Oven Restaurant, Wembley',
  date: null, time: null, status: 'draft',
  prices: { member: 2550, nonmember: 2800, child: 1300, under5: null },
  capacity: null, maxGuests: 12, allowRepeatMemberDiscounts: false,
};
const email = z.string().trim().pipe(z.email().max(254)).transform(v => v.toLowerCase());
const quantity = z.number().int().min(0).max(50);
export const quoteInputSchema = z.object({
  quantities: z.object({ member: quantity, nonmember: quantity, child: quantity, under5: quantity }).strict(),
  donation: z.string().max(20),
}).strict();
const name = z.string().trim().min(1).max(80).refine(v => !/[<>\u0000-\u001f]/.test(v), 'Enter a valid name.');
export const bookingInputSchema = quoteInputSchema.extend({
  id: z.uuid(), capability: z.string().regex(/^[a-f0-9]{64}$/),
  firstName: name, lastName: name, email,
  mobile: z.string().trim().max(25).refine(v => /^\+447\d{9}$/.test(membershipMobileKey(v) || ''), 'Enter a UK mobile number.'),
  memberEmails: z.array(email).max(50),
  expectedVersion: z.number().int().positive(), expectedTotal: z.number().int().min(0).max(12000000),
  website: z.literal(''),
}).strict();
export type BookingInput = z.infer<typeof bookingInputSchema>;
export type QuoteInput = z.infer<typeof quoteInputSchema>;
export type LineItem = { key: TicketKey | 'donation'; label: string; quantity: number; unitAmount: number; amount: number };
export type Quote = { version: number; lines: LineItem[]; tickets: number; donation: number; total: number; guests: number; currency: 'GBP' };
export class IftariError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export const gbp = (pence: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
export function donationPence(value: string) {
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(value)) throw new IftariError('Enter a donation with up to two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (amount > 1000000) throw new IftariError('The maximum additional donation is £10,000.');
  return amount;
}
export function quoteBooking(settings: Settings, input: QuoteInput): Quote {
  const guests = ticketKeys.reduce((n, key) => n + input.quantities[key], 0);
  if (guests < 1 || guests > settings.maxGuests) throw new IftariError(`Choose between 1 and ${settings.maxGuests} guests.`);
  if (input.quantities.under5 && settings.prices.under5 === null) throw new IftariError('Under-5 pricing is awaiting confirmation. Please contact ICSH before booking an under-5 place.');
  const lines: LineItem[] = ticketKeys.filter(key => input.quantities[key] > 0).map(key => ({ key, label: ticketLabels[key], quantity: input.quantities[key], unitAmount: settings.prices[key]!, amount: input.quantities[key] * settings.prices[key]! }));
  const tickets = lines.reduce((n, line) => n + line.amount, 0), donation = donationPence(input.donation);
  // A complimentary under-5 ticket alone cannot create a paid booking.
  if (tickets + donation < 30) throw new IftariError('Please include a paid ticket, or contact ICSH about complimentary places.');
  if (donation) lines.push({ key: 'donation', label: 'Optional ICSH Donation', quantity: 1, unitAmount: donation, amount: donation });
  return { version: settings.version, lines, tickets, donation, total: tickets + donation, guests, currency: 'GBP' };
}
export type MembershipStatus = 'active' | 'inactive' | 'expired' | 'not_found' | 'review' | 'unavailable';
export const membershipMessages: Record<MembershipStatus, string> = {
  active: 'Active ICSH Member – Verified', inactive: 'This membership is not active. Please use a non-member ticket.',
  expired: 'This membership has expired. Renew your membership or use a non-member ticket.',
  not_found: 'No active membership was found for this email. You can book non-member tickets.',
  review: 'Membership could not be verified. Contact ICSH or use a non-member ticket.',
  unavailable: 'Membership checks are temporarily unavailable. Please retry, or book non-member tickets.',
};
export async function verifyMember(value: string, lookup: BookingLookup, on = londonDate()): Promise<MembershipStatus> {
  const address = email.parse(value);
  try {
    const response = await lookup({ method: 'email', email: address });
    const matches = [...new Map(response.records.filter(r => r.email?.trim().toLowerCase() === address).map(r => [r.id, r])).values()];
    if (response.hasMore || matches.length > 1) return 'review';
    if (!matches.length) return 'not_found';
    const r = matches[0], start = r.membershipDate?.trim(), expiry = r.membershipExpiry?.trim();
    if (!start || !expiry || !parseDate(start) || !parseDate(expiry) || start >= expiry) return 'review';
    if (expiry <= on) return 'expired';
    // Active free student memberships also qualify; payment status is not an extra event eligibility condition.
    return r.membershipStatus?.trim().toLowerCase() === 'active' && start <= on ? 'active' : 'inactive';
  } catch { return 'unavailable'; }
}
export async function verifyMemberTickets(input: BookingInput, lookup: BookingLookup) {
  if (input.memberEmails.length !== input.quantities.member) throw new IftariError('Enter one membership email for every member ticket.');
  if (new Set(input.memberEmails).size !== input.memberEmails.length) throw new IftariError('Each member email can only be used once in this booking.');
  // Sequential, bounded lookups avoid exhausting the existing Zoho OAuth grant.
  for (let i = 0; i < input.memberEmails.length; i++) {
    const status = await verifyMember(input.memberEmails[i], lookup);
    if (status !== 'active') throw new IftariError(`Member ticket ${i + 1}: ${membershipMessages[status]}`, status === 'unavailable' ? 503 : 409);
  }
}
export function eventWhen(settings: Pick<Settings, 'date' | 'time'>) {
  const day = settings.date ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(settings.date + 'T12:00:00Z')) : 'Date to be confirmed';
  return `${day} · ${settings.time ? settings.time + ' (UK time)' : 'Time to be confirmed'}`;
}
