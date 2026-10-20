import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { organiserSession } from '@/lib/supabase/server';

export async function eventFormDocument(request: Request, admin = false) {
  if (admin) {
    const access = await organiserSession();
    if (access.status === 'signed-out') return Response.redirect(new URL('/admin/sign-in', request.url), 303);
    if (access.status !== 'organiser') return new Response('Organiser access could not be confirmed. Please sign in with an approved ICSH account.', { status: 403, headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'text/plain' } });
  }
  const html = await readFile(join(process.cwd(), 'lib/event-forms/shell.html'), 'utf8');
  return new Response(html, { headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    'Referrer-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff',
  } });
}
