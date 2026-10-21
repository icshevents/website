import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCampaignsConnection } from '../lib/zoho/campaigns.ts';

const paths = {
  lists: '/api/v1.1/getmailinglists',
  topics: '/api/v1.1/topics',
  fields: '/api/v1.1/contact/allfields',
};
function responses() {
  return {
    [paths.lists]: { status: 'success', code: '0', list_of_details: [
      { listkey: 'synthetic-list', listname: 'Website tests', owner: 'private@example.test', noofcontacts: '17' },
    ] },
    [paths.topics]: { code: '200', topicDetails: [
      { topicId: '80696000000044001', topicName: 'Community news', primaryList: 'private-list' },
    ] },
    [paths.fields]: { response: { code: '0', message: 'success', fieldname: [
      { FIELD_NAME: 'contact_email', DISPLAY_NAME: 'Contact Email', FIELD_ID: '4000000000015' },
    ] } },
  };
}

test('Campaigns diagnostics use only metadata endpoints and return minimal values from documented envelopes', async () => {
  const fixtures = responses(), calls = [];
  const result = await checkCampaignsConnection(async (path, params) => {
    calls.push({ path, params });
    assert.ok(Object.values(paths).includes(path));
    return fixtures[path];
  });
  assert.equal(result.status, 'connected');
  assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
  assert.deepEqual(result.lists, [{ id: 'synthetic-list', name: 'Website tests' }]);
  assert.deepEqual(result.topics, [{ id: '80696000000044001', name: 'Community news' }]);
  assert.deepEqual(result.fields, [{ apiName: 'contact_email', label: 'Contact Email' }]);
  assert.equal(result.truncated, false);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.find((call) => call.path === paths.lists).params, { resfmt: 'JSON', sort: 'asc', fromindex: 1, range: 100 });
  assert.deepEqual(JSON.parse(calls.find((call) => call.path === paths.topics).params.details), { from_index: 0, range: 100 });
  assert.deepEqual(calls.find((call) => call.path === paths.fields).params, { type: 'json' });
  assert.doesNotMatch(JSON.stringify(result), /private@example|primaryList|FIELD_ID|noofcontacts/);
});

test('Campaigns handles empty accounts and both direct and nested metadata envelopes', async () => {
  for (const nested of [false, true]) {
    const fixtures = responses();
    const emptyLists = { status: 'error', code: '2401', message: 'No mailing list has been created.' };
    fixtures[paths.lists] = nested ? { response: emptyLists } : emptyLists;
    fixtures[paths.topics] = { response: { code: 200, topicDetails: [] } };
    fixtures[paths.fields] = { code: 0, fieldname: [] };
    const result = await checkCampaignsConnection(async (path) => fixtures[path]);
    assert.deepEqual([result.lists, result.topics, result.fields], [[], [], []]);
    assert.equal(result.truncated, false);
  }
});

test('Campaigns follows list and topic pagination and keeps large string IDs intact', async () => {
  const fixtures = responses(), indices = { lists: [], topics: [] };
  const result = await checkCampaignsConnection(async (path, params) => {
    if (path === paths.lists) {
      indices.lists.push(params.fromindex);
      return { code: '0', list_of_details: Array.from({ length: params.fromindex === 1 ? 100 : 1 }, (_, i) => ({ listkey: `list-${params.fromindex + i}`, listname: `List ${params.fromindex + i}` })) };
    }
    if (path === paths.topics) {
      const { from_index } = JSON.parse(params.details);
      indices.topics.push(from_index);
      return { code: 200, topicDetails: Array.from({ length: from_index === 0 ? 100 : 1 }, (_, i) => ({ topicId: `80696000000044${String(from_index + i).padStart(3, '0')}`, topicName: `Topic ${from_index + i}` })) };
    }
    return fixtures[path];
  });
  assert.deepEqual(indices, { lists: [1, 101], topics: [0, 100] });
  assert.equal(result.lists.length, 101);
  assert.equal(result.topics.length, 101);
  assert.equal(result.topics.at(-1).id, '80696000000044100');
  assert.equal(result.truncated, false);
});

test('Campaigns limits inventory reads and explicitly reports possibly incomplete results', async () => {
  const fixtures = responses();
  let listCalls = 0;
  const result = await checkCampaignsConnection(async (path, params) => {
    if (path !== paths.lists) return fixtures[path];
    listCalls++;
    return { code: 0, list_of_details: Array.from({ length: 100 }, (_, i) => ({ listkey: `list-${params.fromindex + i}`, listname: 'Synthetic list' })) };
  });
  assert.equal(listCalls, 3);
  assert.equal(result.lists.length, 300);
  assert.equal(result.truncated, true);
});

test('Campaigns stops repeated provider pages and marks truncated rather than fabricating completeness', async () => {
  const fixtures = responses();
  let listCalls = 0;
  const page = { code: 0, list_of_details: Array.from({ length: 100 }, (_, i) => ({ listkey: `list-${i}`, listname: 'Synthetic list' })) };
  const result = await checkCampaignsConnection(async (path) => {
    if (path !== paths.lists) return fixtures[path];
    listCalls++;
    return page;
  });
  assert.equal(listCalls, 2);
  assert.equal(result.lists.length, 100);
  assert.equal(result.truncated, true);
});

test('Campaigns rejects HTTP-200 provider errors and malformed schemas without leaking provider details', async () => {
  const badResponses = [
    [paths.lists, { code: '2706', message: 'private-token-and-account-detail' }],
    [paths.topics, { response: { code: '4010', message: 'private-token-and-account-detail' } }],
    [paths.fields, { response: { status: 'error', message: 'private-token-and-account-detail' } }],
    [paths.lists, { status: 'success', code: '0' }],
    [paths.topics, { code: 200, topicDetails: [{ topicId: 80696000000044001, topicName: 'unsafe numeric precision' }] }],
    [paths.fields, { response: { code: 0, fieldname: [{ FIELD_NAME: null, DISPLAY_NAME: 'Invalid' }] } }],
    [paths.fields, '<html>private-token-and-account-detail</html>'],
  ];
  for (const [path, response] of badResponses) {
    const fixtures = { ...responses(), [path]: response };
    await assert.rejects(() => checkCampaignsConnection(async (key) => fixtures[key]), (error) => {
      assert.ok(['ZOHO_PROVIDER_REJECTED', 'ZOHO_INVALID_RESPONSE'].includes(error.code));
      assert.doesNotMatch(error.message, /private-token|account-detail|unsafe numeric/);
      return true;
    });
  }
});
