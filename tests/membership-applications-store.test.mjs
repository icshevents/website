import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveMembershipApplication, getMembershipApplication, listMembershipApplications,
  claimMembershipBiginSync, completeMembershipBiginSync, MembershipStoreError,
} from '../lib/membership-applications/store.ts';

const id = '2bceef65-0eba-4d40-9f48-508884dd65aa';
const claimId = '6c424b9f-5653-40ed-9e8e-757bfe9457ed';
const anotherId = 'c680017f-47af-41df-821c-84a8b1e1f5f6';
const time = '2026-10-22T12:00:00+00:00';
function input(changes = {}) {
  return {
    id, requestHash: 'a'.repeat(64), capabilityHash: 'b'.repeat(64),
    answers: { kind: 'new', firstName: 'Test', lastName: 'Applicant', dob: '01/01/1990', mobile: '07700900000', email: 'membership-test@example.invalid', education: 'no', studentDeclaration: false, terms: true, accuracy: true },
    category: 'standard', feePence: 2000, paymentStatus: 'awaiting_payment', ...changes,
  };
}
function row(changes = {}) {
  const value = input();
  return {
    id, reference: `TEST-MEM-${id.replaceAll('-', '').toUpperCase()}`,
    request_hash: value.requestHash, capability_hash: value.capabilityHash, answers: value.answers,
    category: value.category, fee_pence: value.feePence, currency: 'GBP', mode: 'test', test_data: true,
    payment_status: 'awaiting_payment', application_status: 'received', start_date: null, expiry_date: null,
    bigin_sync_status: 'awaiting_authorisation', bigin_record_id: null, bigin_synced_at: null,
    last_error_code: null, sync_attempts: 0, sync_claim_id: null, sync_lease_until: null,
    created_at: time, updated_at: time, ...changes,
  };
}
function database(data, error = null) {
  const calls = [];
  const response = () => Promise.resolve({ data, error });
  const query = {
    select: (...args) => { calls.push(['select', ...args]); return query; },
    eq: (...args) => { calls.push(['eq', ...args]); return query; },
    order: (...args) => { calls.push(['order', ...args]); return query; },
    limit: (...args) => { calls.push(['limit', ...args]); return response(); },
    maybeSingle: () => { calls.push(['maybeSingle']); return response(); },
  };
  return { calls, db: {
    rpc: (...args) => { calls.push(['rpc', ...args]); return response(); },
    from: (...args) => { calls.push(['from', ...args]); return query; },
  } };
}

test('saving uses one atomic RPC and accepts only a confirmed durable result', async () => {
  const { db, calls } = database({ application: row(), created: true });
  const saved = await saveMembershipApplication(input(), db);
  assert.equal(saved.created, true);
  assert.equal(saved.application.reference, row().reference);
  assert.equal(saved.application.biginSyncStatus, 'awaiting_authorisation');
  assert.equal(saved.application.paymentStatus, 'awaiting_payment');
  assert.equal(saved.application.startDate, null);
  assert.equal(saved.application.expiryDate, null);
  assert.equal(saved.application.testData, true);
  assert.deepEqual(calls, [['rpc', 'icsh_membership_application_save', {
    p_id: id, p_mode: 'test', p_request_hash: input().requestHash, p_capability_hash: input().capabilityHash,
    p_answers: input().answers, p_category: 'standard', p_fee_pence: 2000, p_payment_status: 'awaiting_payment',
  }]]);
});

test('an idempotent retry returns the original persisted result rather than inventing another record', async () => {
  const { db } = database({ application: row({ bigin_sync_status: 'synced', bigin_record_id: '9000000000001', bigin_synced_at: time }), created: false });
  const saved = await saveMembershipApplication(input(), db);
  assert.equal(saved.created, false);
  assert.equal(saved.application.id, id);
  assert.equal(saved.application.biginRecordId, '9000000000001');
  assert.equal(saved.application.biginSyncStatus, 'synced');
});

test('invalid or non-test data cannot reach the database', async () => {
  const { db, calls } = database({ application: row(), created: true });
  for (const value of [
    input({ id: 'not-an-id' }), input({ requestHash: 'bad' }), input({ capabilityHash: '' }),
    input({ answers: { ...input().answers, email: 'private@example.com' } }),
    input({ answers: { ...input().answers, terms: false } }),
    input({ answers: { ...input().answers, email: 'test@example.invalid\n' } }),
    input({ category: 'minor' }), input({ feePence: 0 }), input({ feePence: 2000, paymentStatus: 'not_required' }),
    input({ activationDate: '2026-10-22' }), input({ mode: 'invalid' }),
  ]) await assert.rejects(() => saveMembershipApplication(value, db), error => error instanceof MembershipStoreError && error.status === 400);
  assert.equal(calls.length, 0);
});

test('free applications preserve payment-not-required without membership activation', async () => {
  const { db } = database({ application: row({ category: 'student', fee_pence: 0, payment_status: 'not_required' }), created: true });
  const saved = await saveMembershipApplication(input({ category: 'student', feePence: 0, paymentStatus: 'not_required' }), db);
  assert.equal(saved.application.paymentStatus, 'not_required');
  assert.equal(saved.application.applicationStatus, 'received');
  assert.equal(saved.application.startDate, null);
});

test('database errors are classified without exposing provider text or personal data', async () => {
  for (const [code, status] of [['P2001', 409], ['P2002', 409], ['23505', 409], ['40001', 409], ['22023', 400], ['42501', 503], ['42P01', 503]]) {
    const { db } = database(null, { code, message: 'secret-token private@example.invalid' });
    await assert.rejects(() => saveMembershipApplication(input(), db), error => {
      assert.equal(error.status, status);
      assert.doesNotMatch(error.message, /secret-token|private@example/);
      return true;
    });
  }
  await assert.rejects(() => saveMembershipApplication(input(), { rpc: async () => { throw new Error('private token'); } }), error => error.code === 'MEMBERSHIP_STORAGE_UNAVAILABLE' && !error.message.includes('private token'));
});

test('untrusted or incompatible database results never become a success receipt', async () => {
  for (const savedRow of [
    row({ id: anotherId }), row({ request_hash: 'c'.repeat(64) }), row({ capability_hash: 'd'.repeat(64) }),
    row({ reference: 'OTHER' }), row({ mode: 'live' }), row({ test_data: false }),
    row({ application_status: 'active' }), row({ start_date: '2026-10-22' }), row({ expiry_date: '2027-10-22' }),
    row({ bigin_sync_status: 'synced' }),
  ]) {
    const { db } = database({ application: savedRow, created: true });
    await assert.rejects(() => saveMembershipApplication(input(), db), error => error.code === 'MEMBERSHIP_STORAGE_INVALID_RESPONSE');
  }
  for (const value of [null, {}, { application: row(), created: 'true' }]) {
    await assert.rejects(() => saveMembershipApplication(input(), database(value).db), error => error.code === 'MEMBERSHIP_STORAGE_INVALID_RESPONSE');
  }
});

test('private get and bounded list operations query only the membership table', async () => {
  const single = database(row());
  assert.equal((await getMembershipApplication(id, single.db)).id, id);
  assert.deepEqual(single.calls[0], ['from', 'icsh_membership_applications']);
  assert.deepEqual(single.calls.find(call => call[0] === 'eq'), ['eq', 'id', id]);
  assert.equal(await getMembershipApplication(id, database(null).db), null);
  const list = database([row()]);
  assert.equal((await listMembershipApplications(10, list.db)).length, 1);
  assert.deepEqual(list.calls.at(-1), ['limit', 10]);
  for (const limit of [0, 101, -1, 1.5]) await assert.rejects(() => listMembershipApplications(limit, list.db), error => error.status === 400);
});

test('a claim must be granted atomically to this exact worker before provider work can begin', async () => {
  assert.equal(await claimMembershipBiginSync(id, claimId, database(null).db), null);
  const claimed = row({ bigin_sync_status: 'syncing', sync_claim_id: claimId, sync_lease_until: time, sync_attempts: 1 });
  assert.equal((await claimMembershipBiginSync(id, claimId, database(claimed).db)).syncClaimId, claimId);
  for (const changes of [{ sync_claim_id: anotherId }, { bigin_sync_status: 'outcome_unknown' }, { sync_lease_until: null }]) {
    await assert.rejects(() => claimMembershipBiginSync(id, claimId, database({ ...claimed, ...changes }).db), error => error.code === 'MEMBERSHIP_STORAGE_INVALID_RESPONSE');
  }
});

test('known IDs survive uncertain completion and are returned for verification-only claims', async () => {
  const knownId = '9000000000001';
  const completed = database(row({ bigin_sync_status: 'outcome_unknown', bigin_record_id: knownId, last_error_code: 'ZOHO_UNAVAILABLE', sync_attempts: 1 }));
  const saved = await completeMembershipBiginSync(id, claimId, { status: 'outcome_unknown', biginRecordId: knownId, errorCode: 'ZOHO_UNAVAILABLE' }, completed.db);
  assert.equal(saved.biginRecordId, knownId);
  assert.equal(completed.calls[0][2].p_bigin_record_id, knownId);
  const retry = database(row({ bigin_sync_status: 'syncing', bigin_record_id: knownId, sync_claim_id: claimId, sync_lease_until: time, sync_attempts: 2 }));
  assert.equal((await claimMembershipBiginSync(id, claimId, retry.db)).biginRecordId, knownId);
});

test('completion stores only recognised error codes and verifies the returned final state', async () => {
  const failed = database(row({ bigin_sync_status: 'failed', last_error_code: 'MEMBERSHIP_SYNC_FAILED' }));
  await completeMembershipBiginSync(id, claimId, { status: 'failed', errorCode: 'token=secret, private@example.invalid' }, failed.db);
  assert.equal(failed.calls[0][2].p_error_code, 'MEMBERSHIP_SYNC_FAILED');
  const success = database(row({ bigin_sync_status: 'synced', bigin_record_id: '9000000000001', bigin_synced_at: time }));
  await completeMembershipBiginSync(id, claimId, { status: 'synced', biginRecordId: '9000000000001', errorCode: 'IGNORED' }, success.db);
  assert.equal(success.calls[0][2].p_error_code, null);
  await assert.rejects(() => completeMembershipBiginSync(id, claimId, { status: 'failed' }, database(row()).db), error => error.code === 'MEMBERSHIP_STORAGE_INVALID_RESPONSE');
  await assert.rejects(() => completeMembershipBiginSync(id, claimId, { status: 'synced', biginRecordId: '9000000000002' }, success.db), error => error.code === 'MEMBERSHIP_STORAGE_INVALID_RESPONSE');
});

test('fixed API and adapter review codes survive storage for organiser diagnosis', async () => {
  for (const [status, errorCode] of [
    ['awaiting_authorisation', 'BIGIN_AUTHORISATION_REQUIRED'],
    ['review_required', 'RENEWAL'], ['review_required', 'EXISTING_CONTACT'],
    ['review_required', 'SEARCH_INCOMPLETE'], ['review_required', 'PREVIOUS_CREATION_ATTEMPT'],
    ['outcome_unknown', 'CONTACT_VERIFICATION_MISMATCH'], ['outcome_unknown', 'SYNC_INTERRUPTED'],
    ['failed', 'INVALID_TEST_APPLICATION'], ['failed', 'INVALID_APPLICATION'],
  ]) {
    const { db, calls } = database(row({ bigin_sync_status: status, last_error_code: errorCode }));
    const saved = await completeMembershipBiginSync(id, claimId, { status, errorCode }, db);
    assert.equal(calls[0][2].p_error_code, errorCode);
    assert.equal(saved.lastErrorCode, errorCode);
  }
  const { db, calls } = database(row({ bigin_sync_status: 'failed', last_error_code: 'MEMBERSHIP_SYNC_FAILED' }));
  await completeMembershipBiginSync(id, claimId, { status: 'failed', errorCode: 'UNRECOGNISED_PROVIDER_MESSAGE' }, db);
  assert.equal(calls[0][2].p_error_code, 'MEMBERSHIP_SYNC_FAILED');
});

test('live storage accepts real email domains, sends mode to the atomic save, and exposes a live reference',async()=>{
 const realAnswers={...input().answers,email:'member@example.com'};
 const fixture=database({application:row({mode:'live',test_data:false,answers:realAnswers}),created:true});
 const saved=await saveMembershipApplication(input({mode:'live',answers:realAnswers}),fixture.db);
 assert.equal(fixture.calls[0][2].p_mode,'live');assert.equal(saved.application.testData,false);assert.match(saved.application.reference,/^MEM-/);assert.doesNotMatch(saved.application.reference,/TEST/);
 assert.equal(saved.application.startDate,null);assert.equal(saved.application.expiryDate,null);
});
