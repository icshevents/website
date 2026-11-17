import type { createEventService } from '../event-forms/service.js';
import type { HubEvent } from './core.ts';

export type BookingCounts = { adults: number; children: number };
type BookingEvent = Pick<HubEvent, 'id' | 'source_type' | 'source_key'>;

type TicketRow = { id: string; form_id: string; attendees: { ticket: string }[] };
type IftariRow = {
  id: string;
  event_slug: string;
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
  const tickets = new Map<string, string>();
  const iftari = new Map<string, string>();
  const counts: Record<string, BookingCounts> = {};
  for (const event of events) {
    if (!event.source_key) continue;
    const source = event.source_type === 'tickets' ? tickets : event.source_type === 'iftari' ? iftari : null;
    if (!source) continue;
    source.set(event.source_key, event.id);
    counts[event.id] = { adults: 0, children: 0 };
  }
  if (!Object.keys(counts).length) return counts;

  const [ticketRows, iftariRows, excluded] = await Promise.all([
    tickets.size ? readPages<TicketRow, 'id'>('id', after => {
      const query = db.from('icsh_submissions')
        .select('id,form_id,attendees:answers->record->attendees')
        .in('form_id', [...tickets.keys()])
        .eq('mode', 'live')
        .in('answers->record->>status', ['confirmed_paid', 'confirmed_free'])
        .or('answers->record->payment->>status.is.null,answers->record->payment->>status.neq.disputed')
        .order('id').limit(pageSize);
      return (after ? query.gt('id', after) : query).overrideTypes<TicketRow[], { merge: false }>();
    }) : [],
    iftari.size ? readPages<IftariRow, 'id'>('id', after => {
      const query = db.from('icsh_iftari_bookings').select('id,event_slug,quantities')
        .in('event_slug', [...iftari.keys()])
        .eq('mode', 'live').eq('needs_review', false)
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
    if (excludedEntries.has('event:' + row.id)) continue;
    const total = counts[tickets.get(row.form_id)!];
    for (const attendee of row.attendees) {
      if (attendee.ticket === 'child') total.children++;
      else total.adults++;
    }
  }
  for (const row of iftariRows) {
    if (excludedEntries.has('iftari:' + row.id)) continue;
    const total = counts[iftari.get(row.event_slug)!];
    total.adults += row.quantities.member + row.quantities.nonmember;
    total.children += row.quantities.child + row.quantities.under5;
  }
  return counts;
}
