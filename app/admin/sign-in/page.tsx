import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHero } from '@/components/Shared';
import OrganiserSignIn from '@/components/OrganiserSignIn';
import { organiserSession } from '@/lib/supabase/server';

export default async function SignInPage() {
  const session = await organiserSession();
  if (session.status === 'organiser') redirect('/admin/membership');
  return <>
    <PageHero label="ICSH · Organisers" title="Admin Hub" description="A private workspace for the people bringing our community together."/>
    <section className="section white"><div className="wrap organiser-login-grid">
      <div className="panel organiser-login-panel"><h2>Welcome back.</h2><p>Enter the Admin Hub password to open the workspace.</p>
        {session.status === 'configuration' ? <p className="notice">Organiser sign-in is awaiting its connection settings. Please contact ICSH.</p> : <OrganiserSignIn/>}
      </div>
      <aside className="organiser-aside"><div className="eyebrow">Your community workspace</div><h3>Private form entries.</h3><p>The organiser password is for authorised ICSH organisers only.</p><p>Zoho Bigin remains the authority for active membership. Website form records will be held in Supabase.</p><Link className="text-link" href="/events">Return to Events &amp; Services ↗</Link></aside>
    </div></section>
  </>;
}
