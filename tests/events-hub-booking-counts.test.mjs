import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { bookedGuests, formatFundsCollected } from '../lib/events-hub/booking-counts.ts';

test('the Events Hub counts confirmed live tickets by age across booking systems and pages', async () => {
  const requests = [];
  const ticketId = index => String(index).padStart(4, '0');
  const ticketRow = (id, tickets) => ({
    id: ticketId(id),
    form_id: 'winter-form',
    attendees: tickets.map(ticket => ({ ticket })),
    status: 'confirmed_paid',
    payment_status: 'paid',
    verified: true,
    amount: 4625,
    refunded_amount: 0,
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
          assert.match(filters.get('or'), /confirmed_paid,confirmed_free.*paid,partially_refunded/);
          assert.match(filters.get('form_id'), /extra-winter-form/);
          assert.equal(filters.get('order'), 'id.asc');
          assert.equal(filters.get('limit'), '250');
          rows = filters.has('id')
            ? [
              {...ticketRow(251, ['child']), payment_status:'partially_refunded', amount:925, refunded_amount:100},
              {...ticketRow(252, ['member']), form_id:'extra-winter-form', status:'cancelled', amount:1850},
              {...ticketRow(253, ['member']), payment_status:'disputed'},
              {...ticketRow(254, ['member']), status:'confirmed_free', verified:false, amount:0},
            ]
            : Array.from({ length: 250 }, (_, index) => ticketRow(index + 1, ['member', 'nonmember', 'child']));
          if (filters.has('id')) assert.equal(filters.get('id'), 'gt.0250');
        } else if (table === 'icsh_iftari_bookings') {
          assert.equal(filters.get('mode'), 'eq.live');
          assert.equal(filters.get('status'), 'in.(paid,partially_refunded)');
          const iftari = {id:'iftari-booking', event_slug:'iftari', quantities:{member:2,nonmember:1,child:4,under5:1},
            total:15000,refunded_amount:250,paid_at:'2026-11-18T15:00:00Z',needs_review:false};
          rows = [iftari, {...iftari,id:'under-review',total:3000,refunded_amount:0,needs_review:true}];
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
    { id: 'winter', source_type: 'tickets', source_key: 'winter-form', form_ids:['winter-form','extra-winter-form'] },
    { id: 'iftari', source_type: 'iftari', source_key: 'iftari', form_ids:[] },
    { id: 'empty', source_type: 'tickets', source_key: 'empty-form', form_ids:[] },
    { id: 'external', source_type: 'none', source_key: null, form_ids:[] },
  ]), {
    winter: { adults: 499, children: 250, fundsCollectedPence: 250*4625+825+1850 },
    iftari: { adults: 3, children: 5, fundsCollectedPence: 17750 },
    empty: { adults: 0, children: 0, fundsCollectedPence: 0 },
  });
  assert.equal(requests.filter(table => table === 'icsh_submissions').length, 2);
});

test('funds are rounded once after summing exact pence', () => {
  assert.equal(formatFundsCollected(0), '£0');
  assert.equal(formatFundsCollected(12049), '£120');
  assert.equal(formatFundsCollected(12050), '£121');
  assert.equal(formatFundsCollected(123456), '£1,235');
});
