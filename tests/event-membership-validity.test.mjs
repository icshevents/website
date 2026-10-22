import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { members, verifyMembership, quoteRegistration, register, registrationSchema } from '../lib/event-forms/domain.js';

const event = {
  id: '11111111-1111-4111-8111-111111111111', title: 'Synthetic membership test', status: 'published',
  startsAt: '2028-11-01T12:00:00Z', capacity: 12, questions: [],
  rates: { member: 500, nonmember: 1000, pensioner: 400, student: 0 },
};
function inputFor(membershipId = 'TEST-MEMBER-001') {
  return {
    eventId: event.id, idempotencyKey: randomUUID(),
    contact: { name: 'Synthetic Tester', email: 'synthetic@example.test', phone: '' },
    attendees: [{ name: 'Synthetic Member', ticket: 'member', membershipId }],
    answers: {}, consent: true, testData: true, website: '',
  };
}
const stateFor = () => ({ events: [event], registrations: [] });

test('synthetic member checks expose provisional calendar dates without claiming a live lookup', () => {
  for (const [id, startDate, expiryDate] of [
    ['test-member-001', '2026-10-01', '2027-10-01'],
    ['TEST-MEMBER-002', '2026-09-15', '2027-09-15'],
  ]) {
    assert.deepEqual(verifyMembership(id, '2026-10-22'), {
      mode: 'test', verified: true,
      validity: { status: 'current', startDate, expiryDate, source: 'bigin_created_time', provisional: true },
      source: 'Synthetic fixture; live member lookup is not enabled',
    });
  }
});

test('synthetic verification includes the start day and excludes the expiry anniversary', () => {
  for (const [on, status, verified] of [
    ['2026-09-30', 'not_started', false],
    ['2026-10-01', 'current', true],
    ['2027-09-30', 'current', true],
    ['2027-10-01', 'expired', false],
    ['2027-10-02', 'expired', false],
  ]) {
    const result = verifyMembership('TEST-MEMBER-001', on);
    assert.equal(result.validity.status, status, on);
    assert.equal(result.verified, verified, on);
  }
});

test('expiry, inactive status, unpaid status and unresolved dates each prevent verification', () => {
  assert.equal(members['TEST-EXPIRED-001'].active, true);
  assert.equal(members['TEST-EXPIRED-001'].paid, true);
  for (const [id, status] of [
    ['TEST-EXPIRED-001', 'expired'],
    ['TEST-INACTIVE-001', 'current'],
    ['TEST-UNPAID-001', 'current'],
    ['UNKNOWN-MEMBER', 'unresolved'],
  ]) {
    const result = verifyMembership(id, '2026-10-22');
    assert.equal(result.validity.status, status, id);
    assert.equal(result.verified, false, id);
  }
  const invalidReference = verifyMembership('TEST-MEMBER-001', '2026-02-30');
  assert.equal(invalidReference.validity.status, 'unresolved');
  assert.equal(invalidReference.verified, false);
});

test('quote and final registration use the same current membership result and unchanged event rates', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-22T12:00:00Z') });
  const input = registrationSchema.parse({ ...inputFor(), attendees: [
    ...inputFor().attendees,
    { name: 'Synthetic Nonmember', ticket: 'nonmember' },
    { name: 'Synthetic Pensioner', ticket: 'pensioner' },
    { name: 'Synthetic Student', ticket: 'student' },
  ] });
  const quote = quoteRegistration(event, input);
  assert.equal(quote.total, 1900);
  assert.deepEqual(quote.attendees.map(a => a.unitAmount), [500, 1000, 400, 0]);
  assert.deepEqual(quote.attendees[0].membership, verifyMembership('TEST-MEMBER-001', '2026-10-22'));
  assert.ok(quote.attendees.slice(1).every(a => a.membership === null));
  const state = stateFor();
  const saved = register(state, input, 'synthetic-capability-hash');
  assert.equal(saved.total, quote.total);
  assert.deepEqual(saved.attendees, quote.attendees);
  assert.equal(saved.mode, 'test');
  assert.equal(saved.paymentProvider, 'simulated');
  assert.equal(state.registrations.length, 1);
});

test('final registration rechecks a membership that expired after its quote at London midnight', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2027-09-30T22:30:00Z') });
  const input = registrationSchema.parse(inputFor());
  assert.equal(quoteRegistration(event, input).attendees[0].membership.verified, true);
  t.mock.timers.setTime(new Date('2027-09-30T23:30:00Z').getTime());
  const state = stateFor();
  assert.throws(() => register(state, input, 'synthetic-capability-hash'), /active test membership ID/);
  assert.equal(state.registrations.length, 0);
});

test('submitted membership dates and status cannot override server fixtures at quote or registration', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-22T12:00:00Z') });
  for (const membershipId of ['TEST-EXPIRED-001', 'TEST-INACTIVE-001', 'TEST-UNPAID-001', 'UNKNOWN-MEMBER']) {
    const submitted = inputFor(membershipId);
    submitted.on = '2025-09-01';
    submitted.attendees[0] = {
      ...submitted.attendees[0], active: true, paid: true,
      Created_Time: '2026-10-01T12:00:00+01:00', correctedStartDate: '2026-10-01',
      membership: { verified: true, validity: { status: 'current', expiryDate: '2099-01-01' } },
    };
    const parsed = registrationSchema.parse(submitted);
    assert.ok(!('on' in parsed));
    assert.deepEqual(Object.keys(parsed.attendees[0]).sort(), ['membershipId', 'name', 'ticket']);
    for (const input of [submitted, parsed]) {
      assert.throws(() => quoteRegistration(event, input), /active test membership ID/, membershipId);
      const state = stateFor();
      assert.throws(() => register(state, input, 'synthetic-capability-hash'), /active test membership ID/, membershipId);
      assert.equal(state.registrations.length, 0);
    }
  }
});
