import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHero } from '@/components/Shared';
import { organiserSession } from '@/lib/supabase/server';
import { membershipApplicationsForOrganiser } from '@/lib/membership-applications/server';
import type { MembershipApplication, MembershipBiginSyncStatus } from '@/lib/membership-applications/model';
import SyncApplication from './SyncApplication';
import {membershipPaymentsForOrganiser} from '@/lib/membership-payments/server';
import type {PaymentRow} from '@/lib/membership-payments/core';
import styles from './memberships.module.css';

export const dynamic = 'force-dynamic';
const statuses: Record<MembershipBiginSyncStatus, string> = {
  awaiting_authorisation: 'Saved on website · Bigin authorisation pending',
  ready: 'Ready for organiser review', syncing: 'Bigin check in progress',
  synced: 'Contact verified in Bigin', review_required: 'Manual review required',
  outcome_unknown: 'Bigin result needs verification', failed: 'Bigin check unsuccessful · application saved',
};

export default async function MembershipApplications() {
  const session = await organiserSession();
  if (session.status === 'signed-out') redirect('/admin/sign-in');
  if (session.status !== 'organiser') return <><PageHero label="ICSH · Organisers" title="Membership applications" description="Your organiser access could not be confirmed."/><section className="section white"><div className="wrap"><Link href="/admin" className="button outline">Return to organiser workspace</Link></div></section></>;
  let applications: MembershipApplication[] = [];
  let unavailable = false;
  try { applications = await membershipApplicationsForOrganiser(); } catch { unavailable = true; }
  let payments=new Map<string,PaymentRow>();
  let paymentsUnavailable=false;
  try{payments=await membershipPaymentsForOrganiser(applications.map(a=>a.id));}catch{paymentsUnavailable=true;}
  const writesEnabled = process.env.ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED === 'true';
  return <>
    <PageHero label="ICSH · Organisers" title="Membership applications" description="Review saved applications and their separate Bigin delivery status."/>
    <section className="section white"><div className="wrap">
      <div className="organiser-toolbar"><Link className="text-link" href="/admin">← Organiser workspace</Link><Link className="button outline" href="/membership">Open membership form</Link></div>
      <div className="notice"><strong>New applications send to Bigin automatically.</strong><p>Saving an application does not activate membership or take payment. Renewals and any existing Bigin contact matches require review; their current membership is preserved. New applications automatically send name, email, mobile and an Inactive membership status to Bigin. Full answers and declarations remain in this private application record.</p>{!writesEnabled ? <p><strong>Bigin contact creation is awaiting authorisation.</strong> Applications are saved here and have not been sent to Bigin. <Link href="/admin/connections">Open Zoho connection settings</Link>.</p> : <p>A new application creates an opted-out Contact with Membership Status: Inactive and payment awaiting payment or not required. No existing Contact is updated and no membership dates are assigned.</p>}</div>
      {unavailable ? <div className="notice" role="alert">The membership application store is unavailable. Please retry shortly.</div> : applications.length === 0 ? <div className="panel"><h2>No saved membership applications yet</h2><p>Applications completed in the earlier on-screen form were not sent or saved. New submissions appear here after the website confirms they have been saved.</p></div> : <>
        <p>Showing the most recent {applications.length} saved application{applications.length === 1 ? '' : 's'} (up to 100).</p>
        <div className={styles.list}>{applications.map(application => {
          const payment=payments.get(application.id);
          const paymentLabels:Record<string,string>={pending:'Awaiting Stripe payment',paid:'Stripe payment confirmed · activation pending',failed:'Stripe payment failed',expired:'Stripe checkout expired',refunded:'Stripe payment refunded · review required',partially_refunded:'Partial Stripe refund · review required',disputed:'Stripe payment disputed · review required'};
          const knownContact = Boolean(application.biginRecordId);
          const interrupted = application.biginSyncStatus === 'syncing' && Boolean(application.syncLeaseUntil && Date.parse(application.syncLeaseUntil) <= Date.now());
          const blocked = !writesEnabled || ['synced', 'review_required'].includes(application.biginSyncStatus) || (application.biginSyncStatus === 'syncing' && !interrupted) || (application.biginSyncStatus === 'outcome_unknown' && !knownContact);
          const amount = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(application.feePence / 100);
          return <article className={`panel ${styles.application}`} key={application.id}>
            <div className={styles.heading}><div><span className="eyebrow">{application.reference}</span><h2>{application.answers.firstName} {application.answers.lastName}</h2></div><span className="tag">{application.mode === 'test' ? 'HISTORICAL TEST · ' : 'LIVE · '}{application.answers.kind === 'renewal' ? 'Renewal' : 'New application'}</span></div>
            <p><strong>{interrupted ? 'Bigin check was interrupted · review its result' : statuses[application.biginSyncStatus]}</strong></p>
            <dl className={styles.facts}>
              <div><dt>Received</dt><dd>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' }).format(new Date(application.createdAt))} UK time</dd></div>
              <div><dt>Email</dt><dd>{application.answers.email}</dd></div>
              <div><dt>Mobile</dt><dd>{application.answers.mobile}</dd></div>
              <div><dt>Category and fee</dt><dd>{application.category} · {amount}</dd></div>
              <div><dt>Payment</dt><dd>{application.paymentStatus === 'not_required' ? 'No fee required · activation pending' : payment?paymentLabels[payment.status]||'Payment needs review':paymentsUnavailable?'Payment status unavailable · check Stripe before activation':'Awaiting payment'}</dd></div>
              {payment?.paid_at?<div><dt>Verified payment time</dt><dd>{new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(new Date(payment.paid_at))} UK time</dd></div>:null}
              <div><dt>Membership dates</dt><dd>Not activated · no start or expiry assigned</dd></div>
              {application.biginRecordId ? <div><dt>Bigin Contact ID</dt><dd>{application.biginRecordId}</dd></div> : null}
            </dl>
            <details><summary>Review application answers</summary><dl className={styles.facts}><div><dt>Date of birth</dt><dd>{application.answers.dob}</dd></div><div><dt>Full-time education</dt><dd>{application.answers.education === 'yes' ? 'Yes' : 'No'}</dd></div><div><dt>Student declaration</dt><dd>{application.answers.studentDeclaration ? 'Confirmed' : 'Not confirmed / not required'}</dd></div><div><dt>Membership terms</dt><dd>{application.answers.terms ? 'Confirmed' : 'Not confirmed'}</dd></div><div><dt>Information accuracy</dt><dd>{application.answers.accuracy ? 'Confirmed' : 'Not confirmed'}</dd></div></dl></details>
            {application.lastErrorCode ? <p className="quiet-note">Review code: {application.lastErrorCode}</p> : null}
            <SyncApplication id={application.id} disabled={blocked} verifyOnly={knownContact} interrupted={interrupted}/>
          </article>;
        })}</div>
      </>}
    </div></section>
  </>;
}

