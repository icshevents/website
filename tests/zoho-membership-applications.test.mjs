import test from 'node:test';
import assert from 'node:assert/strict';
import { syncTestMembershipApplication } from '../lib/zoho/membership-applications.ts';
import { BiginContactCreateError, ZohoError } from '../lib/zoho/client.ts';

const enabled = { ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED: 'true' };
const application = () => ({
  id: '11111111-1111-4111-8111-111111111111', kind: 'new', mode: 'test', testData: true,
  applicant: { firstName: 'Test', lastName: 'Applicant', email: 'applicant@example.invalid', mobile: '+44 7700 900001' }, annualFee: 20,
});
const contact = () => ({
  id: '123', email: 'applicant@example.invalid', firstName: 'Test', lastName: 'Applicant', mobile: '+447700900001',
  membershipStatus: 'Pending application', paymentStatus: 'Awaiting payment', emailOptOut: true,
});
function fakeClient(overrides = {}) {
  const calls = [];
  return { calls, client: {
    searchBiginContactsByEmail: async email => { calls.push(['search', email]); return overrides.search ? overrides.search(email) : { matches: [], hasMore: false }; },
    createBiginContact: async payload => { calls.push(['create', payload]); return overrides.create ? overrides.create(payload) : { contactId: '123' }; },
    getBiginContact: async id => { calls.push(['get', id]); return overrides.get ? overrides.get(id) : contact(); },
  } };
}

test('the coordinator is disabled by default and makes no provider calls', async () => {
  const { calls, client } = fakeClient();
  assert.deepEqual(await syncTestMembershipApplication(application(), { client, env: {} }), { status: 'writes_disabled' });
  assert.deepEqual(calls, []);
});

test('only validated fictional test applications enter the delivery path', async () => {
  const examples = [
    { ...application(), mode: 'live' }, { ...application(), testData: false },
    { ...application(), annualFee: '20' }, { ...application(), annualFee: 21 }, { ...application(), kind: 'other' },
    { ...application(), id: '' }, { ...application(), creationAttempted: 'false' }, { ...application(), biginContactId: '../Contacts' },
    ...['real@example.com', 'person@example.invalid.attacker.test', 'person@@example.invalid', 'person@example.invalid\n'].map(email => ({ ...application(), applicant: { ...application().applicant, email } })),
    { ...application(), applicant: { ...application().applicant, lastName: '<b>Test</b>' } },
    { ...application(), applicant: { ...application().applicant, mobile: 'abc' } }, null,
  ];
  const { calls, client } = fakeClient();
  for (const value of examples) assert.deepEqual(await syncTestMembershipApplication(value, { client, env: enabled }), { status: 'failed', code: 'INVALID_TEST_APPLICATION' });
  assert.deepEqual(calls, []);
});

test('new paid application searches, creates pending data, then verifies the saved record', async () => {
  const input = application(); const original = JSON.stringify(input);
  const { calls, client } = fakeClient();
  assert.deepEqual(await syncTestMembershipApplication(input, { client, env: enabled }), { status: 'synced', contactId: '123' });
  assert.deepEqual(calls.map(call => call[0]), ['search', 'create', 'get']);
  assert.deepEqual(calls[1][1], {
    First_Name: 'Test', Last_Name: 'Applicant', Email: 'applicant@example.invalid', Mobile: '+44 7700 900001',
    Membership_Status: 'Pending application', Payment_Status: 'Awaiting payment', Email_Opt_Out: true,
  });
  assert.equal(JSON.stringify(input), original);
  assert.doesNotMatch(JSON.stringify(calls[1][1]), /Created_Time|Member_ID|Member_Year|DOB|Description|expiry|activation|category/i);
});

test('free applications remain pending and explicitly record no payment requirement', async () => {
  const { calls, client } = fakeClient({ get: () => ({ ...contact(), paymentStatus: 'Not required' }) });
  assert.deepEqual(await syncTestMembershipApplication({ ...application(), annualFee: 0 }, { client, env: enabled }), { status: 'synced', contactId: '123' });
  assert.equal(calls[1][1].Payment_Status, 'Not required');
  assert.equal(calls[1][1].Membership_Status, 'Pending application');
});

test('renewals never search, create or overwrite an existing membership', async () => {
  const { calls, client } = fakeClient();
  for (const env of [enabled, {}]) assert.deepEqual(await syncTestMembershipApplication({ ...application(), kind: 'renewal' }, { client, env }), { status: 'review_required', reason: 'renewal' });
  assert.deepEqual(calls, []);
});

test('any existing email match or incomplete search requires review without a write', async () => {
  for (const search of [
    { matches: [{ id: '999', email: 'applicant@example.invalid' }], hasMore: false },
    { matches: [{ id: '998' }, { id: '999' }], hasMore: true },
    { matches: [], hasMore: true },
  ]) {
    const { calls, client } = fakeClient({ search: () => search });
    const result = await syncTestMembershipApplication(application(), { client, env: enabled });
    assert.deepEqual(result, { status: 'review_required', reason: search.matches.length ? 'existing_contact' : 'search_incomplete' });
    assert.deepEqual(calls.map(call => call[0]), ['search']);
    assert.doesNotMatch(JSON.stringify(result), /applicant@|999|998/);
  }
});

test('search failure is a safe failed delivery and does not proceed to creation', async () => {
  const { calls, client } = fakeClient({ search: () => { throw new ZohoError('ZOHO_SCOPE_MISMATCH'); } });
  assert.deepEqual(await syncTestMembershipApplication(application(), { client, env: enabled }), { status: 'failed', code: 'ZOHO_SCOPE_MISMATCH' });
  assert.deepEqual(calls.map(call => call[0]), ['search']);
});

test('a prior unknown creation without a saved ID is never retried', async () => {
  const { calls, client } = fakeClient();
  assert.deepEqual(await syncTestMembershipApplication({ ...application(), creationAttempted: true }, { client, env: enabled }), { status: 'review_required', reason: 'previous_creation_attempt' });
  assert.deepEqual(calls, []);
});

test('a saved Contact ID permits readback only, including repeated reconciliation', async () => {
  const { calls, client } = fakeClient();
  const input = { ...application(), biginContactId: '123', creationAttempted: true };
  for (let i = 0; i < 2; i++) assert.deepEqual(await syncTestMembershipApplication(input, { client, env: enabled }), { status: 'synced', contactId: '123' });
  assert.deepEqual(calls, [['get', '123'], ['get', '123']]);
});

test('post-creation verification failures retain the confirmed ID for no-recreate recovery', async () => {
  for (const get of [
    () => { throw new ZohoError('ZOHO_SCOPE_MISMATCH'); },
    () => ({ ...contact(), id: '999' }), () => ({ ...contact(), membershipStatus: 'Active' }),
    () => ({ ...contact(), email: 'other@example.invalid' }), () => ({ ...contact(), paymentStatus: 'Paid' }),
    () => ({ ...contact(), emailOptOut: false }),
  ]) {
    const { calls, client } = fakeClient({ get });
    const result = await syncTestMembershipApplication(application(), { client, env: enabled });
    assert.equal(result.status, 'created_unverified'); assert.equal(result.contactId, '123');
    assert.deepEqual(calls.map(call => call[0]), ['search', 'create', 'get']);
  }
});

test('ambiguous Contact POST outcomes remain unknown and are never automatically retried', async () => {
  for (const create of [
    () => { throw new BiginContactCreateError('ZOHO_INVALID_RESPONSE'); },
    () => { throw new Error('private@example.test fixture-secret'); },
    () => ({ contactId: 'not-numeric' }), () => null,
  ]) {
    const { calls, client } = fakeClient({ create });
    const result = await syncTestMembershipApplication(application(), { client, env: enabled });
    assert.equal(result.status, 'outcome_unknown');
    assert.doesNotMatch(JSON.stringify(result), /private@example|fixture-secret/);
    assert.deepEqual(calls.map(call => call[0]), ['search', 'create']);
  }
});

test('pre-POST transport errors can be retried after configuration is corrected', async () => {
  for (const code of ['ZOHO_AUTHENTICATION_FAILED', 'ZOHO_NOT_CONFIGURED', 'ZOHO_MEMBERSHIP_WRITES_DISABLED']) {
    const { client } = fakeClient({ create: () => { throw new ZohoError(code); } });
    assert.deepEqual(await syncTestMembershipApplication(application(), { client, env: enabled }), code === 'ZOHO_MEMBERSHIP_WRITES_DISABLED' ? { status: 'writes_disabled' } : { status: 'failed', code });
  }
});
