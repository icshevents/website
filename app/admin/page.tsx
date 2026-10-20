import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHero } from '@/components/Shared';
import { organiserSession } from '@/lib/supabase/server';
import { signOut } from './actions';

export default async function OrganiserDashboard() {
  const session = await organiserSession();
  if (session.status === 'signed-out') redirect('/admin/sign-in');
  if (session.status !== 'organiser') return <>
    <PageHero label="ICSH · Organisers" title="Workspace unavailable" description="Your organiser access could not be confirmed."/>
    <section className="section white"><div className="wrap"><div className="notice"><p>{session.status === 'forbidden' ? 'This account has not been approved for organiser access.' : 'The organiser database setup or connection needs attention. No private records have been displayed.'}</p><Link className="button outline" href="/admin/sign-in">Return to sign in</Link></div></div></section>
  </>;
  const [forms, submissions] = await Promise.all([
    session.supabase.from('icsh_forms').select('id,title,slug,status').order('created_at', { ascending: false }).limit(50),
    session.supabase.from('icsh_submissions').select('id', { count: 'exact', head: true }),
  ]);
  const ready = !forms.error && !submissions.error;
  return <>
    <PageHero label="ICSH · Organisers" title="Organiser workspace" description="Your private home for ICSH event forms and submissions."/>
    <section className="section white"><div className="wrap">
      <div className="organiser-toolbar"><p>Signed in as <strong>{session.user.email}</strong></p><form action={signOut}><button className="button outline" type="submit">Sign out</button></form></div>
      <div className="notice"><strong>The website forms are being connected.</strong><p>Existing Harrow forms and signups have not yet moved into this workspace. Their records remain in the previous event application. Payments and membership verification are not live.</p></div>
      {ready ? <div className="organiser-stats"><article className="panel"><span className="eyebrow">Website forms</span><h2>{forms.data?.length ?? 0}</h2><p>Forms currently held in Supabase.</p></article><article className="panel"><span className="eyebrow">Website submissions</span><h2>{submissions.count ?? 0}</h2><p>Excludes records awaiting migration.</p></article><article className="panel"><span className="eyebrow">Database</span><h3>Connected</h3><p>Supabase answered a protected query for your organiser account.</p></article></div> : <div className="notice"><strong>Form tables need setting up.</strong><p>Organiser sign-in is working. The website’s form and submission tables are not ready yet.</p></div>}
      {forms.data && forms.data.length > 0 && <div className="panel"><h2>Website forms</h2><ul>{forms.data.map(form => <li key={form.id}>{form.title} · {form.status}</li>)}</ul></div>}
      <p><Link className="text-link" href="/events">View Our Events ↗</Link></p>
    </div></section>
  </>;
}
