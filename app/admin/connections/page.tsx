import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHero } from '@/components/Shared';
import { organiserSession } from '@/lib/supabase/server';
import { getZohoConfiguration } from '@/lib/zoho/server';
import ConnectionCheck from './ConnectionCheck';
import styles from './connections.module.css';

export const metadata = { title: 'Zoho connections' };

export default async function ConnectionsPage() {
  const session = await organiserSession();
  if (session.status === 'signed-out') redirect('/admin/sign-in');
  if (session.status !== 'organiser') return <>
    <PageHero label="ICSH · Organisers" title="Connection settings unavailable" description="An approved organiser account is required to view these settings."/>
    <section className="section white"><div className="wrap"><Link className="button outline" href="/admin/sign-in">Return to sign in</Link></div></section>
  </>;

  return <>
    <PageHero label="ICSH · Organisers" title="Zoho connections" description="Connect membership records and email preferences to your ICSH website."/>
    <section className="section white"><div className="wrap">
      <Link className="text-link" href="/admin">← Organiser workspace</Link>
      <div className={`notice ${styles.introduction}`}><strong>Connection checks · read access only</strong><p>These checks read organisation settings and field definitions. Member records, subscriptions and email delivery are not changed. Public forms accept live submissions. New membership applications use a separate delivery step to create Inactive Bigin contacts.</p></div>
      <div className={styles.grid}>
        <ConnectionCheck service="bigin" configuration={getZohoConfiguration('bigin')}/>
        <ConnectionCheck service="campaigns" configuration={getZohoConfiguration('campaigns')}/>
      </div>
      <section className={`panel ${styles.guide}`} aria-labelledby="setup-heading">
        <span className="eyebrow">Setup guide</span>
        <h2 id="setup-heading">Authorise your Zoho accounts</h2>
        <ol>
          <li><strong>Confirm the account region.</strong> Use the region shown in each Zoho account. Bigin and Campaigns must each use their matching authorisation and API domains.</li>
          <li><strong>Create the website credentials.</strong> Use Zoho’s API Console and the account’s supported OAuth setup. For Bigin, select Self Client and the correct ICSH organisation.</li>
          <li><strong>Save the settings in Vercel.</strong> Store the client ID, client secret and refresh token as server-side secrets, alongside the account and API domains. Apply them to the deployment you are testing, then redeploy.</li>
          <li><strong>Check each connection above.</strong> Use the returned field names, lists and topics to finish the membership and email mappings before enabling form synchronisation.</li>
        </ol>
        <details className={styles.scope}><summary>Read permissions for these connection checks</summary>
          <p><strong>Bigin:</strong> <code>ZohoBigin.org.READ,ZohoBigin.settings.fields.READ</code></p>
          <p><strong>Campaigns:</strong> <code>ZohoCampaigns.contact.READ</code></p>
          <p>Membership contact searches and signup writes need additional permissions after field mapping and identity verification are ready.</p>
        </details>
        <p className={styles.note}>A Campaigns subscription can send a confirmation email. Choose a dedicated test address and review the list’s automations before the first subscription or workflow test.</p>
      </section>
    </div></section>
  </>;
}
