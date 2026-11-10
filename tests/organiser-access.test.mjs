import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyOrganiserAccess } from '../lib/organiser-access.ts';
import { supabaseConfig } from '../lib/supabase/config.ts';

function client({ user = { id: 'approved-user', user_metadata: {} }, authError = null, row = null, databaseError = null, offline = false } = {}) {
  const calls = [];
  return {
    calls,
    auth: { getUser: async () => { if (offline) throw new Error('offline'); return { data: { user }, error: authError }; } },
    from(table) { calls.push(table); return { select(column) { calls.push(column); return { eq(column, id) { calls.push([column, id]); return { maybeSingle: async () => ({ data: row, error: databaseError }) }; } }; } }; },
  };
}
test('signed-out and invalid identities cannot read organiser permissions', async () => {
  for (const options of [{ user: null }, { authError: new Error('invalid JWT') }]) {
    const db = client(options);
    assert.equal((await verifyOrganiserAccess(db)).status, 'signed-out');
    assert.deepEqual(db.calls, []);
  }
});
test('an ordinary signed-in user cannot promote themselves through user metadata', async () => {
  const db = client({ user: { id: 'ordinary-user', user_metadata: { role: 'admin', organiser: true } } });
  assert.equal((await verifyOrganiserAccess(db)).status, 'forbidden');
  assert.deepEqual(db.calls.at(-1), ['user_id', 'ordinary-user']);
});
test('only a matching database permission grants organiser access', async () => {
  assert.equal((await verifyOrganiserAccess(client({ row: { user_id: 'approved-user' } }))).status, 'organiser');
  assert.equal((await verifyOrganiserAccess(client({ row: { user_id: 'somebody-else' } }))).status, 'forbidden');
});
test('missing tables, denied queries and network failures fail closed', async () => {
  assert.equal((await verifyOrganiserAccess(client({ databaseError: { code: '42P01' } }))).status, 'database');
  assert.equal((await verifyOrganiserAccess(client({ databaseError: { code: '42501' } }))).status, 'database');
  assert.equal((await verifyOrganiserAccess(client({ offline: true }))).status, 'unavailable');
});
test('public configuration rejects secret keys and unsafe or incomplete project URLs', () => {
  const names = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  const previous = names.map(name => process.env[name]);
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    for (const key of ['', 'sb_secret_private', 'eyJlegacy-service-role']) {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key;
      assert.equal(supabaseConfig(), null);
    }
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    assert.equal(supabaseConfig().url, 'https://project.supabase.co');
    for (const url of ['http://project.supabase.co', 'not-a-url', 'https://user:password@project.supabase.co', 'https://project.supabase.co/incorrect', 'https://project.supabase.co?key=secret']) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = url;
      assert.equal(supabaseConfig(), null);
    }
  } finally {
    names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; });
  }
});
