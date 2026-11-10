import Link from 'next/link';
import {redirect} from 'next/navigation';
import {organiserSession} from '@/lib/supabase/server';
import {createEventService} from '@/lib/event-forms/service.js';
import {PageHero} from '@/components/Shared';
export const dynamic='force-dynamic';
export default async function Payments(){
 const access=await organiserSession();if(access.status==='signed-out')redirect('/admin/sign-in');if(access.status!=='organiser')return <p>Approved ICSH access is required.</p>;
 const result=await createEventService().from('icsh_form_payments').select('source_kind,reference,description,amount,status,paid_at,payment_intent_id,created_at').order('created_at',{ascending:false}).limit(100);
 return <><PageHero label="ICSH workspace" title="Website payments" description="Donation and ticket payments confirmed through Stripe."/><section className="section white"><div className="wrap"><p><Link href="/admin">← Workspace</Link> · <Link href="/admin/memberships">Membership payments and applications</Link></p><p>Refunds and other payment management remain in Stripe. Pending records are unpaid.</p>{result.error?<p role="alert">Payment records are unavailable. Check Stripe before confirming payment.</p>:result.data.length===0?<p>No donation or ticket payment records yet.</p>:result.data.map(p=><article className="panel" key={p.reference} style={{marginBottom:18}}><span className="tag">{p.source_kind}</span><h2>{p.reference}</h2><p>{p.description}</p><p>{new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(p.amount/100)} · {p.status.replaceAll('_',' ')}</p>{p.paid_at&&<p>Verified payment: {new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(new Date(p.paid_at))} UK time</p>}{/^pi_[A-Za-z0-9]+$/.test(p.payment_intent_id||'')&&<a href={'https://dashboard.stripe.com/payments/'+p.payment_intent_id} target="_blank" rel="noopener noreferrer">Open payment in Stripe ↗</a>}</article>)}</div></section></>;
}
