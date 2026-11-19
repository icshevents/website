import test from 'node:test';
import assert from 'node:assert/strict';
import {formatUKDate,formatUKLongDate,formatUKTime,formatUKDateTime,formatUKLongDateTime} from '../lib/uk-date-time.ts';
import {ukInput,ukISO,ukTime,ukLongDateTime} from '../public/event-forms-assets/uk-datetime.js';

test('UK dates and 24-hour times use London winter time',()=>{
 const iso='2026-12-27T13:00:00Z';
 assert.equal(formatUKDate(iso),'27/12/2026');
 assert.equal(formatUKDate('2026-12-27'),'27/12/2026');
 assert.equal(formatUKLongDate(iso),'Sunday, 27 December 2026');
 assert.equal(formatUKTime(iso),'13:00');
 assert.equal(formatUKDateTime(iso),'27/12/2026 13:00');
 assert.equal(formatUKLongDateTime(iso),'Sunday, 27 December 2026 · 13:00');
 assert.equal(ukTime(iso),'13:00');
 assert.equal(ukLongDateTime(iso),'Sunday, 27 December 2026 · 13:00');
 assert.equal(ukInput(iso),'2026-12-27T13:00');
 assert.equal(ukISO('2026-12-27T13:00'),iso.replace('.000','').replace('Z','.000Z'));
});
test('UK local summer time is always displayed an hour ahead of UTC',()=>{
 const iso='2027-07-01T12:00:00.000Z';
 assert.equal(formatUKTime(iso),'13:00');
 assert.equal(formatUKDateTime(iso),'01/07/2027 13:00');
 assert.equal(ukInput(iso),'2027-07-01T13:00');
 assert.equal(ukISO('2027-07-01T13:00'),iso);
});
test('nonexistent and ambiguous UK clock-change times are never silently shifted',()=>{
 for(const time of ['2027-03-28T01:30','2027-10-31T01:30','2027-13-02T12:00'])assert.throws(()=>ukISO(time));
});
