import test from 'node:test';
import assert from 'node:assert/strict';
import { createZohoClient, BiginContactCreateError, ZohoError } from '../lib/zoho/client.ts';

const configured = () => ({
  ZOHO_BIGIN_ACCOUNTS_URL: 'https://accounts.zoho.eu', ZOHO_BIGIN_API_DOMAIN: 'https://www.zohoapis.eu',
  ZOHO_BIGIN_CLIENT_ID: 'test-client', ZOHO_BIGIN_CLIENT_SECRET: 'fixture-secret', ZOHO_BIGIN_REFRESH_TOKEN: 'fixture-refresh',
  ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED: 'true',
});
const payload = () => ({
  First_Name: 'Test', Last_Name: 'Applicant', Email: 'applicant@example.invalid', Mobile: '+447700900001',
  Membership_Status: 'Inactive', Payment_Status: 'Awaiting payment', Email_Opt_Out: true,
});
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const token = () => json({ access_token: 'fixture-token', expires_in: 3600, api_domain: 'https://www.zohoapis.eu' });
const success = () => json({ data: [{ code: 'SUCCESS', status: 'success', details: { id: '1234567890123456789' } }] }, 201);
const safeError = error => {
  assert.ok(error instanceof ZohoError);
  assert.doesNotMatch(`${error.stack} ${JSON.stringify(error)}`, /fixture-secret|fixture-token|private@example|secret=|sensitive provider/);
  return true;
};

test('Contact creation requires the explicit server flag before OAuth or writes', async () => {
  for (const flag of [undefined, '', 'false', 'TRUE', '1']) {
    let calls = 0;
    const client = createZohoClient({ ...configured(), ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED: flag }, async () => { calls++; return success(); });
    await assert.rejects(client.createBiginContact(payload()), error => error.code === 'ZOHO_MEMBERSHIP_WRITES_DISABLED' && !(error instanceof BiginContactCreateError));
    assert.equal(calls, 0);
  }
});

test('Contact payload permits only the complete inactive contact allowlist', async () => {
  const bad = [
    { ...payload(), Created_Time: '2026-01-01' }, { ...payload(), Member_ID: 'injected' }, { ...payload(), Description: 'details' },
    { ...payload(), trigger: ['workflow'] }, { ...payload(), Email: 'not-an-email' }, { ...payload(), Email_Opt_Out: false },
    { ...payload(), Membership_Status: 'Active' }, { ...payload(), Payment_Status: 'Paid' },
    { ...payload(), Payment_Status: new String('Awaiting payment') }, { ...payload(), First_Name: '<script>' },
    { ...payload(), Last_Name: ' ' }, { ...payload(), First_Name: 123 }, { ...payload(), Mobile: 'abcdefg' },
    { ...payload(), Mobile: '1'.repeat(31) }, { ...payload(), Email: 'applicant@example.invalid\n' }, null, [],
  ];
  const missing = payload(); delete missing.Payment_Status; bad.push(missing);
  let calls = 0;
  const client = createZohoClient(configured(), async () => { calls++; return token(); });
  for (const value of bad) await assert.rejects(client.createBiginContact(value), error => error.code === 'ZOHO_REQUEST_NOT_ALLOWED');
  assert.equal(calls, 0);
});

test('Contact POST copies the validated payload and always suppresses Bigin workflows', async () => {
  const calls = [];
  const submitted = payload();
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const client = createZohoClient(configured(), async (url, init) => {
    calls.push({ url: String(url), init });
    if (url.pathname === '/oauth/v2/token') { await barrier; return token(); }
    return success();
  });
  const operation = client.createBiginContact(submitted);
  submitted.Membership_Status = 'Active'; submitted.Member_ID = 'injected';
  release();
  assert.deepEqual(await operation, { contactId: '1234567890123456789' });
  assert.equal(calls.length, 2);
  const post = calls[1];
  assert.equal(post.url, 'https://www.zohoapis.eu/bigin/v2/Contacts');
  assert.equal(post.init.method, 'POST');
  assert.deepEqual(JSON.parse(post.init.body), { data: [payload()], trigger: [] });
  assert.equal(post.init.redirect, 'error'); assert.equal(post.init.cache, 'no-store');
  assert.ok(post.init.signal instanceof AbortSignal);
});

test('Contact search uses a fixed query and 204 safely means no matching record', async () => {
  const calls = [];
  const client = createZohoClient(configured(), async (url, init) => {
    calls.push({ url: String(url), init });
    return url.pathname === '/oauth/v2/token' ? token() : new Response(null, { status: 204 });
  });
  assert.deepEqual(await client.searchBiginContactsByEmail(' Applicant@Example.Invalid '), { matches: [], hasMore: false });
  const url = new URL(calls[1].url);
  assert.equal(url.pathname, '/bigin/v2/Contacts/search');
  assert.deepEqual(Object.fromEntries(url.searchParams), { email: 'applicant@example.invalid', page: '1', per_page: '2' });
  assert.equal(calls[1].init.method, 'GET');
  await assert.rejects(client.get('bigin', '/bigin/v2/Contacts/search', { email: 'applicant@example.invalid' }), error => error.code === 'ZOHO_REQUEST_NOT_ALLOWED');
});

test('search checks returned emails locally, strips unrelated data and retains incompleteness', async () => {
  const client = createZohoClient(configured(), async url => url.pathname === '/oauth/v2/token' ? token() : json({
    data: [
      { id: '123', Email: 'Applicant@Example.Invalid', Membership_Status: 'Active', Owner: { email: 'private@example.test' } },
      { id: '456', Email: 'other@example.invalid', Membership_Status: 'Expired' },
    ], info: { more_records: true },
  }));
  assert.deepEqual(await client.searchBiginContactsByEmail('applicant@example.invalid'), {
    matches: [{ id: '123', email: 'applicant@example.invalid' }], hasMore: true,
  });
});

test('invalid search results fail closed instead of proving there is no existing Contact', async () => {
  for (const body of [{}, { data: [] }, { data: null, info: { more_records: false } },
    { data: [{ id: '123', Email: null }], info: { more_records: false } },
    { data: [{ id: '../Contacts', Email: 'applicant@example.invalid' }], info: { more_records: false } },
    { data: [], info: { more_records: 'false' } },
    { data: [1, 2, 3], info: { more_records: false } }]) {
    const client = createZohoClient(configured(), async url => url.pathname === '/oauth/v2/token' ? token() : json(body));
    await assert.rejects(client.searchBiginContactsByEmail('applicant@example.invalid'), error => error.code === 'ZOHO_INVALID_RESPONSE');
  }
});

test('individual Contact reads allow only numeric IDs and a fixed field selection', async () => {
  const calls = [];
  const client = createZohoClient(configured(), async (url, init) => {
    calls.push({ url: String(url), init });
    return url.pathname === '/oauth/v2/token' ? token() : json({ data: [{ id: '123', ...payload(), Created_Time: 'private', Owner: { email: 'private@example.test' } }] });
  });
  for (const id of ['../Contacts', '123?fields=Email', 'https://attacker.test', '0', 123, '1'.repeat(31)]) {
    await assert.rejects(client.getBiginContact(id), error => error.code === 'ZOHO_REQUEST_NOT_ALLOWED');
  }
  assert.equal(calls.length, 0);
  const read = await client.getBiginContact('123');
  assert.deepEqual(read, { id: '123', email: 'applicant@example.invalid', firstName: 'Test', lastName: 'Applicant', mobile: '+447700900001', membershipStatus: 'Inactive', paymentStatus: 'Awaiting payment', emailOptOut: true, membershipDate: null, membershipExpiry: null });
  const url = new URL(calls[1].url);
  assert.equal(url.pathname, '/bigin/v2/Contacts/123');
  assert.deepEqual([...url.searchParams.keys()], ['fields']);
  assert.equal(url.searchParams.get('fields'), 'First_Name,Last_Name,Email,Mobile,Membership_Status,Payment_Status,Email_Opt_Out,Membership_Date,Expiry_Date');
});

test('Contact creation validates each record result and treats ambiguous outcomes as non-retryable', async () => {
  const results = [
    () => json({ data: [{ code: 'MANDATORY_NOT_FOUND', status: 'error', message: 'sensitive provider private@example.test', details: {} }] }),
    () => json({ data: [{ code: 'SUCCESS', status: 'success', details: {} }] }),
    () => json({ data: [{ code: 'SUCCESS', status: 'success', details: { id: 'not-numeric' } }] }),
    () => json({ data: [{ code: 'SUCCESS', status: 'success', details: { id: '123' } }, { code: 'SUCCESS' }] }),
    () => json({ data: [] }), () => json({ status: 'success' }),
    () => json({ code: 'OAUTH_SCOPE_MISMATCH', message: 'sensitive provider' }, 403),
    () => json({ message: 'sensitive provider' }, 503), () => new Response('<html>sensitive provider</html>'),
    () => new Response(null, { status: 302, headers: { Location: 'https://attacker.test' } }),
    () => { throw new Error('sensitive provider fixture-secret'); },
  ];
  for (const result of results) {
    let calls = 0;
    const client = createZohoClient(configured(), async url => { calls++; return url.pathname === '/oauth/v2/token' ? token() : result(); });
    await assert.rejects(client.createBiginContact(payload()), error => {
      assert.ok(error instanceof BiginContactCreateError); assert.equal(error.outcome, 'unknown'); return safeError(error);
    });
    assert.equal(calls, 2, 'one refresh and one Contact request, without POST retry');
  }
});

test('authentication failures before Contact POST stay distinct from unknown write outcomes', async () => {
  let calls = 0;
  const client = createZohoClient(configured(), async () => { calls++; throw new Error('sensitive provider fixture-secret'); });
  await assert.rejects(client.createBiginContact(payload()), error => {
    assert.ok(!(error instanceof BiginContactCreateError)); return safeError(error);
  });
  assert.equal(calls, 1);
});
