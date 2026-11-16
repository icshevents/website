import Link from 'next/link';
import {redirect} from 'next/navigation';
import {organiserSession} from '@/lib/supabase/server';
import {createEventService} from '@/lib/event-forms/service.js';
import {PageHero} from '@/components/Shared';
export const dynamic='force-dynamic';
export default async function DonationEntries(){const access=await organiserSession();if(access.status==='signed-out')redirect('/admin/sign-in');if(access.status!=='organiser')return <p>Admin Hub access is required.</p>;
 const db=createEventService();const [donations,payments]=await Promise.all([db.from('icsh_donations').select('id,first_name,last_name,email,amount,mode,created_at').order('created_at',{ascending:false}).limit(200),db.from('icsh_form_payments').select('source_id,status,paid_at,refunded_amount').eq('source_kind','donation').order('created_at',{ascending:false}).limit(1000)]);
 return <><PageHero label="ICSH · Admin Hub" title="Donation entries" description="Submitted donation details and their recorded payment status."/><section className="section white"><div className="wrap"><Link className="text-link" href="/admin/membership">← Admin Hub</Link>{donations.error||payments.error?<p role="alert">Donation entries are temporarily unavailable.</p>:donations.data.length===0?<p>No donation forms have been submitted yet.</p>:donations.data.map(d=>{const p=payments.data.find(p=>p.source_id===d.id);return <article className="panel" key={d.id} style={{marginTop:20}}><span className="tag">{d.mode==='test'?'Test entry':p?.status.replaceAll('_',' ')||'Awaiting payment'}</span><h3 style={{marginTop:16}}>{[d.first_name,d.last_name].filter(Boolean).join(' ')||'Name not provided'}</h3><p>{d.email||'No email provided'}<br/>{new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(d.amount/100)}<br/>{new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(new Date(d.created_at))} UK time</p></article>;})}</div></section></>;
}
