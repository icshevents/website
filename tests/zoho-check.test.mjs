import test from 'node:test';
import assert from 'node:assert/strict';
import { handleZohoCheck } from '../lib/zoho/check.ts';
import { ZohoError } from '../lib/zoho/client.ts';

const origin = 'https://website-nine-beta-11.vercel.app';
const request = (body = { service: 'bigin' }, headers = {}) => new Request(`${origin}/api/zoho/check`, {
  method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
});
function fixture(status = 'organiser') {
  const calls = [];
  return { calls, dependencies: {
    session: async () => { calls.push('session'); return { status }; },
    configuration: service => { calls.push(`configuration:${service}`); return { configured: true, missing: [], issues: [] }; },
    bigin: async () => { calls.push('bigin'); return { status: 'connected', organisation: { name: 'Test organisation', id: '123' }, fields: [], checkedAt: '2026-10-22T00:00:00.000Z' }; },
    campaigns: async () => { calls.push('campaigns'); return { status: 'connected', lists: [], topics: [], fields: [], truncated: false, checkedAt: '2026-10-22T00:00:00.000Z' }; },
  } };
}

test('signed-out, forbidden and unavailable sessions never access configuration or Zoho', async () => {
  for (const [status, expected] of [['signed-out', 401], ['forbidden', 403], ['database', 503], ['configuration', 503]]) {
    const { calls, dependencies } = fixture(status);
    const response = await handleZohoCheck(request(), dependencies);
    assert.equal(response.status, expected);
    assert.deepEqual(calls, ['session']);
    assert.match(response.headers.get('cache-control'), /private, no-store/);
  }
});

test('cross-origin and missing-origin requests are rejected before reading the session', async () => {
  for (const supplied of ['https://other.example', 'null', '']) {
    const { calls, dependencies } = fixture();
    const response = await handleZohoCheck(request(undefined, { origin: supplied }), dependencies);
    assert.equal(response.status, 403);
    assert.deepEqual(calls, []);
  }
});

test('request validation cannot accept a provider URL, credentials, extra keys or oversized input', async () => {
  for (const body of [{ service: 'https://evil.example' }, { service: 'bigin', token: 'do-not-use' }, null, [], '{', 'x'.repeat(1025)]) {
    const { calls, dependencies } = fixture();
    const response = await handleZohoCheck(request(body), dependencies);
    assert.equal(response.status, 400);
    assert.deepEqual(calls, ['session']);
  }
});

test('missing credentials produce setup guidance without calling a provider', async () => {
  const { calls, dependencies } = fixture();
  dependencies.configuration = () => ({ configured: false, missing: ['ZOHO_BIGIN_REFRESH_TOKEN'], issues: [] });
  const response = await handleZohoCheck(request(), dependencies);
  assert.equal(response.status, 503);
  assert.deepEqual(calls, ['session']);
  const json = await response.json();
  assert.equal(json.ok, false);
  assert.deepEqual(json.configuration.missing, ['ZOHO_BIGIN_REFRESH_TOKEN']);
});

test('each service dispatches only its authorised read check and returns the expected UI shape', async () => {
  for (const service of ['bigin', 'campaigns']) {
    const { calls, dependencies } = fixture();
    const response = await handleZohoCheck(request({ service }), dependencies);
    assert.equal(response.status, 200);
    const json = await response.json();
    assert.equal(json.ok, true);
    assert.equal(json.service, service);
    assert.equal(json.data.status, 'connected');
    assert.deepEqual(calls, ['session', `configuration:${service}`, service]);
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
});

test('provider failures stay distinct from success and unknown errors never leak secrets', async () => {
  const { dependencies } = fixture();
  dependencies.bigin = async () => { throw new ZohoError('ZOHO_SCOPE_MISMATCH'); };
  const known = await handleZohoCheck(request(), dependencies);
  assert.notEqual(known.status, 200);
  assert.equal((await known.json()).error.code, 'ZOHO_SCOPE_MISMATCH');
  dependencies.bigin = async () => { throw new Error('access_token=PRIVATE_TOKEN, email=private@example.com'); };
  const unknown = await handleZohoCheck(request(), dependencies);
  assert.equal(unknown.status, 503);
  assert.doesNotMatch(await unknown.text(), /PRIVATE_TOKEN|private@example/);
});
