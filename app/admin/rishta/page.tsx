import Link from 'next/link';
import {redirect} from 'next/navigation';
import {organiserSession} from '@/lib/supabase/server';
import {PageHero} from '@/components/Shared';
import styles from '@/components/services/services.module.css';
export const dynamic='force-dynamic';
export const metadata={title:'Private Rishta profiles',robots:{index:false,follow:false}};
export default async function RishtaProfiles(){
 const access=await organiserSession();if(access.status==='signed-out')redirect('/admin/sign-in');
 if(access.status!=='organiser')return <div className="wrap section"><h1>Organiser access required</h1><p>No profiles have been displayed.</p></div>;
 const result=await access.supabase.from('icsh_rishta_profiles').select('id,created_at,answers,is_test').order('created_at',{ascending:false}).limit(100);
 return <><PageHero label="ICSH · Private organiser workspace" title="Rishta profiles" description="Confidential profiles for service review. Do not copy or share details outside the service terms."/><section className="section white"><div className="wrap"><Link className="text-link" href="/admin">← Organiser workspace</Link><div className={styles.privateList} style={{marginTop:30}}>{result.error?<p role="alert">Profiles are temporarily unavailable. Please try again shortly.</p>:!result.data.length?<p>No profiles have been submitted yet.</p>:result.data.map(p=><article key={p.id} className="panel"><span className={styles.status}>{p.is_test?'Fictional test profile':'Awaiting service review'}</span><h2 style={{fontSize:30,marginTop:16}}>{p.answers.Name_first} {p.answers.Name_last}</h2><p>Received {new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(new Date(p.created_at))} UK time</p><Link className="button outline" href={'/admin/rishta/'+p.id}>Review profile</Link></article>)}</div></div></section></>;
}
