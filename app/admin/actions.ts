'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { verifyOrganiserAccess } from '@/lib/organiser-access';

export type SignInState = { error: string };

export async function signIn(_previous: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !password || password.length > 1024) {
    return { error: 'Enter your organiser email and password.' };
  }
  try {
    const supabase = await createSupabaseServerClient(true);
    if (!supabase) return { error: 'Organiser sign-in is awaiting its connection settings. Please contact ICSH.' };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return { error: 'Unable to sign in. Check your email and password, then try again.' };
    const access = await verifyOrganiserAccess(supabase);
    if (access.status !== 'organiser') {
      await supabase.auth.signOut({ scope: 'local' });
      return { error: access.status === 'forbidden' ? 'This account does not have organiser access. Please contact ICSH.' : 'Your account was recognised, but organiser permissions are not ready yet. Please contact ICSH.' };
    }
  } catch { return { error: 'Sign-in is temporarily unavailable. Please try again shortly.' }; }
  redirect('/admin');
}

export async function signOut() {
  const supabase = await createSupabaseServerClient(true);
  if (supabase) {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw new Error('Unable to sign out. Please try again.');
  }
  redirect('/admin/sign-in');
}
