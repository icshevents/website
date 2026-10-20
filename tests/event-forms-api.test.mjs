import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import handler from '../lib/event-forms/handler.js';
import { requestContext } from '../lib/event-forms/context.js';
import { defaultFestivalConfig } from '../lib/event-forms/festival-config.js';
import { formRow, submissionRow } from '../lib/event-forms/migration.js';
import { registerFestival } from '../lib/event-forms/festival.js';
import { digest } from '../lib/event-forms/security.js';

function fakeDatabase(tables) {
  let reads = 0;
  return { get reads() { return reads; }, from(table) {
    reads++;
    let rows = structuredClone(tables[table] || []);
    const result = () => ({ data: rows, count: rows.length, error: null });
    const query = { select() { return query; }, in(key, values) { rows = rows.filter(row => values.includes(row[key])); return query; }, eq(key, value) { rows = rows.filter(row => row[key] === value); return query; }, order() { return query; }, limit(n) { rows = rows.slice(0, n); return query; }, range(a, b) { return Promise.resolve({ ...result(), data: rows.slice(a, b + 1) }); }, then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); } };
    return query;
  } };
}
function fixture() {
  const config = defaultFestivalConfig(), capability = 'a'.repeat(64);
  const state = { festivalConfig: config, festivalRegistrations: [] };
  const record = registerFestival(state, { configVersion: 1, idempotencyKey: randomUUID(), personal: { firstName: 'Synthetic', lastName: 'Tester', email: 'synthetic@example.test', phone: '07700900123', country: 'GB', whatsapp: false }, involvement: ['volunteer'], cooking: null, donation: null, volunteering: { activities: ['Event setup'], activityOther: '', shifts: ['setup'], experience: '', additional: '', adjustments: '', acknowledgement: true }, customAnswers: {}, acknowledgements: { fundraising: false, accuracy: true, privacy: true, marketing: false, testData: true }, website: '' }, digest(capability));
  record.review.notes = 'PRIVATE ORGANISER NOTE';
  return { record, capability, db: fakeDatabase({ icsh_forms: [formRow('participation', config)], icsh_submissions: [submissionRow('participation', record)] }) };
}
async function call(db, path, { admin = false, capability } = {}) {
  const req = { url: 'https://website.example/api/event-forms/' + path, query: { path }, method: 'GET', headers: capability ? { 'x-registration-token': capability } : {}, body: {} };
  let status = 200, raw; const headers = new Map();
  await requestContext.run({ db, path, body: {}, method: 'GET', url: new URL(req.url), req, secret: 'synthetic-test-secret', session: { admin, loggedAt: Date.now(), csrf: 'synthetic-csrf', issuedAt: Date.now(), save: async () => {} } }, () => handler(req, { get statusCode() { return status; }, set statusCode(n) { status = n; }, setHeader(key, value) { headers.set(key.toLowerCase(), value); }, end(value) { raw = value; } }));
  return { status, raw, headers };
}

test('organiser API and CSV exports deny visitors before reading any private rows', async () => {
  const { db } = fixture();
  for (const path of ['admin/festival', 'admin/festival/export', 'admin/stalls', 'admin/stalls/export']) assert.equal((await call(db, path)).status, 401);
  assert.equal(db.reads, 0);
});
test('approved organiser exports contain saved participant data without capability hashes', async () => {
  const { db, record } = fixture();
  const csv = await call(db, 'admin/festival/export', { admin: true });
  assert.equal(csv.status, 200); assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.ok(csv.raw.includes(record.reference)); assert.ok(csv.raw.includes('PRIVATE ORGANISER NOTE'));
  assert.ok(!csv.raw.includes(record.capabilityHash));
});
test('private participant confirmations survive database loading and redact review notes', async () => {
  const { db, record, capability } = fixture();
  const path = 'festival/registrations/' + record.id;
  assert.equal((await call(db, path)).status, 404);
  const receipt = await call(db, path, { capability });
  assert.equal(receipt.status, 200); assert.ok(receipt.raw.includes(record.reference));
  assert.ok(!receipt.raw.includes('PRIVATE ORGANISER NOTE')); assert.ok(!receipt.raw.includes(record.capabilityHash));
});
