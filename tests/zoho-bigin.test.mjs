import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBiginConnection } from '../lib/zoho/bigin.ts';
import { ZohoError } from '../lib/zoho/client.ts';

const org = { org: [{ company_name: 'ICSH', id: '123456789', primary_email: 'private@example.test', phone: '07700900000' }] };
const fields = { fields: [
  { api_name: 'Last_Name', field_label: 'Last name', data_type: 'text', system_mandatory: true, pick_list_values: [], profiles: [{ name: 'private user' }] },
  { api_name: 'Current_Status', display_label: 'Membership status', data_type: 'picklist', system_mandatory: false, pick_list_values: [{ display_value: 'Active', actual_value: 'ACTIVE' }, { display_value: 'Expired', actual_value: 'EXPIRED' }] },
] };

test('Bigin diagnostics read organization identity and Contacts field definitions only', async () => {
  const calls = [];
  const result = await checkBiginConnection(async (path, params) => {
    calls.push([path, params]);
    return path.endsWith('/org') ? org : fields;
  });
  assert.deepEqual(calls, [['/bigin/v2/org', undefined], ['/bigin/v2/settings/fields', { module: 'Contacts' }]]);
  assert.equal(result.status, 'connected');
  assert.deepEqual(result.organisation, { name: 'ICSH', id: '123456789' });
  assert.deepEqual(result.fields, [
    { apiName: 'Last_Name', label: 'Last name', dataType: 'text', required: true, options: [] },
    { apiName: 'Current_Status', label: 'Membership status', dataType: 'picklist', required: false, options: ['Active', 'Expired'] },
  ]);
  assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
  assert.doesNotMatch(JSON.stringify(result), /private@example|07700900000|private user|primary_email|profiles/);
});

test('an identified organization can have an empty field inventory without fabricated mappings', async () => {
  const result = await checkBiginConnection(async path => path.endsWith('/org') ? org : { fields: [] });
  assert.deepEqual(result.organisation, { name: 'ICSH', id: '123456789' });
  assert.deepEqual(result.fields, []);
});

test('empty or multiple organizations cannot claim a verified connection', async () => {
  for (const organizationResponse of [{ org: [] }, { org: [...org.org, ...org.org] }]) {
    await assert.rejects(
      checkBiginConnection(async path => path.endsWith('/org') ? organizationResponse : fields),
      error => error instanceof ZohoError && error.code === 'ZOHO_INVALID_RESPONSE',
    );
  }
});

test('malformed organization and field responses cannot claim a successful connection', async () => {
  for (const [organizationResponse, fieldsResponse] of [
    [null, fields], [{ org: {} }, fields], [{ org: [{ primary_email: 'private@example.test' }] }, fields],
    [org, { fields: {} }], [org, { fields: [{ api_name: 'Missing_metadata' }] }],
    [org, { fields: [{ ...fields.fields[0], pick_list_values: 'wrong shape' }] }],
  ]) {
    await assert.rejects(checkBiginConnection(async path => path.endsWith('/org') ? organizationResponse : fieldsResponse), error => {
      assert.ok(error instanceof ZohoError);
      assert.equal(error.code, 'ZOHO_INVALID_RESPONSE');
      assert.doesNotMatch(error.message, /private@example/);
      return true;
    });
  }
});

test('provider connection errors propagate as failures rather than empty membership records', async () => {
  const expected = new ZohoError('ZOHO_SCOPE_MISMATCH');
  await assert.rejects(checkBiginConnection(async () => { throw expected; }), error => error === expected);
});
