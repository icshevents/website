import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMemberSearch, normaliseMemberMobile, projectMembershipSearch } from '../lib/member-search.ts';
import { handleMemberSearch } from '../lib/member-search-api.ts';
import { createZohoClient } from '../lib/zoho/client.ts';
import { checkMembershipEligibility } from '../lib/membership-eligibility.ts';

const record = overrides => ({ id: '10001', fullName: 'Alex Smith', email: 'alex@example.invalid', mobile: '+447400123456', membershipStatus: 'Active', paymentStatus: 'Completed', membershipDate: '2025-12-27', membershipExpiry: '2026-12-27', ...overrides });
const name = () => parseMemberSearch({ method: 'name', firstName: 'Alex', lastName: 'Smith' });
const request = (body = name(), headers = {}) => new Request('https://icsh.test/api/membership/search', { method: 'POST', headers: { origin: 'https://icsh.test', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const deps = overrides => ({ secret: 'test-secret-'.repeat(4), rateLimit: async () => true, lookup: async () => ({ status: 'found', membershipDate: '2025-12-27', membershipExpiry: '2026-12-27', daysUntilExpiry: 66 }), ...overrides });

test('one independent search option; both name fields required, even if identical', () => {
  assert.deepEqual(parseMemberSearch({ method: 'name', firstName: 'Ali', lastName: 'Ali' }), { method: 'name', firstName: 'Ali', lastName: 'Ali' });
  assert.equal(parseMemberSearch({ method: 'email', email: ' ALEX@example.invalid ' }).email, 'alex@example.invalid');
  for (const input of [{ method: 'name', firstName: 'Alex', lastName: '' }, { ...name(), email: 'alex@example.invalid' }, { method: 'email', email: 'invalid' }, { method: 'mobile', mobile: '07911(OR)900123' }, { method: 'name', firstName: 'Alex):(id:not_equal:1', lastName: 'Smith' }, null]) assert.throws(() => parseMemberSearch(input));
});

test('UK and international mobile formats normalise consistently', () => {
  for (const number of ['07400 123456', '+44 7400 123456', '0044 7400 123456', '447400123456', '7400123456', '(07400) 123-456']) assert.equal(normaliseMemberMobile(number), '+447400123456');
  assert.equal(normaliseMemberMobile('+1 202 555 0123'), '+12025550123');
  assert.equal(normaliseMemberMobile('12'), null);
});

test('duplicate names never expose dates or select an active record automatically', () => {
  const result = projectMembershipSearch(name(), [record(), record({ id: '10002', membershipStatus: 'Inactive', membershipExpiry: '2027-04-24' })], false, '2026-10-22');
  assert.deepEqual(result, { status: 'ambiguous' });
  assert.deepEqual(projectMembershipSearch(name(), [record()], true), { status: 'ambiguous' });
});

test('shared emails and mobiles remain ambiguous even with identical dates', () => {
  for (const input of [parseMemberSearch({ method: 'email', email: 'alex@example.invalid' }), parseMemberSearch({ method: 'mobile', mobile: '07400 123456' })]) assert.deepEqual(projectMembershipSearch(input, [record(), record({ id: '10002', fullName: 'Sam Smith' })], false), { status: 'ambiguous' });
});

test('partial provider matches are rejected and a different email resolves a duplicate name', () => {
  assert.deepEqual(projectMembershipSearch(name(), [record({ fullName: 'Alexandra Smith' })], false), { status: 'not_found' });
  const input = parseMemberSearch({ method: 'email', email: 'alex@example.invalid' });
  assert.equal(projectMembershipSearch(input, [record(), record({ id: '10002', email: 'other@example.invalid' })], false, '2026-10-22').status, 'found');
  assert.equal(projectMembershipSearch(parseMemberSearch({ method: 'name', firstName: ' ALEX ', lastName: 'smith' }), [record({ fullName: 'Alex   Smith' })], false).status, 'found');
});

test('uses only saved dates, calculates calendar days, and handles expiry and leap days', () => {
  assert.deepEqual(projectMembershipSearch(name(), [record()], false, '2026-10-22'), { status: 'found', membershipDate: '2025-12-27', membershipExpiry: '2026-12-27', daysUntilExpiry: 66 });
  assert.deepEqual(projectMembershipSearch(name(), [record()], false, '2026-12-27'), { status: 'expired', membershipExpiry: '2026-12-27' });
  assert.deepEqual(projectMembershipSearch(name(), [record({ membershipStatus: 'Inactive' })], false, '2026-12-28'), { status: 'expired', membershipExpiry: '2026-12-27' });
  assert.equal(projectMembershipSearch(name(), [record({ membershipDate: '2023-03-01', membershipExpiry: '2024-03-01' })], false, '2024-02-28').daysUntilExpiry, 2);
  assert.equal(projectMembershipSearch(name(), [record({ membershipDate: '2026-03-28', membershipExpiry: '2026-03-30' })], false, '2026-03-28').daysUntilExpiry, 2);
  for (const overrides of [{ membershipExpiry: '2026-02-30' }, { membershipExpiry: '2025-01-01' }, { membershipStatus: 'Inactive' }, { paymentStatus: 'Processing' }]) assert.deepEqual(projectMembershipSearch(name(), [record(overrides)], false), { status: 'dates_unavailable' });
});

test('matched blank dates require renewal without fabricating a date or becoming no-match', () => {
  for (const overrides of [{ membershipDate: null, membershipExpiry: null }, { membershipDate: '' }, { membershipExpiry: '   ' }, { membershipDate: null, membershipStatus: 'Active', Created_Time: '2026-01-01T10:00:00Z', Member_Year: '2026' }]) {
    assert.deepEqual(projectMembershipSearch(name(), [record(overrides)], false, '2026-10-22'), { status: 'expired_undated' });
  }
  assert.deepEqual(projectMembershipSearch(name(), [], false, '2026-10-22'), { status: 'not_found' });
  assert.deepEqual(projectMembershipSearch(name(), [record({ membershipDate: null }), record({ id: '10002', membershipDate: null })], false, '2026-10-22'), { status: 'ambiguous' });
});

test('HTTP response returns only three date/count values, without submitted identity or CRM extras', async () => {
  const response = await handleMemberSearch(request(), deps({ lookup: async () => ({ status: 'found', membershipDate: '2025-12-27', membershipExpiry: '2026-12-27', daysUntilExpiry: 66, email: 'private@example.invalid', fullName: 'Alex Smith', id: '123' }) }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.deepEqual(await response.json(), { status: 'found', membershipDate: '2025-12-27', membershipExpiry: '2026-12-27', daysUntilExpiry: 66 });
});

test('invalid, cross-origin, oversized and limited searches never reach Bigin', async () => {
  let lookups = 0;
  const dependencies = deps({ lookup: async () => { lookups++; return { status: 'not_found' }; } });
  assert.equal((await handleMemberSearch(request(name(), { origin: 'https://other.test' }), dependencies)).status, 403);
  assert.equal((await handleMemberSearch(request(name(), { 'content-type': 'text/plain' }), dependencies)).status, 415);
  assert.equal((await handleMemberSearch(request({ ...name(), firstName: 'x'.repeat(2100) }), dependencies)).status, 413);
  assert.equal((await handleMemberSearch(request({ ...name(), email: 'alex@example.invalid' }), dependencies)).status, 400);
  const limited = await handleMemberSearch(request(), deps({ ...dependencies, rateLimit: async () => false }));
  assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '600');
  assert.equal(lookups, 0);
});

test('provider errors do not become no-match results or expose sensitive messages', async () => {
  const response = await handleMemberSearch(request(), deps({ lookup: async () => { throw new Error('private token and member details'); } }));
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /token|member details/);
});

test('expired public response contains expiry only, never start date or elapsed days', async () => {
  const response = await handleMemberSearch(request(), deps({ lookup: async () => ({ status: 'expired', membershipExpiry: '2025-12-27', membershipDate: '2024-12-27', daysUntilExpiry: -299 }) }));
  assert.deepEqual(await response.json(), { status: 'expired', membershipExpiry: '2025-12-27' });
});

test('matched undated public response exposes no guessed date, identity or CRM fields', async () => {
  const response = await handleMemberSearch(request(), deps({ lookup: async () => ({ status: 'expired_undated', membershipDate: 'private', email: 'private@example.invalid', id: '123' }) }));
  assert.deepEqual(await response.json(), { status: 'expired_undated' });
});

const env = { ZOHO_BIGIN_ACCOUNTS_URL: 'https://accounts.zoho.eu', ZOHO_BIGIN_API_DOMAIN: 'https://www.zohoapis.eu', ZOHO_BIGIN_CLIENT_ID: 'fixture-client', ZOHO_BIGIN_CLIENT_SECRET: 'fixture-secret', ZOHO_BIGIN_REFRESH_TOKEN: 'fixture-refresh' };
const json = data => Response.json(data);
test('Bigin lookup is a fixed GET search, validates exact identity and projects dates only', async () => {
  const calls = [];
  const client = createZohoClient(env, async (url, init) => {
    calls.push({ url: new URL(url), init });
    if (calls.length === 1) return json({ access_token: 'fixture-token', expires_in: 3600, api_domain: env.ZOHO_BIGIN_API_DOMAIN });
    return json({ data: [{ id: '10001', Full_Name: 'Alex Smith', Email: 'alex@example.invalid', Mobile: '07400 123456', Membership_Status: 'Active', Payment_Status: 'Completed', Membership_Date: '2025-12-27', Expiry_Date: '2026-12-27', Member_ID: 'private', Created_Time: 'private' }], info: { more_records: false } });
  });
  for (const input of [name(), { method: 'email', email: 'alex@example.invalid' }, { method: 'mobile', mobile: '+447400123456' }]) {
    assert.deepEqual(await client.lookupBiginMembership(input, '2026-10-22'), { status: 'found', membershipDate: '2025-12-27', membershipExpiry: '2026-12-27', daysUntilExpiry: 66 });
  }
  assert.equal(calls.length, 8);
  for (const call of calls.slice(1)) { assert.equal(call.init.method, 'GET'); assert.equal(call.url.pathname, '/bigin/v2/Contacts/search'); }
  assert.equal(calls[1].url.searchParams.get('criteria'), '(Full_Name:equals:Alex Smith)');
  assert.equal(calls[3].url.searchParams.get('phone'), '+447400123456');
});

test('renewal matches a stored national test number when Bigin misses its country-code form', async () => {
  const identity = { kind: 'renewal', firstName: 'Test', lastName: 'Test', email: 'renewal@example.invalid', mobile: '982123456' };
  let requests = 0;
  const saved = { id: '10001', Full_Name: 'Test Test', Email: identity.email, Mobile: identity.mobile, Membership_Status: 'Active', Payment_Status: 'Not required', Membership_Date: '2025-10-28', Expiry_Date: '2026-10-28' };
  const client = createZohoClient(env, async (url, init) => {
    const u = new URL(url);
    if (u.hostname === 'accounts.zoho.eu') { requests++; return json({ access_token: 'fixture-token', expires_in: 3600 }); }
    assert.equal(init.method, 'GET');
    const found = u.searchParams.get('email') === identity.email || u.searchParams.get('phone') === identity.mobile;
    return found ? json({ data: [saved], info: { more_records: false } }) : new Response(null, { status: 204 });
  });
  const lookup = value => client.searchBiginMembershipRecords(value);
  assert.deepEqual(await checkMembershipEligibility(identity, lookup, '2026-10-28'), { status: 'allowed' });
  assert.deepEqual(await checkMembershipEligibility({ ...identity, kind: 'new' }, lookup, '2026-10-28'), { status: 'renewal_required' });
  saved.Membership_Date = '2026-10-28'; saved.Expiry_Date = '2027-10-28';
  assert.equal((await checkMembershipEligibility(identity, lookup, '2026-10-28')).status, 'active');
  assert.equal(requests, 1, 'parallel searches share a single OAuth refresh');
});

test('phone variants are combined before deciding whether the existing member is unique', async () => {
  const identity = { kind: 'renewal', firstName: 'Alex', lastName: 'Smith', email: 'alex@example.invalid', mobile: '07400123456' };
  const saved = { id: '10001', Full_Name: 'Alex Smith', Email: identity.email, Mobile: '+447400123456', Membership_Status: 'Active', Payment_Status: 'Completed', Membership_Date: '2025-10-28', Expiry_Date: '2026-10-28' };
  for (const mode of ['shared', 'truncated', 'changed', 'unavailable']) {
    const client = createZohoClient(env, async url => {
      const u = new URL(url);
      if (u.hostname === 'accounts.zoho.eu') return json({ access_token: 'fixture-token', expires_in: 3600 });
      if (u.searchParams.get('phone') === '07400123456') {
        if (mode === 'unavailable') return json({ code: 'INTERNAL_ERROR' }, { status: 500 });
        return json({ data: [{ ...saved, ...(mode === 'shared' ? { id: '10002', Email: 'other@example.invalid', Mobile: '07400123456' } : mode === 'changed' ? { Expiry_Date: '2027-10-28' } : {}) }], info: { more_records: mode === 'truncated' } });
      }
      return json({ data: [saved], info: { more_records: false } });
    });
    const check = () => checkMembershipEligibility(identity, value => client.searchBiginMembershipRecords(value), '2026-10-28');
    if (['changed', 'unavailable'].includes(mode)) await assert.rejects(check);
    else assert.deepEqual(await check(), { status: 'review_required' });
  }
});

test('Bigin 204 is no match; truncated or malformed provider results fail closed', async () => {
  for (const mode of ['empty', 'more', 'malformed']) {
    const client = createZohoClient(env, async url => {
      if (new URL(url).hostname === 'accounts.zoho.eu') return json({ access_token: 'fixture-token', expires_in: 3600 });
      if (mode === 'empty') return new Response(null, { status: 204 });
      if (mode === 'more') return json({ data: [], info: { more_records: true } });
      return json({ data: [{ id: 123 }], info: { more_records: false } });
    });
    if (mode === 'malformed') await assert.rejects(client.lookupBiginMembership(name()), e => e.code === 'ZOHO_INVALID_RESPONSE');
    else assert.deepEqual(await client.lookupBiginMembership(name()), { status: mode === 'empty' ? 'not_found' : 'ambiguous' });
  }
});

test('active free membership shows its saved dates without claiming a completed payment',()=>{assert.equal(projectMembershipSearch(name(),[record({paymentStatus:'Not required'})],false,'2026-10-27').status,'found');assert.equal(projectMembershipSearch(name(),[record({paymentStatus:'Awaiting payment'})],false,'2026-10-27').status,'dates_unavailable');});
