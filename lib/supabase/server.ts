import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseConfig } from './config';
import { verifyOrganiserAccess } from '../organiser-access';

export async function createSupabaseServerClient(writable = false) {
  const config = supabaseConfig();
  if (!config) return null;
  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: init?.signal ?? AbortSignal.timeout(12000) }) },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: values => {
        // The proxy refreshes sessions for Server Components, which cannot write cookies.
        if (writable) values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });
}

export async function organiserSession() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: 'configuration' as const };
  return verifyOrganiserAccess(supabase);
}
