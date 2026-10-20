import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const target = new URL(process.argv[2]);
if (target.protocol !== 'https:' || !target.hostname.startsWith('website-') || !target.hostname.endsWith('.vercel.app')) throw new Error('Unexpected verification target');
const cli = process.env.ICSH_VERCEL_CLI;
if (!cli) throw new Error('Set ICSH_VERCEL_CLI to the installed Vercel executable');
mkdirSync('.local', { recursive: true });
const cookie = '.local/hosted-harrow-cookie.txt', headersFile = '.local/hosted-harrow-headers.txt', bodyFile = '.local/hosted-harrow-body.json';
writeFileSync(cookie, '', { mode: 0o600 });
let csrf;
function call(path, { method = 'GET', body, capability, forgedCsrf = false } = {}) {
  const headers = ['Origin: ' + target.origin];
  if (method !== 'GET') headers.push('Content-Type: application/json', 'X-CSRF-Token: ' + (forgedCsrf ? 'wrong' : csrf || ''));
  if (capability) headers.push('X-Registration-Token: ' + capability);
  writeFileSync(headersFile, headers.join('\n') + '\n', { mode: 0o600 });
  const args = ['curl', '/api/event-forms/' + path, '--deployment', target.origin, '--scope', 'icsh', '--', '--silent', '--show-error', '--include', '--cookie', cookie, '--cookie-jar', cookie, '--header', '@' + headersFile, '--request', method];
  if (body !== undefined) { writeFileSync(bodyFile, JSON.stringify(body), { mode: 0o600 }); args.push('--data-binary', '@' + bodyFile); }
  const result = spawnSync(cli, args, { encoding: 'utf8', maxBuffer: 2000000, timeout: 60000 });
  if (result.status !== 0) throw new Error('Protected HTTP transport failed; no credential or response body printed.');
  const matches = [...result.stdout.matchAll(/HTTP\/[\d.]+\s+(\d{3})[^\r\n]*\r?\n/g)];
  const last = matches.at(-1); if (!last) throw new Error('Missing HTTP status');
  const raw = result.stdout.slice(last.index), separator = raw.match(/\r?\n\r?\n/);
  if (!separator) throw new Error('Missing HTTP body');
  const data = JSON.parse(raw.slice(separator.index + separator[0].length));
  return { status: Number(last[1]), data };
}

const health = call('health'); assert.equal(health.status, 200); assert.equal(health.data.database, 'connected');
const session = call('session'); assert.equal(session.status, 200); assert.equal(session.data.admin, false); csrf = session.data.csrf;
assert.equal(call('admin/festival').status, 401);
assert.equal(call('admin/stalls').status, 401);
assert.equal(call('admin/stalls/export').status, 401);
assert.equal(call('auth/login', { method: 'POST', body: { password: 'synthetic-wrong-password' } }).status, 405);
assert.equal(call('stalls/applications', { method: 'POST', body: {}, forgedCsrf: true }).status, 403);
const config = call('stalls/config/harrow-food-festival-2026-stall-hire'); assert.equal(config.status, 200);
const c = config.data.config, capability = randomBytes(32).toString('hex');
const body = { slug: c.slug, configVersion: c.version, idempotencyKey: randomUUID(), personal: { firstName: 'Migration', lastName: 'Stall Verification', phone: '07700900123', email: 'stall-migration@example.test', whatsapp: false }, business: { name: 'Fictional migration verification', registrationNumber: '', items: 'Fictional packaged goods; test only', category: 'Packaged food', other: '', requirements: 'No real stall requested. Migration verification only.' }, packageId: c.packages[0].id, agreements: { hire: true, profit: true, management: true, safety: true, accuracy: true }, testData: true, website: '' };
// The session must be at least 1.5 seconds old; preceding HTTP checks provide that interval.
const submission = call('stalls/applications', { method: 'POST', body, capability });
if (submission.status !== 201) throw new Error('Stall submission failed: ' + submission.status + ' ' + (submission.data.error || 'Unknown validation error'));
const id = submission.data.application.id;
assert.equal(submission.data.application.fee, c.packages[0].fee);
assert.equal(submission.data.application.payment.verified, false);
assert.ok(!('capabilityHash' in submission.data.application));
assert.ok(!('notes' in submission.data.application));
assert.equal(call('stalls/applications/' + id).status, 404);
assert.equal(call('stalls/applications/' + id, { capability: randomBytes(32).toString('hex') }).status, 404);
assert.equal(call('stalls/applications/' + id, { capability }).status, 200);
const duplicate = call('stalls/applications', { method: 'POST', body, capability });
assert.equal(duplicate.status, 201); assert.equal(duplicate.data.application.id, id);
assert.equal(call('stalls/applications', { method: 'POST', body, capability: randomBytes(32).toString('hex') }).status, 409);
assert.equal(call('stalls/applications/' + id + '/simulate', { method: 'POST', body: { outcome: 'success' }, capability }).status, 409);
const report = { target: target.origin, checkedAt: new Date().toISOString(), result: 'passed', checks: ['protected server connection', 'anonymous admin/export denial', 'shared-password login disabled', 'CSRF denial', 'server-owned stall fee', 'private receipt access', 'idempotency', 'early checkout denial', 'simulated payment only'], stallId: id, capability };
writeFileSync('.local/hosted-harrow-verification.json', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ result: report.result, checks: report.checks.length, createdFictionalStallRecords: 1 }));
