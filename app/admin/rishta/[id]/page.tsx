import Link from 'next/link';
import {redirect,notFound} from 'next/navigation';
import {organiserSession} from '@/lib/supabase/server';
import {fields,steps,type Answers} from '@/lib/rishta/model';
import styles from '@/components/services/services.module.css';
export const dynamic='force-dynamic';
export const metadata={title:'Private Rishta profile',robots:{index:false,follow:false}};
export default async function Profile({params}:{params:Promise<{id:string}>}){
 const access=await organiserSession();if(access.status==='signed-out')redirect('/admin/sign-in');if(access.status!=='organiser')return <div className="wrap section"><h1>Organiser access required</h1></div>;
 const {id}=await params;if(!/^[a-f0-9-]{36}$/.test(id))notFound();
 const result=await access.supabase.from('icsh_rishta_profiles').select('*').eq('id',id).maybeSingle();
 if(result.error)return <div className="wrap section"><h1>Profile unavailable</h1><p>Please try again shortly.</p></div>;if(!result.data)notFound();
 const profile=result.data,answers=profile.answers as Answers;
 return <section className="section"><div className="wrap reading"><Link className="text-link" href="/admin/rishta">← Rishta profiles</Link><h1 style={{fontSize:46,marginTop:28}}>{answers.Name_first} {answers.Name_last}</h1><p>Confidential · {profile.is_test?'Fictional test profile':'Awaiting service review'}</p><p className={styles.reference}>RIS-{id.replaceAll('-','').toUpperCase()}</p>{profile.photo_path&&<img className={styles.photo} src={'/api/rishta/photo/'+id} alt="Applicant's submitted profile photograph"/>}{steps.slice(0,5).map(s=><section className={styles.review} key={s.title}><h2 style={{fontSize:30}}>{s.title}</h2><dl>{s.ids.filter(id=>id in answers&&id!=='ImageUpload').map(id=>{const f=fields.find(f=>f.id===id)!;const v=answers[id];return <div key={id}><dt>{f.label}</dt><dd>{typeof v==='boolean'?(v?'Confirmed':'No'):Array.isArray(v)?v.join(', ')||'Not provided':v||'Not provided'}{answers[id+'_other']?' — '+answers[id+'_other']:''}</dd></div>;})}</dl></section>)}<p className={styles.help}>Terms accepted: {profile.terms_version}. Received {new Date(profile.created_at).toLocaleString('en-GB',{timeZone:'Europe/London'})} UK time.</p></div></section>;
}
