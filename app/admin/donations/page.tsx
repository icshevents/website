import Link from 'next/link';
import {redirect} from 'next/navigation';
import {organiserSession} from '@/lib/supabase/server';
import {createEventService} from '@/lib/event-forms/service.js';
import {PageHero} from '@/components/Shared';
import EntryTable from '@/components/organiser/EntryTable';
import {entryPages,entryDate} from '@/lib/organiser-entries';
export const dynamic='force-dynamic';
export default async function DonationEntries(){const access=await organiserSession();if(access.status==='signed-out')redirect('/admin/sign-in');if(access.status!=='organiser')return <p>Admin Hub access is required.</p>;
 const db=createEventService();let rows:{id:string;first_name:string|null;last_name:string|null;email:string|null;amount:number;mode:string;created_at:string}[]=[];let paymentRows:{source_id:string;status:string;paid_at:string|null;refunded_amount:number}[]=[];let unavailable=false;
 try{rows=await entryPages((from,to)=>db.from('icsh_donations').select('id,first_name,last_name,email,amount,mode,created_at').order('created_at',{ascending:false}).order('id').range(from,to));for(let i=0;i<rows.length;i+=100){const ids=rows.slice(i,i+100).map(d=>d.id);paymentRows.push(...await entryPages((from,to)=>db.from('icsh_form_payments').select('source_id,status,paid_at,refunded_amount').eq('source_kind','donation').in('source_id',ids).order('created_at',{ascending:false}).order('source_id').range(from,to)));}}catch{unavailable=true;}
 return <><PageHero label="ICSH · Admin Hub" title="Donation entries" description="Submitted donation details and their recorded payment status."/><section className="section white"><div className="wrap"><Link className="text-link" href="/admin/membership">← Admin Hub</Link>{unavailable?<p role="alert">Donation entries are temporarily unavailable.</p>:<EntryTable title="Donation form entries" filename="icsh-donation-entries.csv" columns={['Name','Email','Amount','Payment status','Received (UK)']} entries={rows.map(d=>{const p=paymentRows.find(p=>p.source_id===d.id),name=[d.first_name,d.last_name].filter(Boolean).join(' ')||'Name not provided',date=entryDate(d.created_at),status=d.mode==='test'?'Test entry':p?.status.replaceAll('_',' ')||'Awaiting payment',amount=new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(d.amount/100);return {id:d.id,cells:[name,d.email||'—',amount,status,date],values:{Reference:d.id,Name:name,Email:d.email||'',Amount:amount,'Payment status':status,'Received (UK)':date,'Paid (UK)':p?.paid_at?entryDate(p.paid_at):''}};})}/>}</div></section></>;
}
