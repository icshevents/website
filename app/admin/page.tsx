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
      <div className="notice"><strong>Public applications are open.</strong><p>Membership, event, festival and stall forms accept live details. New membership applications are sent automatically to Bigin as Inactive; existing contacts and renewals require review. No membership is activated, payment taken or email sent. Historical test submissions remain labelled separately.</p></div>
      {ready ? <div className="organiser-stats"><article className="panel"><span className="eyebrow">Published forms</span><h2>{forms.data?.filter(f=>f.status==='published').length ?? 0}</h2><p>Shareable website forms.</p></article><article className="panel"><span className="eyebrow">Saved submissions</span><h2>{submissions.count ?? 0}</h2><p>Includes preserved archived registrations.</p></article><article className="panel"><span className="eyebrow">Database</span><h3>Connected</h3><p>Supabase answered a protected query for your organiser account.</p></article></div> : <div className="notice"><strong>The form database needs attention.</strong><p>Please retry shortly or contact the website administrator.</p></div>}
      <div className="organiser-stats"><article className="panel"><h3>Food festival</h3><p>Review cooking offers, donations and volunteers. Edit questions and event details.</p><Link className="button" href="/admin/forms/harrow-food-festival-2026">Manage participants ↗</Link></article><article className="panel"><h3>Stall applications</h3><p>Review stallholders, test payment statuses, prices and application settings.</p><Link className="button" href="/admin/forms/stall-hire">Manage stalls ↗</Link></article><article className="panel"><h3>Form builder</h3><p>Create drafts, configure questions and ticket rates, and export registrations.</p><Link className="button outline" href="/admin/forms">Open form workspace ↗</Link></article></div>
      <div className="organiser-toolbar"><Link className="button outline" href="/admin/memberships">Membership applications ↗</Link><Link className="button outline" href="/admin/connections">Zoho connection settings ↗</Link><Link className="text-link" href="/events">View Our Events ↗</Link></div>
    </div></section>
  </>;
}
