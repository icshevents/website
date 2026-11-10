import { createClient } from '@supabase/supabase-js';
import { AppError } from './domain.js';

export function createEventService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (url !== 'https://xxtsbuvwvrvtvmdxwcpx.supabase.co' || !key?.startsWith('sb_secret_')) throw new AppError('The event database server connection is not ready.', 503);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: init?.signal ?? AbortSignal.timeout(15000) }) },
  });
}
