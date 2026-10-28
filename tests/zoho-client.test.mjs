import test from 'node:test';
import assert from 'node:assert/strict';
import { createZohoClient, getZohoConfiguration, ZohoError } from '../lib/zoho/client.ts';

const configured = () => ({
  ZOHO_BIGIN_ACCOUNTS_URL: 'https://accounts.zoho.eu',
  ZOHO_BIGIN_API_DOMAIN: 'https://www.zohoapis.eu',
  ZOHO_BIGIN_CLIENT_ID: 'test-client-id',
  ZOHO_BIGIN_CLIENT_SECRET: 'fixture-client-secret',
  ZOHO_BIGIN_REFRESH_TOKEN: 'fixture-refresh-token',
  ZOHO_CAMPAIGNS_ACCOUNTS_URL: 'https://accounts.zoho.eu',
  ZOHO_CAMPAIGNS_API_DOMAIN: 'https://campaigns.zoho.eu',
  ZOHO_CAMPAIGNS_CLIENT_ID: 'campaigns-client-id',
  ZOHO_CAMPAIGNS_CLIENT_SECRET: 'campaigns-client-secret',
  ZOHO_CAMPAIGNS_REFRESH_TOKEN: 'campaigns-refresh-token',
});
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const token = (overrides = {}) => ({ access_token: 'fixture-access-token', expires_in: 3600, api_domain: 'https://www.zohoapis.eu', ...overrides });
const rejectsWith = code => error => error instanceof ZohoError && error.code === code;

test('missing configuration reports names only and never makes a request', async () => {
  let calls = 0;
  const client = createZohoClient({}, async () => { calls++; throw new Error('should not fetch'); });
  assert.deepEqual(client.getConfiguration('bigin'), {
    configured: false,
    missing: ['ZOHO_BIGIN_ACCOUNTS_URL', 'ZOHO_BIGIN_CLIENT_ID', 'ZOHO_BIGIN_CLIENT_SECRET', 'ZOHO_BIGIN_REFRESH_TOKEN', 'ZOHO_BIGIN_API_DOMAIN'],
    issues: [],
  });
  await assert.rejects(client.get('bigin', '/bigin/v2/org'), rejectsWith('ZOHO_NOT_CONFIGURED'));
  assert.equal(calls, 0);
  const status = JSON.stringify(getZohoConfiguration('bigin', configured()));
  assert.equal(JSON.parse(status).configured, true);
  assert.doesNotMatch(status, /fixture|zoho\.eu|test-client/);
});

test('untrusted, non-HTTPS, credentialed and mismatched origins are rejected before OAuth', async () => {
  for (const [key, value] of [
    ['ZOHO_BIGIN_ACCOUNTS_URL', 'https://accounts.zoho.eu.attacker.test'],
    ['ZOHO_BIGIN_ACCOUNTS_URL', 'http://accounts.zoho.eu'],
    ['ZOHO_BIGIN_ACCOUNTS_URL', 'https://user:password@accounts.zoho.eu'],
    ['ZOHO_BIGIN_ACCOUNTS_URL', 'https://accounts.zoho.eu/oauth/v2/token'],
    ['ZOHO_BIGIN_ACCOUNTS_URL', 'https://accounts.zoho.eu?redirect=elsewhere'],
    ['ZOHO_BIGIN_API_DOMAIN', 'https://www.zohoapis.com'],
    ['ZOHO_BIGIN_API_DOMAIN', 'https://www.zohoapis.eu/Contacts'],
    ['ZOHO_CAMPAIGNS_API_DOMAIN', 'https://campaigns.zoho.com'],
    ['ZOHO_BIGIN_CLIENT_SECRET', 'fixture-client-secret\n'],
  ]) {
    const env = { ...configured(), [key]: value };
    let calls = 0;
    const client = createZohoClient(env, async () => { calls++; return json({}); });
    const service = key.startsWith('ZOHO_CAMPAIGNS') ? 'campaigns' : 'bigin';
    const path = service === 'campaigns' ? '/api/v1.1/getmailinglists' : '/bigin/v2/org';
    assert.equal(client.getConfiguration(service).configured, false, key + value);
    await assert.rejects(client.get(service, path), rejectsWith('ZOHO_CONFIGURATION_INVALID'));
    assert.equal(calls, 0);
  }
});

test('the client permits only fixed metadata paths and query keys', async () => {
  let calls = 0;
  const client = createZohoClient(configured(), async () => { calls++; return json({}); });
  for (const [service, path, params] of [
    ['bigin', 'https://attacker.test/bigin/v2/org'],
    ['bigin', '//attacker.test/bigin/v2/org'],
    ['bigin', '/bigin/v2/org?email=person@example.test'],
    ['bigin', '/bigin/v2/Contacts/search', { email: 'person@example.test' }],
    ['bigin', '/bigin/v2/Contacts/upsert'],
    ['bigin', '/bigin/v2/../Contacts'],
    ['bigin', '/bigin/v2/org', { access_token: 'injected' }],
    ['bigin', '/bigin/v2/settings/fields', { module: 'Contacts/search' }],
    ['bigin', '/bigin/v2/settings/fields', { module: 'Pipelines' }],
    ['campaigns', '/api/v1.1/json/listsubscribe'],
    ['campaigns', '/api/v1.1/workflow/123/action/trigger'],
    ['campaigns', '/api/v1.1/getmailinglists', { range: Infinity }],
  ]) await assert.rejects(client.get(service, path, params), rejectsWith('ZOHO_REQUEST_NOT_ALLOWED'));
  assert.equal(calls, 0);
});

test('simultaneous and subsequent metadata requests share one token refresh', async () => {
  const calls = [];
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const client = createZohoClient(configured(), async (url, init) => {
    calls.push({ url: String(url), init });
    if (url.pathname === '/oauth/v2/token') { await barrier; return json(token()); }
    return json({ org: [] });
  });
  const first = client.get('bigin', '/bigin/v2/org');
  const second = client.get('bigin', '/bigin/v2/settings/fields', { module: 'Contacts' });
  assert.equal(calls.length, 1);
  release();
  await Promise.all([first, second]);
  await client.get('bigin', '/bigin/v2/org');
  assert.equal(calls.filter(call => call.init.method === 'POST').length, 1);
  assert.equal(calls.filter(call => call.init.method === 'GET').length, 3);
  const auth = calls[0];
  assert.equal(auth.url, 'https://accounts.zoho.eu/oauth/v2/token');
  assert.doesNotMatch(auth.url, /fixture|secret|token=/);
  assert.equal(new URLSearchParams(auth.init.body).get('client_secret'), 'fixture-client-secret');
  assert.equal(new URLSearchParams(auth.init.body).get('grant_type'), 'refresh_token');
  for (const { init } of calls) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    assert.ok(init.signal instanceof AbortSignal);
  }
  assert.equal(calls[1].init.headers.Authorization, 'Zoho-oauthtoken fixture-access-token');
});

test('each service and each changed credential set gets its own access token', async () => {
  const env = configured();
  const authRequests = [];
  const client = createZohoClient(env, async (url, init) => {
    if (url.pathname === '/oauth/v2/token') {
      authRequests.push(new URLSearchParams(init.body).get('refresh_token'));
      return json(token());
    }
    return json({ status: 'success', code: '0', org: [] });
  });
  await client.get('bigin', '/bigin/v2/org');
  await client.get('campaigns', '/api/v1.1/getmailinglists', { resfmt: 'JSON' });
  await client.get('bigin', '/bigin/v2/org');
  env.ZOHO_BIGIN_REFRESH_TOKEN = 'rotated-fixture-token';
  await client.get('bigin', '/bigin/v2/org');
  assert.deepEqual(authRequests, ['fixture-refresh-token', 'campaigns-refresh-token', 'rotated-fixture-token']);
});

test('a returned OAuth API domain must match the configured data center', async () => {
  for (const api_domain of ['https://www.zohoapis.com', 'https://attacker.test', 'https://www.zohoapis.eu/private', 'https://user:secret@www.zohoapis.eu']) {
    let calls = 0;
    const client = createZohoClient(configured(), async () => { calls++; return json(token({ api_domain })); });
    await assert.rejects(client.get('bigin', '/bigin/v2/org'), rejectsWith('ZOHO_CONFIGURATION_INVALID'));
    assert.equal(calls, 1);
  }
});

test('Campaigns accepts its corresponding generic OAuth API domain', async () => {
  for (const api_domain of ['https://www.zohoapis.eu', 'https://api.zoho.eu']) {
    const calls = [];
    const client = createZohoClient(configured(), async (url, init) => {
      calls.push(String(url));
      return init.method === 'POST' ? json(token({ api_domain })) : json({ status: 'success', code: '0', list_of_details: [] });
    });
    await client.get('campaigns', '/api/v1.1/getmailinglists', { resfmt: 'JSON', fromindex: 1, range: 10 });
    assert.equal(new URL(calls[1]).origin, 'https://campaigns.zoho.eu');
  }
});

test('HTTP-200 OAuth failures are redacted and cooled down without automatic retries', async () => {
  let calls = 0;
  const client = createZohoClient(configured(), async () => {
    calls++;
    return json({ error: 'invalid_client', error_description: 'fixture-client-secret private@example.test' });
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(client.get('bigin', '/bigin/v2/org'), error => {
      assert.equal(error.code, 'ZOHO_AUTHENTICATION_FAILED');
      assert.equal(error.status, 502);
      assert.doesNotMatch(`${error.stack} ${JSON.stringify(error)}`, /fixture-client-secret|private@example/);
      return true;
    });
  }
  assert.equal(calls, 1);
});

test('HTTP-200 API error bodies are never treated as connected', async () => {
  for (const response of [
    { status: 'error', code: 'OAUTH_SCOPE_MISMATCH', message: 'private@example.test' },
    { response: { status: 'error', code: '2706', message: 'fixture-access-token' } },
    { code: 'NON_SUCCESS_CODE', details: { email: 'private@example.test' } },
  ]) {
    const client = createZohoClient(configured(), async (_url, init) => init.method === 'POST' ? json(token()) : json(response));
    await assert.rejects(client.get('bigin', '/bigin/v2/org'), error => {
      assert.ok(error instanceof ZohoError);
      assert.doesNotMatch(`${error.stack} ${JSON.stringify(error)}`, /private@example|fixture-access-token|2706|NON_SUCCESS/);
      return true;
    });
  }
});

test('expired/revoked API credentials invalidate cache and do not loop on refresh', async () => {
  let calls = 0;
  const client = createZohoClient(configured(), async (_url, init) => {
    calls++;
    return init.method === 'POST' ? json(token()) : json({ code: 'INVALID_OAUTHTOKEN', message: 'sensitive detail' }, 401);
  });
  await assert.rejects(client.get('bigin', '/bigin/v2/org'), rejectsWith('ZOHO_AUTHENTICATION_FAILED'));
  await assert.rejects(client.get('bigin', '/bigin/v2/org'), rejectsWith('ZOHO_AUTHENTICATION_FAILED'));
  assert.equal(calls, 2);
});

test('redirects, network failures and malformed responses expose only fixed errors', async () => {
  for (const responder of [
    async () => new Response(null, { status: 302, headers: { Location: 'https://attacker.test' } }),
    async () => { throw new Error('https://accounts.zoho.eu?client_secret=fixture-client-secret'); },
    async () => new Response('<html>fixture-client-secret</html>'),
    async () => json(token({ access_token: 'invalid\nheader' })),
  ]) {
    const client = createZohoClient(configured(), responder);
    await assert.rejects(client.get('bigin', '/bigin/v2/org'), error => {
      assert.ok(error instanceof ZohoError);
      assert.doesNotMatch(`${error.stack} ${JSON.stringify(error)}`, /fixture-client-secret|attacker|invalid\\nheader/);
      return true;
    });
  }
});

test('only the documented Campaigns empty-list response bypasses provider-error rejection', async () => {
  for (const empty of [{ status: 'error', code: '2401' }, { response: { status: 'error', code: '2401' } }]) {
    const client = createZohoClient(configured(), async (_url, init) => init.method === 'POST' ? json(token()) : json(empty));
    assert.deepEqual(await client.get('campaigns', '/api/v1.1/getmailinglists'), empty);
    await assert.rejects(client.get('campaigns', '/api/v1.1/topics'), rejectsWith('ZOHO_PROVIDER_REJECTED'));
  }
});
