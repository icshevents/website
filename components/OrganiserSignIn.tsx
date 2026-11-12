'use client';

import { useActionState } from 'react';
import { signIn } from '@/app/admin/actions';

export default function OrganiserSignIn() {
  const [state, action, pending] = useActionState(signIn, { error: '' });
  return <form action={action} className="organiser-sign-in">
    <div className="form-field"><label htmlFor="organiser-password">Password</label><input id="organiser-password" name="password" type="password" autoComplete="current-password" required maxLength={1024}/></div>
    {state.error && <p className="organiser-error" role="alert">{state.error}</p>}
    <button className="button" type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
    <p className="quiet-note">Use the organiser password provided by ICSH. No email address is needed.</p>
  </form>;
}
