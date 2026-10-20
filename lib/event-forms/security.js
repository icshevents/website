import { randomBytes, timingSafeEqual, createHash, createHmac } from 'node:crypto';
import { AppError } from './domain.js';
import { currentContext } from './context.js';
export const token = () => randomBytes(32).toString('hex');
export const digest = value => createHash('sha256').update(value).digest('hex');
export function constantEqual(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); }
export function signedPublicSession(secret, existing, now = Date.now()) {
  const sign = value => createHmac('sha256', secret).update('icsh-form-session-v1:' + value).digest('hex');
  const parts = String(existing || '').split('.');
  if (parts.length === 3 && /^\d{13}$/.test(parts[0]) && /^[a-f0-9]{64}$/.test(parts[1]) && /^[a-f0-9]{64}$/.test(parts[2]) && constantEqual(sign(parts[0] + '.' + parts[1]), parts[2]) && now - Number(parts[0]) >= 0 && now - Number(parts[0]) < 8 * 3600000) return { cookie: existing, csrf: parts[2], issuedAt: Number(parts[0]) };
  const value = now + '.' + token();
  return { cookie: value + '.' + sign(value), csrf: sign(value), issuedAt: now };
}
export async function sessionFor() { return currentContext().session; }
export function verifyPassword() { return false; }
export function requireAdmin(session) { if (!session.admin) throw new AppError('Sign in with your approved organiser account to continue.', 401); }
export function checkMutation(req, session) {
  const origin = new URL(req.url).origin;
  if (req.headers.origin !== origin) throw new AppError('Request origin not allowed.', 403);
  if (!req.headers['content-type']?.startsWith('application/json')) throw new AppError('Expected a JSON request.', 415);
  if (!session.csrf || !constantEqual(String(req.headers['x-csrf-token'] || ''), session.csrf)) throw new AppError('Your session changed. Reload the page and try again.', 403);
}
export function clientKey(req) { return createHmac('sha256', currentContext().secret).update('icsh-rate:' + String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || 'local').split(',')[0]).digest('hex'); }
export function requireCapability(req, record) {
  const value = String(req.headers['x-registration-token'] || '');
  if (!record || !/^[a-f0-9]{64}$/.test(value) || !constantEqual(digest(value), record.capabilityHash)) throw new AppError('Registration not found. Open your private confirmation link.', 404);
}
export function cleanRegistration(record, admin = false) { const { capabilityHash, idempotencyKey, notes, ...safe } = record; return admin === true ? { ...safe, notes } : safe; }
