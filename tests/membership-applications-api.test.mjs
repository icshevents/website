import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { setImmediate as nextTurn } from 'node:timers/promises';
import {
  handleMembershipApplications, handleMembershipReceipt, handleMembershipAdmin,
} from '../lib/membership-applications/api.ts';
import { MembershipStoreError, saveMembershipApplication } from '../lib/membership-applications/store.ts';
import { signedPublicSession } from '../lib/event-forms/security.js';

const origin = 'https://icsh.test';
const endpoint = `${origin}/api/membership/applications`;
const adminEndpoint = `${origin}/api/admin/membership/applications`;
const id = '2bceef65-0eba-4d40-9f48-508884dd65aa';
const otherId = 'c680017f-47af-41df-821c-84a8b1e1f5f6';
const receiptToken = 'a'.repeat(64);
const contactId = '9000000000001';
const time = '2026-10-22T12:00:00+00:00';
const secret = 'membership-api-test-secret-never-used-outside-tests';
const hash = value => createHash('sha256').update(value).digest('hex');
const publicFields = [
  'id', 'reference', 'createdAt', 'category', 'feePence', 'currency',
  'paymentStatus', 'biginSyncStatus', 'mode',
].sort();

function answers(changes = {}) {
  return {
    kind: 'new', firstName: 'Test', lastName: 'Applicant', dob: '01/01/1990',
    mobile: '07700900000', email: 'membership-test@example.invalid', education: 'no',
    studentDeclaration: false, terms: true, accuracy: true, ...changes,
  };
}
function submission(changes = {}) {
  return { requestKey: id, receiptToken, answers: answers(), testData: true, website: '', ...changes };
}
function application(input = {}, changes = {}) {
  return {
    id, requestHash: 'b'.repeat(64), capabilityHash: hash(receiptToken), answers: answers(),
    category: 'standard', feePence: 2000, paymentStatus: 'awaiting_payment', ...input,
    reference: `TEST-MEM-${(input.id ?? id).replaceAll('-', '').toUpperCase()}`,
    createdAt: time, updatedAt: time, currency: 'GBP', mode: 'test', testData: true,
    applicationStatus: 'received', startDate: null, expiryDate: null,
    biginSyncStatus: 'awaiting_authorisation', biginRecordId: null, biginSyncedAt: null,
    lastErrorCode: null, syncAttempts: 0, syncClaimId: null, syncLeaseUntil: null, ...changes,
  };
}
function harness(overrides = {}) {
  const calls = {};
  const defaults = {
    available: async () => true,
    rateLimit: async () => true,
    save: async input => ({ application: application(input), created: true }),
    get: async requestedId => requestedId === id ? application() : null,
    list: async () => [application()],
    session: async () => ({ status: 'organiser' }),
    claim: async (requestedId, claimId) => application({}, {
      id: requestedId, biginSyncStatus: 'syncing', syncClaimId: claimId,
      syncLeaseUntil: '2026-10-22T12:02:00+00:00', syncAttempts: 1,
    }),
    complete: async (_id, _claimId, outcome) => application({}, {
      biginSyncStatus: outcome.status, biginRecordId: outcome.biginRecordId ?? null,
      biginSyncedAt: outcome.status === 'synced' ? time : null,
      lastErrorCode: outcome.errorCode ?? null,
    }),
    sync: async () => ({ status: 'synced', biginRecordId: contactId }),
  };
  const deps = { secret, writesEnabled: false, today: () => '2026-10-22', ...overrides };
  for (const [name, fallback] of Object.entries(defaults)) {
    calls[name] = [];
    deps[name] = async (...args) => {
      calls[name].push(args);
      return (overrides[name] ?? fallback)(...args);
    };
  }
  return { deps, calls };
}
async function json(response, status) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(response.headers.get('pragma'), 'no-cache');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  return response.json();
}
async function bootstrap(context, url = endpoint) {
  const response = await handleMembershipApplications(new Request(url), context.deps);
  const body = await json(response, 200);
  return { csrf: body.csrf, cookie: response.headers.get('set-cookie').split(';')[0], response, body, url };
}
function requestHeaders(initial, changes) {
  const headers = new Headers(initial);
  for (const [name, value] of Object.entries(changes)) {
    if (value === null) headers.delete(name);
    else headers.set(name, value);
  }
  return headers;
}
function post(auth, body = submission(), headers = {}) {
  return new Request(auth.url, {
    method: 'POST',
    headers: requestHeaders({
      origin: new URL(auth.url).origin, 'content-type': 'application/json',
      cookie: auth.cookie, 'x-csrf-token': auth.csrf,
    }, headers),
    ...(body === null ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}
function adminPost(body = {}, headers = {}) {
  return new Request(`${adminEndpoint}/${id}/sync`, {
    method: 'POST', headers: requestHeaders({ origin, 'content-type': 'application/json' }, headers),
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
function receiptRequest(token = receiptToken, url = `${endpoint}/${id}`) {
  return new Request(url, { headers: token === null ? {} : { 'x-membership-receipt': token } });
}
function noProviderCalls(context) {
  assert.deepEqual(context.calls.claim, []);
  assert.deepEqual(context.calls.sync, []);
  assert.deepEqual(context.calls.complete, []);
}
function privateReceipt(receipt) {
  assert.deepEqual(Object.keys(receipt).sort(), publicFields);
  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(serialized, /example\.invalid|07700900000|01\/01\/1990|capabilityHash|requestHash|biginRecordId|syncClaimId|syncLeaseUntil|lastErrorCode/);
}

test('bootstrap reports actual storage availability and issues a protected, uncached test session', async () => {
  for (const url of [endpoint, 'http://localhost:3000/api/membership/applications']) {
    const context = harness();
    const auth = await bootstrap(context, url);
    assert.deepEqual({ ...auth.body, csrf: 'redacted' }, { ok: true, mode: 'test', available: true, csrf: 'redacted' });
    assert.match(auth.csrf, /^[a-f0-9]{64}$/);
    const cookie = auth.response.headers.get('set-cookie');
    assert.match(cookie, /; Path=\/; HttpOnly; SameSite=Strict; Max-Age=28800/);
    assert.equal(cookie.includes('; Secure'), url.startsWith('https:'));
    assert.equal(cookie.startsWith('__Host-icsh-membership='), url.startsWith('https:'));
    assert.equal(context.calls.available.length, 1);
    assert.deepEqual(context.calls.save, []);
    noProviderCalls(context);
  }
  for (const overrides of [{ available: async () => false }, { secret: 'short' }]) {
    const context = harness(overrides);
    const response = await handleMembershipApplications(new Request(endpoint), context.deps);
    assert.equal((await json(response, 503)).error.code, 'MEMBERSHIP_SETUP_REQUIRED');
    assert.equal(response.headers.get('set-cookie'), null);
    noProviderCalls(context);
  }
});

test('cross-site bootstrap and unsupported public methods cannot reach storage', async () => {
  const context = harness();
  const crossSite = await handleMembershipApplications(new Request(endpoint, { headers: { 'sec-fetch-site': 'cross-site' } }), context.deps);
  assert.equal((await json(crossSite, 403)).error.code, 'ORIGIN_NOT_ALLOWED');
  const method = await handleMembershipApplications(new Request(endpoint, { method: 'DELETE' }), context.deps);
  assert.equal((await json(method, 405)).error.code, 'METHOD_NOT_ALLOWED');
  assert.deepEqual(context.calls.available, []);
  assert.deepEqual(context.calls.save, []);
});

test('submission requires the exact origin, JSON, matching signed cookie and CSRF token', async () => {
  const context = harness();
  const auth = await bootstrap(context);
  for (const [headers, status, code] of [
    [{ origin: null }, 403, 'ORIGIN_NOT_ALLOWED'],
    [{ origin: 'https://untrusted.test' }, 403, 'ORIGIN_NOT_ALLOWED'],
    [{ origin: 'https://sub.icsh.test' }, 403, 'ORIGIN_NOT_ALLOWED'],
    [{ 'content-type': 'text/plain' }, 415, 'JSON_REQUIRED'],
    [{ cookie: null }, 403, 'SESSION_CHANGED'],
    [{ cookie: auth.cookie + 'broken' }, 403, 'SESSION_CHANGED'],
    [{ 'x-csrf-token': null }, 403, 'SESSION_CHANGED'],
    [{ 'x-csrf-token': 'c'.repeat(64) }, 403, 'SESSION_CHANGED'],
  ]) {
    const response = await handleMembershipApplications(post(auth, submission(), headers), context.deps);
    assert.equal((await json(response, status)).error.code, code);
  }
  assert.deepEqual(context.calls.rateLimit, []);
  assert.deepEqual(context.calls.save, []);
  noProviderCalls(context);
});

test('event-form sessions and expired or future membership sessions cannot authorise membership submissions', async () => {
  const context = harness();
  const auth = await bootstrap(context);
  const membershipSecret = createHmac('sha256', secret).update('icsh-membership-session-v1').digest('hex');
  const sessions = [
    signedPublicSession(secret),
    signedPublicSession(membershipSecret, undefined, Date.now() - 8 * 3600000 - 1000),
    signedPublicSession(membershipSecret, undefined, Date.now() + 60000),
  ];
  for (const session of sessions) {
    const response = await handleMembershipApplications(post(auth, submission(), {
      cookie: `__Host-icsh-membership=${session.cookie}`, 'x-csrf-token': session.csrf,
    }), context.deps);
    assert.equal((await json(response, 403)).error.code, 'SESSION_CHANGED');
  }
  assert.deepEqual(context.calls.save, []);
});

test('strict submission schemas reject financial, activation and CRM fields supplied by the browser', async () => {
  const context = harness();
  const auth = await bootstrap(context);
  const invalid = [
    submission({ testData: false }), submission({ mode: 'live' }), submission({ website: 'bot' }),
    submission({ requestKey: 'not-a-uuid' }), submission({ receiptToken: 'short' }),
    submission({ feePence: 0 }), submission({ paymentStatus: 'paid' }),
    submission({ startDate: '2026-10-22' }), submission({ expiryDate: '2027-10-22' }),
    submission({ biginRecordId: contactId }), submission({ biginSyncStatus: 'synced' }),
    submission({ answers: { ...answers(), category: 'student' } }),
    submission({ answers: { ...answers(), Membership_Status: 'Active' } }),
    submission({ answers: { ...answers(), terms: 'true' } }),
  ];
  for (const body of invalid) {
    const response = await handleMembershipApplications(post(auth, body), context.deps);
    assert.equal((await json(response, 400)).error.code, 'INVALID_SUBMISSION');
  }
  assert.deepEqual(context.calls.save, []);
  noProviderCalls(context);
});

test('malformed, absent and oversized JSON fail before a durable save', async () => {
  const context = harness();
  const auth = await bootstrap(context);
  for (const body of [null, '{"answers":', '[]', 'null']) {
    const response = await handleMembershipApplications(post(auth, body), context.deps);
    assert.equal((await json(response, 400)).error.code, 'INVALID_SUBMISSION');
  }
  const response = await handleMembershipApplications(post(auth, ' '.repeat(16001)), context.deps);
  assert.equal((await json(response, 413)).error.code, 'SUBMISSION_TOO_LARGE');
  assert.deepEqual(context.calls.save, []);
});

test('only the exact reserved test email domain is accepted and rejection does not echo addresses', async () => {
  const context = harness();
  const auth = await bootstrap(context);
  for (const email of ['private@example.com', 'test@sub.example.invalid', 'test@example.invalid.evil', 'test@@example.invalid', 'test @example.invalid']) {
    const response = await handleMembershipApplications(post(auth, submission({ answers: answers({ email }) })), context.deps);
    const body = await json(response, 400);
    assert.equal(body.error.code, 'VALIDATION_FAILED');
    assert.match(body.error.fields.email, /example\.invalid/);
    assert.equal(JSON.stringify(body).includes(email), false);
  }
  assert.deepEqual(context.calls.save, []);
  const response = await handleMembershipApplications(post(auth, submission({ answers: answers({ email: '  MEMBER+TEST@EXAMPLE.INVALID  ' }) })), context.deps);
  await json(response, 201);
  assert.equal(context.calls.save[0][0].answers.email, 'member+test@example.invalid');
});

test('paid submission saves the server quote, normalized answers and hashed receipt capability without activation', async () => {
  let saved;
  const context = harness({ save: async input => {
    saved = application(input);
    return { application: saved, created: true };
  } });
  const auth = await bootstrap(context);
  const response = await handleMembershipApplications(post(auth, submission({
    requestKey: id.toUpperCase(),
    answers: answers({ firstName: '  Test ', lastName: ' Applicant  ', email: ' MEMBERSHIP-TEST@EXAMPLE.INVALID ', mobile: ' 07700900000 ' }),
  })), context.deps);
  const body = await json(response, 201);
  const input = context.calls.save[0][0];
  assert.equal(input.id, id);
  assert.deepEqual(input.answers, answers());
  assert.equal(input.category, 'standard');
  assert.equal(input.feePence, 2000);
  assert.equal(input.paymentStatus, 'awaiting_payment');
  assert.equal(input.capabilityHash, hash(receiptToken));
  assert.notEqual(input.capabilityHash, receiptToken);
  assert.match(input.requestHash, /^[a-f0-9]{64}$/);
  assert.equal(saved.applicationStatus, 'received');
  assert.equal(saved.startDate, null);
  assert.equal(saved.expiryDate, null);
  assert.equal(saved.biginSyncStatus, 'awaiting_authorisation');
  privateReceipt(body.application);
  assert.equal(body.application.paymentStatus, 'awaiting_payment');
  assert.deepEqual(context.calls.get, []);
  assert.deepEqual(context.calls.list, []);
  assert.deepEqual(context.calls.session, []);
  noProviderCalls(context);
});

test('server eligibility rejects an applicant one day under 17 and accepts their 17th birthday', async () => {
  const context = harness();
  const auth = await bootstrap(context);
  for (const dob of ['23/10/2009', '22/10/2010']) {
    const response = await handleMembershipApplications(post(auth, submission({ answers: answers({ dob, education: 'yes', studentDeclaration: true }) })), context.deps);
    const body = await json(response, 400);
    assert.equal(body.error.code, 'VALIDATION_FAILED');
    assert.match(body.error.fields.dob, /17 and above/);
  }
  assert.deepEqual(context.calls.save, []);
  const response = await handleMembershipApplications(post(auth, submission({ answers: answers({ dob: '22/10/2009' }) })), context.deps);
  const body = await json(response, 201);
  assert.equal(body.application.category, 'standard');
  assert.equal(body.application.feePence, 2000);
  noProviderCalls(context);
});

test('student and pensioner boundaries receive server-calculated fees with no paid or active membership', async () => {
  for (const [dob, education, category, feePence, paymentStatus] of [
    ['22/10/2009', 'yes', 'student', 0, 'not_required'],
    ['23/10/2004', 'yes', 'student', 0, 'not_required'],
    ['22/10/2004', 'yes', 'standard', 2000, 'awaiting_payment'],
    ['23/10/1961', 'no', 'standard', 2000, 'awaiting_payment'],
    ['22/10/1961', 'no', 'pensioner', 1500, 'awaiting_payment'],
  ]) {
    const context = harness();
    const auth = await bootstrap(context);
    const response = await handleMembershipApplications(post(auth, submission({ answers: answers({ dob, education, studentDeclaration: education === 'yes' }) })), context.deps);
    const body = await json(response, 201);
    assert.equal(body.application.category, category);
    assert.equal(body.application.feePence, feePence);
    assert.equal(body.application.paymentStatus, paymentStatus);
    const input = context.calls.save[0][0];
    assert.equal(input.feePence, feePence);
    assert.equal(input.paymentStatus, paymentStatus);
    assert.equal('startDate' in input, false);
    assert.equal('expiryDate' in input, false);
    assert.equal('applicationStatus' in input, false);
    noProviderCalls(context);
  }
});

test('invalid dates and missing accuracy, terms or student declarations prevent a save', async () => {
  const context = harness();
  const auth = await bootstrap(context);
  for (const [changes, field] of [
    [{ dob: '31/02/2000' }, 'dob'], [{ dob: '23/10/2026' }, 'dob'],
    [{ dob: '01/01/1899' }, 'dob'], [{ terms: false }, 'terms'],
    [{ accuracy: false }, 'accuracy'],
    [{ dob: '22/10/2009', education: 'yes', studentDeclaration: false }, 'studentDeclaration'],
  ]) {
    const response = await handleMembershipApplications(post(auth, submission({ answers: answers(changes) })), context.deps);
    const body = await json(response, 400);
    assert.equal(body.error.code, 'VALIDATION_FAILED');
    assert.ok(body.error.fields[field]);
  }
  assert.deepEqual(context.calls.save, []);
});

test('public throttling hashes the address and stops a submission before persistence', async () => {
  const context = harness({ rateLimit: async () => false });
  const auth = await bootstrap(context);
  const response = await handleMembershipApplications(post(auth, submission(), { 'x-vercel-forwarded-for': '192.0.2.21, 198.51.100.1' }), context.deps);
  assert.equal((await json(response, 429)).error.code, 'TOO_MANY_ATTEMPTS');
  const [[key, maximum]] = context.calls.rateLimit;
  assert.match(key, /^membership:[a-f0-9]{64}$/);
  assert.equal(key.includes('192.0.2.21'), false);
  assert.equal(key.includes(secret), false);
  assert.equal(maximum, 20);
  assert.deepEqual(context.calls.save, []);
  noProviderCalls(context);
});

test('the API waits for confirmed durable storage before returning a success receipt', async () => {
  let resolveSave;
  const durableSave = new Promise(resolve => { resolveSave = resolve; });
  const context = harness({ save: () => durableSave });
  const auth = await bootstrap(context);
  let finished = false;
  const responsePromise = handleMembershipApplications(post(auth), context.deps).then(response => { finished = true; return response; });
  await nextTurn();
  assert.equal(context.calls.save.length, 1);
  assert.equal(finished, false);
  noProviderCalls(context);
  resolveSave({ application: application(context.calls.save[0][0]), created: true });
  assert.equal((await json(await responsePromise, 201)).ok, true);
});

test('an ambiguous save is not reported as success and the same form can recover its original application', async () => {
  let persisted;
  const context = harness({ save: async input => {
    if (!persisted) {
      persisted = application(input);
      throw new Error('private database timeout after commit');
    }
    assert.equal(input.requestHash, persisted.requestHash);
    assert.equal(input.capabilityHash, persisted.capabilityHash);
    return { application: persisted, created: false };
  } });
  const auth = await bootstrap(context);
  const failed = await json(await handleMembershipApplications(post(auth), context.deps), 503);
  assert.equal(failed.error.code, 'MEMBERSHIP_UNAVAILABLE');
  assert.match(failed.error.message, /could not confirm.*saved/);
  assert.match(failed.error.message, /same form/);
  assert.doesNotMatch(JSON.stringify(failed), /private database|timeout after commit/);
  assert.equal('application' in failed, false);
  const retried = await json(await handleMembershipApplications(post(auth), context.deps), 200);
  assert.equal(retried.application.id, persisted.id);
  assert.equal(retried.application.reference, persisted.reference);
  assert.equal(context.calls.save.length, 2);
  noProviderCalls(context);
});

test('retries hash normalized answers consistently while changed answers or capabilities cause the actual store conflict', async () => {
  let persisted;
  const context = harness({ save: async input => {
    if (!persisted) {
      persisted = application(input);
      return { application: persisted, created: true };
    }
    if (input.requestHash !== persisted.requestHash || input.capabilityHash !== persisted.capabilityHash) {
      return saveMembershipApplication(input, { rpc: async () => ({ data: null, error: { code: '23505', message: 'private provider detail' } }) });
    }
    return { application: persisted, created: false };
  } });
  const auth = await bootstrap(context);
  const first = await json(await handleMembershipApplications(post(auth), context.deps), 201);
  const normalized = submission({ answers: answers({ email: ' MEMBERSHIP-TEST@EXAMPLE.INVALID ', firstName: ' Test ' }) });
  const again = await json(await handleMembershipApplications(post(auth, normalized), context.deps), 200);
  assert.deepEqual(again.application, first.application);
  for (const body of [submission({ answers: answers({ firstName: 'Changed' }) }), submission({ receiptToken: 'f'.repeat(64) })]) {
    const conflict = await json(await handleMembershipApplications(post(auth, body), context.deps), 409);
    assert.equal(conflict.error.code, 'MEMBERSHIP_REQUEST_CONFLICT');
    assert.doesNotMatch(JSON.stringify(conflict), /private provider detail|example\.invalid/);
  }
  assert.equal(context.calls.save[0][0].requestHash, context.calls.save[1][0].requestHash);
  assert.notEqual(context.calls.save[0][0].requestHash, context.calls.save[2][0].requestHash);
  assert.notEqual(context.calls.save[0][0].capabilityHash, context.calls.save[3][0].capabilityHash);
  noProviderCalls(context);
});

test('a private receipt requires its header capability and exposes no applicant, CRM or claim details', async () => {
  const stored = application({}, {
    biginSyncStatus: 'outcome_unknown', biginRecordId: contactId, syncClaimId: otherId,
    syncLeaseUntil: time, lastErrorCode: 'EXISTING_CONTACT',
  });
  const context = harness({ get: async () => stored });
  const body = await json(await handleMembershipReceipt(receiptRequest(), id, context.deps), 200);
  privateReceipt(body.application);
  assert.equal(body.application.biginSyncStatus, 'outcome_unknown');
  assert.equal(JSON.stringify(body).includes(contactId), false);
  assert.equal(JSON.stringify(body).includes('EXISTING_CONTACT'), false);
  assert.deepEqual(context.calls.rateLimit.map(([, maximum]) => maximum), [100]);
  assert.deepEqual(context.calls.session, []);
  noProviderCalls(context);
});

test('invalid, missing and wrong receipt capabilities reveal the same not-found response', async () => {
  const context = harness();
  const results = [];
  for (const [request, requestedId] of [
    [receiptRequest(null), id], [receiptRequest('short'), id],
    [receiptRequest(null, `${endpoint}/${id}?receiptToken=${receiptToken}`), id],
    [receiptRequest(), 'invalid-id'], [receiptRequest('f'.repeat(64)), id],
    [receiptRequest(), otherId],
  ]) results.push(await json(await handleMembershipReceipt(request, requestedId, context.deps), 404));
  assert.ok(results.every(body => JSON.stringify(body) === JSON.stringify(results[0])));
  assert.equal(results[0].error.code, 'APPLICATION_NOT_FOUND');
  assert.equal(context.calls.get.length, 2);
  noProviderCalls(context);
});

test('receipt throttling and method checks prevent access to the stored application', async () => {
  const context = harness({ rateLimit: async () => false });
  const limited = await json(await handleMembershipReceipt(receiptRequest(), id, context.deps), 429);
  assert.equal(limited.error.code, 'TOO_MANY_ATTEMPTS');
  const unsupported = new Request(`${endpoint}/${id}`, { method: 'POST' });
  assert.equal((await json(await handleMembershipReceipt(unsupported, id, context.deps), 405)).error.code, 'METHOD_NOT_ALLOWED');
  assert.deepEqual(context.calls.get, []);
});

test('organiser authentication precedes listing, lookup and all Bigin work', async () => {
  for (const [status, expectedStatus, code] of [
    ['signed-out', 401, 'SIGN_IN_REQUIRED'], ['forbidden', 403, 'ORGANISER_REQUIRED'],
    ['configuration', 503, 'ACCESS_UNAVAILABLE'], ['unexpected', 503, 'ACCESS_UNAVAILABLE'],
  ]) {
    const context = harness({ writesEnabled: true, session: async () => ({ status }) });
    for (const [request, requestedId] of [[new Request(adminEndpoint), undefined], [adminPost(), id]]) {
      const body = await json(await handleMembershipAdmin(request, requestedId, context.deps), expectedStatus);
      assert.equal(body.error.code, code);
    }
    assert.deepEqual(context.calls.list, []);
    assert.deepEqual(context.calls.get, []);
    assert.deepEqual(context.calls.rateLimit, []);
    noProviderCalls(context);
  }
});

test('organiser listings include review details but exclude receipt secrets and lease metadata', async () => {
  const stored = application({}, { biginRecordId: contactId, lastErrorCode: 'EXISTING_CONTACT', syncClaimId: otherId, syncLeaseUntil: time });
  const context = harness({ list: async () => [stored] });
  const body = await json(await handleMembershipAdmin(new Request(adminEndpoint), undefined, context.deps), 200);
  assert.equal(body.writesEnabled, false);
  assert.deepEqual(Object.keys(body.applications[0]).sort(), [...publicFields, 'answers', 'updatedAt', 'biginRecordId', 'lastErrorCode'].sort());
  assert.deepEqual(body.applications[0].answers, answers());
  assert.equal(body.applications[0].biginRecordId, contactId);
  assert.equal(body.applications[0].lastErrorCode, 'EXISTING_CONTACT');
  assert.doesNotMatch(JSON.stringify(body), /capabilityHash|requestHash|syncClaimId|syncLeaseUntil/);
  noProviderCalls(context);
});

test('the server write flag blocks organiser sync before lookup or claims', async () => {
  const context = harness();
  const body = await json(await handleMembershipAdmin(adminPost(), id, context.deps), 409);
  assert.equal(body.error.code, 'BIGIN_AUTHORISATION_REQUIRED');
  assert.match(body.error.message, /remains saved/);
  assert.deepEqual(context.calls.get, []);
  assert.deepEqual(context.calls.rateLimit, []);
  noProviderCalls(context);
});

test('organiser mutations require exact origin, JSON and an empty action body', async () => {
  const context = harness({ writesEnabled: true });
  for (const [body, headers, status, code] of [
    [{}, { origin: null }, 403, 'ORIGIN_NOT_ALLOWED'],
    [{}, { origin: 'https://untrusted.test' }, 403, 'ORIGIN_NOT_ALLOWED'],
    [{}, { 'content-type': 'text/plain' }, 415, 'JSON_REQUIRED'],
    [{ biginRecordId: contactId }, {}, 400, 'INVALID_ACTION'],
    [{ writesEnabled: true }, {}, 400, 'INVALID_ACTION'],
    [{ status: 'synced' }, {}, 400, 'INVALID_ACTION'],
    [[], {}, 400, 'INVALID_ACTION'], ['null', {}, 400, 'INVALID_ACTION'],
  ]) {
    const result = await json(await handleMembershipAdmin(adminPost(body, headers), id, context.deps), status);
    assert.equal(result.error.code, code);
  }
  assert.deepEqual(context.calls.get, []);
  noProviderCalls(context);
});

test('organiser throttling stops provider work and uses its own rate limit', async () => {
  const context = harness({ writesEnabled: true, rateLimit: async () => false });
  assert.equal((await json(await handleMembershipAdmin(adminPost(), id, context.deps), 429)).error.code, 'TOO_MANY_ATTEMPTS');
  assert.equal(context.calls.rateLimit[0][1], 30);
  assert.deepEqual(context.calls.get, []);
  noProviderCalls(context);
});

test('missing and already-synced applications never produce another provider call', async () => {
  const missing = harness({ writesEnabled: true, get: async () => null });
  assert.equal((await json(await handleMembershipAdmin(adminPost(), id, missing.deps), 404)).error.code, 'APPLICATION_NOT_FOUND');
  noProviderCalls(missing);
  const synced = harness({ writesEnabled: true, get: async () => application({}, { biginSyncStatus: 'synced', biginRecordId: contactId, biginSyncedAt: time }) });
  const body = await json(await handleMembershipAdmin(adminPost(), id, synced.deps), 200);
  assert.equal(body.application.biginSyncStatus, 'synced');
  privateReceipt(body.application);
  noProviderCalls(synced);
});

test('a denied claim for a concurrent, reviewed or unknown creation cannot invoke sync', async () => {
  for (const status of ['syncing', 'review_required', 'outcome_unknown']) {
    const context = harness({ writesEnabled: true, get: async () => application({}, { biginSyncStatus: status }), claim: async () => null });
    const body = await json(await handleMembershipAdmin(adminPost(), id, context.deps), 409);
    assert.equal(body.error.code, 'SYNC_REVIEW_REQUIRED');
    assert.equal(context.calls.claim.length, 1);
    assert.deepEqual(context.calls.sync, []);
    assert.deepEqual(context.calls.complete, []);
  }
});

test('sync uses only the freshly claimed application and preserves its known Contact ID for readback', async () => {
  let claimed;
  const context = harness({
    writesEnabled: true,
    get: async () => application({}, { biginSyncStatus: 'outcome_unknown', biginRecordId: contactId }),
    claim: async (requestedId, claimId) => {
      claimed = application({}, { id: requestedId, biginSyncStatus: 'syncing', biginRecordId: contactId, syncClaimId: claimId, syncLeaseUntil: time });
      return claimed;
    },
  });
  const body = await json(await handleMembershipAdmin(adminPost(), id, context.deps), 200);
  assert.equal(context.calls.sync.length, 1);
  assert.equal(context.calls.sync[0][0], claimed);
  assert.equal(context.calls.sync[0][0].biginRecordId, contactId);
  assert.match(claimed.syncClaimId, /^[a-f0-9-]{36}$/);
  assert.deepEqual(context.calls.complete[0], [id, claimed.syncClaimId, { status: 'synced', biginRecordId: contactId }]);
  assert.equal(body.application.biginSyncStatus, 'synced');
  assert.equal(body.application.paymentStatus, 'awaiting_payment');
  privateReceipt(body.application);
  assert.deepEqual(context.calls.save, []);
});

test('uncertain provider creation is persisted with its returned Contact ID and never exposed publicly', async () => {
  const outcome = { status: 'outcome_unknown', biginRecordId: contactId, errorCode: 'ZOHO_UNAVAILABLE' };
  const context = harness({ writesEnabled: true, sync: async () => outcome });
  const body = await json(await handleMembershipAdmin(adminPost(), id, context.deps), 200);
  assert.deepEqual(context.calls.complete[0][2], outcome);
  assert.equal(body.application.biginSyncStatus, 'outcome_unknown');
  assert.equal(body.application.paymentStatus, 'awaiting_payment');
  privateReceipt(body.application);
  assert.equal(JSON.stringify(body).includes(contactId), false);
});

test('unexpected sync interruption is stored as unknown without leaking error details or clearing a known record', async () => {
  const stored = application({}, { biginSyncStatus: 'outcome_unknown', biginRecordId: contactId });
  const context = harness({
    writesEnabled: true, get: async () => stored,
    claim: async (_id, claimId) => ({ ...stored, biginSyncStatus: 'syncing', syncClaimId: claimId, syncLeaseUntil: time }),
    sync: async () => { throw new Error('private OAuth token and applicant details'); },
    complete: async (_id, _claimId, outcome) => ({ ...stored, biginSyncStatus: outcome.status, lastErrorCode: outcome.errorCode }),
  });
  const body = await json(await handleMembershipAdmin(adminPost(), id, context.deps), 200);
  assert.equal(context.calls.sync[0][0].biginRecordId, contactId);
  assert.deepEqual(context.calls.complete[0][2], { status: 'outcome_unknown', errorCode: 'SYNC_INTERRUPTED' });
  assert.equal(stored.biginRecordId, contactId);
  assert.equal(body.application.biginSyncStatus, 'outcome_unknown');
  assert.doesNotMatch(JSON.stringify(body), /OAuth|applicant details|SYNC_INTERRUPTED/);
  assert.equal(context.calls.sync.length, 1);
});

test('actual store claim conflicts remain 409 and do not suggest resubmitting an application', async () => {
  for (const failedStage of ['claim', 'complete']) {
    const context = harness({ writesEnabled: true, [failedStage]: async () => {
      throw new MembershipStoreError('MEMBERSHIP_SYNC_CONFLICT', 409, 'private provider claim details');
    } });
    const body = await json(await handleMembershipAdmin(adminPost(), id, context.deps), 409);
    assert.equal(body.error.code, 'MEMBERSHIP_SYNC_CONFLICT');
    assert.match(body.error.message, /application remains saved/);
    assert.match(body.error.message, /do not resubmit/);
    assert.doesNotMatch(JSON.stringify(body), /private provider/);
    assert.equal(context.calls.sync.length, failedStage === 'claim' ? 0 : 1);
    assert.deepEqual(context.calls.save, []);
  }
});

test('a lost completion claim returns review-required without replaying provider work', async () => {
  const context = harness({ writesEnabled: true, complete: async () => null });
  const body = await json(await handleMembershipAdmin(adminPost(), id, context.deps), 409);
  assert.equal(body.error.code, 'SYNC_REVIEW_REQUIRED');
  assert.match(body.error.message, /Do not create another contact/);
  assert.equal(context.calls.claim.length, 1);
  assert.equal(context.calls.sync.length, 1);
  assert.equal(context.calls.complete.length, 1);
  assert.deepEqual(context.calls.save, []);
});

test('ambiguous completion preserves the saved-application message and a retry cannot bypass its unresolved lease', async () => {
  let hasClaim = false;
  const context = harness({
    writesEnabled: true,
    claim: async (_id, claimId) => {
      if (hasClaim) return null;
      hasClaim = true;
      return application({}, { biginSyncStatus: 'syncing', syncClaimId: claimId, syncLeaseUntil: time });
    },
    complete: async () => { throw new Error('private database timeout after provider creation'); },
  });
  const body = await json(await handleMembershipAdmin(adminPost(), id, context.deps), 503);
  assert.equal(body.error.code, 'MEMBERSHIP_DELIVERY_UNAVAILABLE');
  assert.match(body.error.message, /application remains saved on the website/);
  assert.match(body.error.message, /Reload its status/);
  assert.doesNotMatch(body.error.message, /retry using the same form|could not confirm that your application was saved|private database/);
  assert.equal('application' in body, false);
  const retry = await json(await handleMembershipAdmin(adminPost(), id, context.deps), 409);
  assert.equal(retry.error.code, 'SYNC_REVIEW_REQUIRED');
  assert.equal(context.calls.sync.length, 1);
  assert.equal(context.calls.complete.length, 1);
  assert.deepEqual(context.calls.save, []);
});
