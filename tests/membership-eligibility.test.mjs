import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMembershipEligibility, membershipMobileKey } from '../lib/membership-eligibility.ts';
import { handleMembershipEligibility } from '../lib/membership-eligibility-api.ts';
const identity = { kind: 'new', firstName: 'Test', lastName: 'Member', email: 'member@example.invalid', mobile: '07700900123' };
const record = { id: '123456789', fullName: 'Test Member', email: identity.email, mobile: '+447700900123', membershipStatus: 'Active', paymentStatus: 'Completed', membershipDate: '2026-01-19', membershipExpiry: '2027-01-19' };
const search = records => async () => ({ records, hasMore: false });
const check = (value = identity, records = [record], on = '2026-10-22') => checkMembershipEligibility(value, search(records), on);

test('both joining and renewal block active members only after all three identifiers agree', async () => {
  for (const kind of ['new', 'renewal']) {
    assert.deepEqual(await check({ ...identity, kind }), { status: 'active', membershipDate: '2026-01-19', membershipExpiry: '2027-01-19', daysUntilExpiry: 89 });
  }
  assert.equal((await check({ ...identity, firstName: ' Test ', lastName: 'MEMBER', email: 'MEMBER@EXAMPLE.INVALID', mobile: '0044 7700 900123' })).status, 'active');
});

test('different people with identical names are allowed when both contact details are unique', async () => {
  assert.equal((await check(identity, [{ ...record, email: 'other@example.invalid', mobile: '07700900999' }])).status, 'allowed');
  assert.equal((await check(identity, [])).status, 'allowed');
  assert.equal((await check({ ...identity, kind: 'renewal' }, [])).status, 'new_required');
});

test('changing one identifier or using another person’s name cannot bypass uniqueness or expose dates', async () => {
  for (const changes of [
    { email: 'different@example.invalid' }, { mobile: '07700900999' }, { firstName: 'Another' },
  ]) assert.deepEqual(await check({ ...identity, ...changes }), { status: 'identity_conflict' });
  const other = { ...record, id: '999999999', email: 'other@example.invalid' };
  assert.deepEqual(await check(identity, [{ ...record, mobile: '07700900999' }, other]), { status: 'identity_conflict' });
});

test('shared email or phone, incomplete search and records changing between queries require review', async () => {
  assert.deepEqual(await check(identity, [record, { ...record, id: '222222222' }]), { status: 'review_required' });
  assert.deepEqual(await checkMembershipEligibility(identity, async () => ({ records: [record], hasMore: true }), '2026-10-22'), { status: 'review_required' });
  assert.deepEqual(await checkMembershipEligibility(identity, async input => ({ records: [{ ...record, membershipExpiry: input.method === 'email' ? '2027-01-19' : '2027-02-19' }], hasMore: false }), '2026-10-22'), { status: 'review_required' });
});

test('expired and undated members are directed to renewal while invalid or inconsistent terms require review', async () => {
  for (const changes of [{ membershipExpiry: '2026-10-22' }, { membershipDate: null }, { membershipExpiry: '' }]) {
    assert.equal((await check(identity, [{ ...record, ...changes }])).status, 'renewal_required');
    assert.equal((await check({ ...identity, kind: 'renewal' }, [{ ...record, ...changes }])).status, 'allowed');
  }
  for (const changes of [{ membershipDate: '2026-02-30' }, { membershipDate: '2026-12-01' }, { membershipStatus: 'Inactive' }, { membershipExpiry: '2025-01-19' }]) {
    assert.equal((await check(identity, [{ ...record, ...changes }])).status, 'review_required');
  }
  // Free memberships can be active without a fee payment; status and term govern.
  assert.equal((await check(identity, [{ ...record, paymentStatus: 'Not required' }])).status, 'active');
});

test('invalid identifiers stop before provider calls and provider failures never become permission to continue', async () => {
  let calls = 0;
  for (const changes of [{ mobile: '123' }, { email: 'bad' }, { firstName: '' }, { extra: true }]) {
    await assert.rejects(() => checkMembershipEligibility({ ...identity, ...changes }, async () => { calls++; return { records: [], hasMore: false }; }));
  }
  assert.equal(calls, 0);
  await assert.rejects(() => checkMembershipEligibility(identity, async () => { throw new Error('provider down'); }));
  for (const phone of ['07700 900123', '+44 7700 900123', '00447700900123', '7700900123', '447700900123']) assert.equal(membershipMobileKey(phone), '+447700900123');
});

const url = 'https://icsh.test/api/membership/eligibility';
const request = (body = identity, changes = {}) => new Request(url, { method: 'POST', headers: { origin: 'https://icsh.test', 'Content-Type': 'application/json', ...changes }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const deps = { secret: 'eligibility-test-secret-with-at-least-32-characters', rateLimit: async () => true, check: async () => ({ status: 'allowed' }) };

test('eligibility endpoint checks origin, input and rate limits before reading CRM', async () => {
  let checked = 0;
  const d = { ...deps, check: async () => { checked++; return { status: 'allowed' }; } };
  for (const [req, status] of [[request(identity, { origin: 'https://evil.test' }), 403], [request(identity, { 'Content-Type': 'text/plain' }), 415], [request({ ...identity, mobile: 'bad' }), 400], [request(' '.repeat(2001)), 413]]) {
    assert.equal((await handleMembershipEligibility(req, d)).status, status);
  }
  assert.equal((await handleMembershipEligibility(request(), { ...d, rateLimit: async () => false })).status, 429);
  assert.equal(checked, 0);
});

test('eligibility response only returns decision and verified dates, with no stored or cached contact data', async () => {
  const response = await handleMembershipEligibility(request(), { ...deps, check: async () => ({ status: 'active', membershipDate: '2026-01-19', membershipExpiry: '2027-01-19', daysUntilExpiry: 89, id: 'secret-contact-id', email: identity.email }) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['status', 'membershipDate', 'membershipExpiry', 'daysUntilExpiry'].sort());
  const unavailable = await handleMembershipEligibility(request(), { ...deps, check: async () => { throw new Error('private token'); } });
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(JSON.stringify(await unavailable.json()), /private token/);
});
