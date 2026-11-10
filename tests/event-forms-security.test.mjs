import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { signedPublicSession, checkMutation, requireCapability, cleanRegistration } from '../lib/event-forms/security.js';
import { prepareLegacyImport, FESTIVAL_FORM_ID } from '../lib/event-forms/migration.js';
import { defaultFestivalConfig } from '../lib/event-forms/festival-config.js';
import { defaultStallConfig } from '../lib/event-forms/stalls.js';
import { changedRows } from '../lib/event-forms/store.js';
import { digest } from '../lib/event-forms/security.js';

test('public form sessions reject forgery, expiry, future timestamps and cross-session CSRF', () => {
  const secret = randomBytes(32).toString('hex'), now = 1792454400000;
  const first = signedPublicSession(secret, null, now);
  assert.equal(signedPublicSession(secret, first.cookie, now + 5000).cookie, first.cookie);
  for (const [cookie, time] of [[first.cookie + 'x', now], [first.cookie, now - 1], [first.cookie, now + 8 * 3600000], [first.cookie.replace(first.csrf, 'a'.repeat(64)), now]]) assert.notEqual(signedPublicSession(secret, cookie, time).cookie, first.cookie);
  const req = { url: 'https://website.example/api/event-forms/festival/registrations', headers: { origin: 'https://website.example', 'content-type': 'application/json', 'x-csrf-token': first.csrf } };
  assert.doesNotThrow(() => checkMutation(req, first));
  assert.throws(() => checkMutation({ ...req, headers: { ...req.headers, origin: 'https://attacker.example' } }, first));
  assert.throws(() => checkMutation({ ...req, headers: { ...req.headers, 'x-csrf-token': '' } }, first));
});
test('private receipts require the original capability and never reveal organiser notes', () => {
  const token = randomBytes(32).toString('hex'), record = { id: randomUUID(), capabilityHash: digest(token), idempotencyKey: randomUUID(), notes: 'PRIVATE' };
  assert.doesNotThrow(() => requireCapability({ headers: { 'x-registration-token': token } }, record));
  for (const wrong of ['', 'a'.repeat(64)]) assert.throws(() => requireCapability({ headers: { 'x-registration-token': wrong } }, record));
  assert.deepEqual(cleanRegistration(record), { id: record.id });
  assert.equal(cleanRegistration(record, true).notes, 'PRIVATE');
  assert.equal(cleanRegistration(record, 1).notes, undefined);
});
test('migration preserves original IDs, hashes, snapshots, notes and archived records without merging membership data', () => {
  const id = randomUUID(), config = defaultFestivalConfig(), stall = defaultStallConfig();
  const record = { id, idempotencyKey: randomUUID(), createdAt: '2026-10-19T00:00:00Z', mode: 'test', capabilityHash: 'private-hash', review: { notes: 'Private note' }, eventSnapshot: { title: 'Original wording' } };
  const state = { festivalConfig: config, festivalRegistrations: [record], stallForms: [stall], stallApplications: [], events: [], registrations: [], audit: [] };
  const result = prepareLegacyImport({...state,festivalConfig:{...state.festivalConfig,mode:'test'},stallForms:state.stallForms.map(c=>({...c,mode:'test'})),events:state.events.map(c=>({...c,mode:'test'}))});
  assert.equal(result.submissions[0].id, id);
  assert.equal(result.submissions[0].form_id, FESTIVAL_FORM_ID);
  assert.deepEqual(result.submissions[0].answers.record, record);
  assert.ok(!('members' in result));
  assert.throws(() => prepareLegacyImport({ ...state, festivalRegistrations: [{ ...record, mode: 'live' }] }));
  assert.throws(() => prepareLegacyImport({ ...state, festivalRegistrations: [record, record] }));
});
test('storage produces per-record changes with optimistic versions rather than replacing a shared database document', () => {
  const config = defaultFestivalConfig();
  const state = { events: [], registrations: [], festivalConfig: config, festivalRegistrations: [], stallForms: [defaultStallConfig()], stallApplications: [], audit: [], rateLimits: {} };
  assert.deepEqual(changedRows(state, structuredClone(state)), []);
  const after = structuredClone(state); after.festivalConfig.version++; after.festivalConfig.venue = 'Updated venue';
  const form = changedRows(state, after);
  assert.equal(form.length, 1); assert.equal(form[0].table, 'forms'); assert.equal(form[0].expected_version, 1);
  const next = structuredClone(state); next.festivalRegistrations.push({ id: randomUUID(), idempotencyKey: randomUUID(), createdAt: '2026-10-19T00:00:00Z', mode: 'test', capabilityHash: 'hash', version: 1 });
  const registration = changedRows(state, next);
  assert.equal(registration[0].table, 'submissions'); assert.equal(registration[0].expected_version, null); assert.equal(registration[0].form_version, 1);
});
