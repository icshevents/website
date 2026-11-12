'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { verifyOrganiserAccess } from '@/lib/organiser-access';
import {passwordOrganiserSignIn} from '@/lib/organiser-signin';
import {headers} from 'next/headers';
import {createHmac} from 'node:crypto';
import {createEventService} from '@/lib/event-forms/service.js';

export type SignInState = { error: string };

export async function signIn(_previous: SignInState, form: FormData): Promise<SignInState> {
  const result=await passwordOrganiserSignIn(form,{
    client:()=>createSupabaseServerClient(true),
    verify:verifyOrganiserAccess,
    allowAttempt:async()=>{
      const requestHeaders=await headers();
      const address=(requestHeaders.get('x-vercel-forwarded-for')||requestHeaders.get('x-forwarded-for')||'unknown').split(',')[0].trim();
      const secret=process.env.SUPABASE_SECRET_KEY;
      if(!secret)throw new Error('Sign-in connection unavailable');
      const key=createHmac('sha256',secret).update('organiser-signin:'+address).digest('hex');
      const limited=await createEventService().rpc('icsh_event_rate_limit',{p_key:key,p_max:10});
      if(limited.error)throw new Error('Sign-in limiter unavailable');
      return limited.data===true;
    }
  });
  if('error' in result)return result;
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
