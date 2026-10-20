'use client';

import { useActionState } from 'react';
import { signIn } from '@/app/admin/actions';

export default function OrganiserSignIn() {
  const [state, action, pending] = useActionState(signIn, { error: '' });
  return <form action={action} className="organiser-sign-in">
    <div className="form-field"><label htmlFor="organiser-email">Email address</label><input id="organiser-email" name="email" type="email" autoComplete="username" required maxLength={254}/></div>
    <div className="form-field"><label htmlFor="organiser-password">Password</label><input id="organiser-password" name="password" type="password" autoComplete="current-password" required maxLength={1024}/></div>
    {state.error && <p className="organiser-error" role="alert">{state.error}</p>}
    <button className="button" type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
    <p className="quiet-note">Use your ICSH organiser account. If you need access or help with your password, contact the ICSH website administrator.</p>
  </form>;
}
