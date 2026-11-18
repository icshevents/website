import type { createEventService } from '../event-forms/service.js';
import type { HubEvent } from './core.ts';

export type BookingCounts = { adults: number; children: number; fundsCollectedPence: number };
const wholePounds = new Intl.NumberFormat('en-GB', {
  style: 'currency', currency: 'GBP', maximumFractionDigits: 0, minimumFractionDigits: 0,
});
export const formatFundsCollected = (pence: number) => wholePounds.format(pence / 100);
type BookingEvent = Pick<HubEvent, 'id' | 'source_type' | 'source_key' | 'form_ids'>;

type TicketRow = {
  id: string; form_id: string; attendees: { ticket: string }[] | null; status: string;
  payment_status: string | null; verified: boolean | null;
  amount: number | null; refunded_amount: number | null;
};
type IftariRow = {
  id: string;
  event_slug: string; needs_review: boolean; total: number; refunded_amount: number; paid_at: string | null;
  quantities: { member: number; nonmember: number; child: number; under5: number };
};
type EntryRow = { kind: string; entry_id: string };

const pageSize = 250;

async function readPages<Row, Key extends keyof Row>(
  key: Key,
  query: (after: Row[Key] | undefined) => PromiseLike<{ data: Row[] | null; error: unknown }>,
) {
  const rows: Row[] = [];
  let after: Row[Key] | undefined;
  for (;;) {
    const { data, error } = await query(after);
    if (error || !data) throw new Error('Booking totals unavailable');
    rows.push(...data);
    if (data.length < pageSize) return rows;
    after = data[data.length - 1][key];
  }
}

export async function bookedGuests(db: ReturnType<typeof createEventService>, events: BookingEvent[]) {
  const primaryTickets = new Map<string, string>();
  const tickets = new Map<string, string>();
  const iftari = new Map<string, string>();
  const counts: Record<string, BookingCounts> = {};
  for (const event of events) {
    if (!event.source_key) continue;
    if (event.source_type === 'tickets') {
      primaryTickets.set(event.source_key, event.id);
      for (const formId of [event.source_key, ...event.form_ids]) tickets.set(formId, event.id);
    } else if (event.source_type === 'iftari') iftari.set(event.source_key, event.id);
    else continue;
    counts[event.id] = { adults: 0, children: 0, fundsCollectedPence: 0 };
  }
  if (!Object.keys(counts).length) return counts;

  const [ticketRows, iftariRows, excluded] = await Promise.all([
    tickets.size ? readPages<TicketRow, 'id'>('id', after => {
      const query = db.from('icsh_submissions')
        .select('id,form_id,attendees:answers->record->attendees,status:answers->record->>status,payment_status:answers->record->payment->>status,verified:answers->record->payment->verified,amount:answers->record->payment->amount,refunded_amount:answers->record->payment->refundedAmount')
        .in('form_id', [...tickets.keys()])
        .eq('mode', 'live')
        .or('answers->record->>status.in.(confirmed_paid,confirmed_free),answers->record->payment->>status.in.(paid,partially_refunded)')
        .order('id').limit(pageSize);
      return (after ? query.gt('id', after) : query).overrideTypes<TicketRow[], { merge: false }>();
    }) : [],
    iftari.size ? readPages<IftariRow, 'id'>('id', after => {
      const query = db.from('icsh_iftari_bookings').select('id,event_slug,quantities,needs_review,total,refunded_amount,paid_at')
        .in('event_slug', [...iftari.keys()])
        .eq('mode', 'live')
        .in('status', ['paid', 'partially_refunded'])
        .order('id').limit(pageSize);
      return (after ? query.gt('id', after) : query).overrideTypes<IftariRow[], { merge: false }>();
    }) : [],
    Promise.all(['event', 'iftari'].map(kind => readPages<EntryRow, 'entry_id'>('entry_id', after => {
      const query = db.from('icsh_entry_management').select('kind,entry_id')
        .in('event_id', Object.keys(counts))
        .eq('kind', kind)
        .or('status.not.is.null,deleted_at.not.is.null')
        .order('entry_id').limit(pageSize);
      return (after ? query.gt('entry_id', after) : query).overrideTypes<EntryRow[], { merge: false }>();
    }))),
  ]);

  const excludedEntries = new Set(excluded.flat().map(row => row.kind + ':' + row.entry_id));
  for (const row of ticketRows) {
    const total = counts[tickets.get(row.form_id)!];
    if (row.verified && (row.payment_status === 'paid' || row.payment_status === 'partially_refunded')
        && row.amount !== null && row.refunded_amount !== null) {
      total.fundsCollectedPence += row.amount - row.refunded_amount;
    }
    if (!primaryTickets.has(row.form_id) || row.payment_status === 'disputed'
        || !['confirmed_paid', 'confirmed_free'].includes(row.status) || excludedEntries.has('event:' + row.id)) continue;
    for (const attendee of row.attendees ?? []) {
      if (attendee.ticket === 'child') total.children++;
      else total.adults++;
    }
  }
  for (const row of iftariRows) {
    const total = counts[iftari.get(row.event_slug)!];
    if (row.paid_at) total.fundsCollectedPence += row.total - row.refunded_amount;
    if (row.needs_review || excludedEntries.has('iftari:' + row.id)) continue;
    total.adults += row.quantities.member + row.quantities.nonmember;
    total.children += row.quantities.child + row.quantities.under5;
  }
  return counts;
}
