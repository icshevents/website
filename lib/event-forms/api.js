import { cookies } from 'next/headers';
import { createSupabaseServerClient, organiserSession } from '../supabase/server.ts';
import { createEventService } from './service.js';
import { requestContext } from './context.js';
import { signedPublicSession, checkMutation, clientKey, requireAdmin } from './security.js';
import { AppError } from './domain.js';
import handler from './handler.js';
import { searchBiginMembershipRecords } from '../zoho/server';

async function readBody(request) {
  if (!request.body) return {};
  const reader = request.body.getReader(), chunks = []; let length = 0;
  for (;;) {
    const part = await reader.read(); if (part.done) break;
    length += part.value.length;
    if (length > 64000) { await reader.cancel(); throw new AppError('This submission is too large.', 413); }
    chunks.push(Buffer.from(part.value));
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid object');
    return value;
  }
  catch { throw new AppError('Invalid request format.', 400); }
}

export async function runEventApi(request, path) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    if (path === 'auth/login') return Response.json({ error: 'Use the website organiser sign-in page.' }, { status: 405, headers });
    const db = createEventService(), url = new URL(request.url);
    if (path === 'health') {
      const check = await db.from('icsh_forms').select('id', { count: 'exact', head: true });
      if (check.error) throw new AppError('The event database connection needs attention.', 503);
      return Response.json({ ok: true, mode: 'test', database: 'connected', zoho: 'membership_read_only', stripe: 'disabled', email: 'preview_only' }, { headers });
    }
    const body = request.method === 'GET' || request.method === 'HEAD' ? {} : await readBody(request);
    const cookieStore = await cookies(), cookieName = process.env.VERCEL ? '__Host-icsh-forms' : 'icsh-forms';
    const signed = signedPublicSession(process.env.SUPABASE_SECRET_KEY, cookieStore.get(cookieName)?.value);
    if (cookieStore.get(cookieName)?.value !== signed.cookie) cookieStore.set(cookieName, signed.cookie, { httpOnly: true, secure: Boolean(process.env.VERCEL), sameSite: 'strict', path: '/', maxAge: 8 * 3600 });
    const access = await organiserSession();
    const session = { csrf: signed.csrf, issuedAt: signed.issuedAt, admin: access.status === 'organiser', loggedAt: Date.now(), save: async () => {}, destroy: () => {} };
    const req = { url: request.url, query: { path }, method: request.method, headers: Object.fromEntries(request.headers), body };
    return await requestContext.run({ db, path, body, method: request.method, url, req, session, lookupMembership: searchBiginMembershipRecords, secret: process.env.SUPABASE_SECRET_KEY }, async () => {
      if (path.startsWith('admin/')) requireAdmin(session);
      if (!['GET', 'HEAD'].includes(request.method)) {
        checkMutation(req, session);
        const key = (path.startsWith('admin/') ? 'admin:' : path.includes('stalls') ? 'stalls:' : 'forms:') + clientKey(req);
        const rate = await db.rpc('icsh_event_rate_limit', { p_key: key, p_max: path.startsWith('admin/') ? 150 : 30 });
        if (rate.error) throw new AppError('The event database is awaiting its server setup.', 503);
        if (!rate.data) throw new AppError('Too many attempts. Please wait ten minutes.', 429);
      }
      if (path === 'auth/logout' && request.method === 'POST') {
        const auth = await createSupabaseServerClient(true);
        const signedOut = await auth?.auth.signOut({ scope: 'local' });
        if (signedOut?.error) throw new AppError('Unable to sign out. Please retry.', 503);
        cookieStore.delete(cookieName);
        return Response.json({ ok: true }, { headers });
      }
      let status = 200, payload = '';
      const outputHeaders = new Headers(headers);
      const response = { get statusCode() { return status; }, set statusCode(value) { status = value; }, setHeader: (key, value) => outputHeaders.set(key, String(value)), end: value => { payload = value ?? ''; } };
      await handler(req, response);
      return new Response(payload, { status, headers: outputHeaders });
    });
  } catch (error) {
    return Response.json({ error: error instanceof AppError ? error.message : 'The event service is temporarily unavailable. Please try again.' }, { status: error instanceof AppError ? error.status : 503, headers });
  }
}
