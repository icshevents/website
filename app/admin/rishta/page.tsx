import Link from 'next/link';
import {redirect} from 'next/navigation';
import {organiserSession} from '@/lib/supabase/server';
import {PageHero} from '@/components/Shared';
import EntryTable from '@/components/organiser/EntryTable';
import {entryPages,entryDate,entryValues} from '@/lib/organiser-entries';
import {fields} from '@/lib/rishta/model';
export const dynamic='force-dynamic';
export const metadata={title:'Private Rishta profiles',robots:{index:false,follow:false}};
export default async function RishtaProfiles(){
 const access=await organiserSession();if(access.status==='signed-out')redirect('/admin/sign-in');
 if(access.status!=='organiser')return <div className="wrap section"><h1>Organiser access required</h1><p>No profiles have been displayed.</p></div>;
 let rows:{id:string;created_at:string;answers:Record<string,unknown>;is_test:boolean}[]=[];let unavailable=false;
 try{rows=await entryPages((from,to)=>access.supabase.from('icsh_rishta_profiles').select('id,created_at,answers,is_test').order('created_at',{ascending:false}).order('id').range(from,to));}catch{unavailable=true;}
 return <><PageHero label="ICSH · Private organiser workspace" title="Rishta profiles" description="Confidential profiles for service review. Do not copy or share details outside the service terms."/><section className="section white"><div className="wrap"><Link className="text-link" href="/admin/membership">← Admin Hub</Link>{unavailable?<p role="alert">Profiles are temporarily unavailable. Please try again shortly.</p>:<EntryTable management={{kind:'rishta'}} title="Rishta form entries" filename="icsh-rishta-entries.csv" columns={['Name','Email','Mobile','Received (UK)','Status']} entries={rows.map(p=>{const a=p.answers,name=[a.Name_first,a.Name_last].filter(Boolean).join(' '),date=entryDate(p.created_at),status=p.is_test?'Fictional test profile':'Awaiting service review';return {id:p.id,cells:[name,String(a.SingleLine4||'—'),String(a.SingleLine5||'—'),date,status],href:'/admin/rishta/'+p.id,values:{Reference:'RIS-'+p.id.replaceAll('-','').toUpperCase(),'Received (UK)':date,Status:status,...entryValues(Object.fromEntries(Object.entries(a).filter(([key])=>key!=='ImageUpload').map(([key,value])=>[fields.find(f=>f.id===key)?.label||key,value])))}};})}/>}</div></section></>;
}
