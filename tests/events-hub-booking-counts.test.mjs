import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { bookedGuests } from '../lib/events-hub/booking-counts.ts';

test('the Events Hub counts confirmed live tickets by age across booking systems and pages', async () => {
  const requests = [];
  const ticketId = index => String(index).padStart(4, '0');
  const ticketRow = (id, tickets) => ({
    id: ticketId(id),
    form_id: 'winter-form',
    attendees: tickets.map(ticket => ({ ticket })),
  });

  const db = createClient('https://example.test', 'mock-key', {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: async input => {
        const { pathname, searchParams: filters } = new URL(input);
        const table = pathname.split('/').pop();
        requests.push(table);
        let rows;
        if (table === 'icsh_submissions') {
          assert.equal(filters.get('mode'), 'eq.live');
          assert.equal(filters.get('answers->record->>status'), 'in.(confirmed_paid,confirmed_free)');
          assert.match(filters.get('or'), /neq.disputed/);
          assert.equal(filters.get('order'), 'id.asc');
          assert.equal(filters.get('limit'), '250');
          rows = filters.has('id')
            ? [ticketRow(251, ['child'])]
            : Array.from({ length: 250 }, (_, index) => ticketRow(index + 1, ['member', 'nonmember', 'child']));
          if (filters.has('id')) assert.equal(filters.get('id'), 'gt.0250');
        } else if (table === 'icsh_iftari_bookings') {
          assert.equal(filters.get('mode'), 'eq.live');
          assert.equal(filters.get('needs_review'), 'eq.false');
          assert.equal(filters.get('status'), 'in.(paid,partially_refunded)');
          rows = [{ id: 'iftari-booking', event_slug: 'iftari', quantities: { member: 2, nonmember: 1, child: 4, under5: 1 } }];
        } else {
          assert.equal(table, 'icsh_entry_management');
          assert.match(filters.get('or'), /status\.not\.is\.null,deleted_at\.not\.is\.null/);
          rows = filters.get('kind') === 'eq.event' ? [{ kind: 'event', entry_id: ticketId(1) }] : [];
        }
        return Response.json(rows);
      },
    },
  });

  assert.deepEqual(await bookedGuests(db, [
    { id: 'winter', source_type: 'tickets', source_key: 'winter-form' },
    { id: 'iftari', source_type: 'iftari', source_key: 'iftari' },
    { id: 'empty', source_type: 'tickets', source_key: 'empty-form' },
    { id: 'external', source_type: 'none', source_key: null },
  ]), {
    winter: { adults: 498, children: 250 },
    iftari: { adults: 3, children: 5 },
    empty: { adults: 0, children: 0 },
  });
  assert.equal(requests.filter(table => table === 'icsh_submissions').length, 2);
});
