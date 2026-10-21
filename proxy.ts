import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseConfig } from '@/lib/supabase/config';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = supabaseConfig();
  if (config) {
    const supabase = createServerClient(config.url, config.key, {
      cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: init?.signal ?? AbortSignal.timeout(12000) }) },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: values => {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    try { await supabase.auth.getClaims(); } catch { /* The page fails closed and displays a retry message. */ }
  }
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export const config = { matcher: ['/admin/:path*', '/api/event-forms/:path*', '/api/zoho/:path*'] };
