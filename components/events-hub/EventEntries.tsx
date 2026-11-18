'use client';

import EntryTable from '@/components/organiser/EntryTable';
import type {Entry} from '@/lib/events-hub/core';
import {bookingEntryView, entryDate, entryValues} from '@/lib/organiser-entries';

type Props = {
  eventId:string;
  entries:Entry[];
  busy:boolean;
  demo:boolean;
  onReview:(entry:Entry,status:string,notes:string)=>Promise<void>;
  filename?:string;
};

export default function EventEntries({entries,busy,demo,onReview,eventId,filename='icsh-event-entries.csv'}:Props) {
  return <EntryTable
    management={{kind:'event',eventId,demo}}
    title="Event form entries"
    filename={filename}
    columns={['Form','Name','Contact','Submitted (UK)','Booking status','Review status']}
    entries={entries.map(entry => {
      const flat = entryValues(entry.details);
      const find = (part:string) => Object.entries(flat).filter(([key]) => key.toLowerCase().includes(part))
        .map(([,value]) => String(value)).join(' · ');
      const booking = bookingEntryView(entry.kind, entry.details);
      const displayedDetails = booking ? entryValues(booking.details) : flat;
      const bookingStatus = entry.status.replaceAll('_',' ');

      return {
        id: entry.id,
        kind: entry.kind === 'iftari' ? 'iftari' as const : 'event' as const,
        cells: [
          entry.formTitle, (booking ? booking.booker : find('name')) || '—',
          find('email') || find('mobile') || '—', entryDate(entry.submittedAt),
          booking ? <div>
            {bookingStatus}
            <div><small>{booking.adults} {booking.adults === 1 ? 'adult' : 'adults'} · {booking.children} {booking.children === 1 ? 'child' : 'children'}</small></div>
          </div> : bookingStatus,
          entry.reviewStatus.replaceAll('_',' '),
        ],
        values: {
          Reference:entry.reference, Form:entry.formTitle, 'Submitted (UK)':entryDate(entry.submittedAt),
          'Booking status':entry.status, 'Review status':entry.reviewStatus, ...flat, 'Internal notes':entry.notes,
        },
        details: <div>
          <dl>
            {booking && booking.total !== null && <div><dt><strong>Total</strong></dt><dd>{booking.total}</dd></div>}
            {Object.entries(displayedDetails).map(([key,value]) =>
              <div key={key}><dt><strong>{key.replace(/([A-Z])/g,' $1')}</strong></dt><dd>{String(value)}</dd></div>
            )}
            {booking && <div>
              <dt><strong>Attendees</strong></dt>
              <dd>
                {booking.names.length > 0 && <ul>{booking.names.map((name,index) => <li key={index}>{name}</li>)}</ul>}
                {booking.unnamed > 0 && <span>{booking.unnamed === 1 ? '1 attendee name was not collected.' : `${booking.unnamed} attendee names were not collected.`}</span>}
                {!booking.names.length && !booking.unnamed && '—'}
              </dd>
            </div>}
          </dl>
          {entry.kind !== 'iftari' && <form className="hub-fields" onSubmit={event => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void onReview(entry,String(data.get('status')),String(data.get('notes')));
          }}>
            <label>Review status<select name="status" defaultValue={entry.reviewStatus}>
              <option value="new">New</option>
              <option value="reviewed">Reviewed</option>
              <option value="archived">Archived</option>
            </select></label>
            <label>Internal notes<textarea name="notes" defaultValue={entry.notes} maxLength={5000}/></label>
            <button className="button outline" disabled={busy||demo}>Save review</button>
          </form>}
        </div>,
      };
    })}
  />;
}
