'use client';

import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {ageFromDob,cleanAnswers,fields,steps,visible,type Answers,type RishtaField} from '@/lib/rishta/model';
import terms from '@/lib/rishta/terms.json';
import styles from './services.module.css';

const text=(value:unknown)=>typeof value==='string'?value:'';
export default function RishtaForm(){
 const [answers,setAnswers]=useState<Answers>({}),[step,setStep]=useState(0),[errors,setErrors]=useState<Record<string,string>>({});
 const [photo,setPhoto]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reference,setReference]=useState('');
 const [csrf,setCsrf]=useState('');const requestKey=useRef(''),form=useRef<HTMLFormElement>(null),heading=useRef<HTMLHeadingElement>(null);
 const age=ageFromDob(text(answers.Date));
 useEffect(()=>{requestKey.current=crypto.randomUUID();let active=true;fetch('/api/rishta/applications',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(active)setCsrf(d.csrf);}).catch(()=>{if(active)setError('The registration service is temporarily unavailable. Your answers have not been sent. Please try again shortly.');});return()=>{active=false;};},[]);
 function update(id:string,value:string|boolean|string[]){setAnswers(old=>{const next={...old,[id]:value};for(const f of fields)if(!visible(f,next)){delete next[f.id];delete next[f.id+'_other'];}return next;});setErrors(old=>({...old,[id]:''}));}
 function changeStep(next:number){setStep(next);setError('');requestAnimationFrame(()=>{heading.current?.focus({preventScroll:true});form.current?.scrollIntoView({behavior:'smooth',block:'start'});});}
 function validateStep(){const checked=cleanAnswers(answers);const ids=steps[step].ids;const current=Object.fromEntries(Object.entries(checked.errors).filter(([id])=>ids.some(i=>id===i||id===i+'_other')));setErrors(current);return Object.keys(current).length===0;}
 async function submit(){
  const checked=cleanAnswers({...answers,TermsConditions:true});if(Object.keys(checked.errors).length){setErrors(checked.errors);changeStep(Math.max(0,steps.findIndex(s=>s.ids.some(id=>checked.errors[id]))));return;}
  setBusy(true);setError('');
  try{
   let image=null;
   if(photo){const bytes=new Uint8Array(await photo.arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=16384)raw+=String.fromCharCode(...bytes.subarray(i,i+16384));image={type:photo.type,data:btoa(raw)};}
   const response=await fetch('/api/rishta/applications',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({requestKey:requestKey.current,answers:checked.answers,photo:image,website:text(answers.website)})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to save your profile. Please try again.');
   setReference(result.reference);setAnswers({});setPhoto(null);requestAnimationFrame(()=>heading.current?.focus());
  }catch(e){setError(e instanceof Error?e.message:'Unable to submit. Please try again.');}finally{setBusy(false);}
 }
 function field(f:RishtaField){
  if(!visible(f,answers))return null;
  const id='rishta-'+f.id,value=answers[f.id],problem=errors[f.id];
  const help=f.id==='Number'?'Calculated from your full date of birth.':f.id==='Date'?'Enter day, month and year (DD/MM/YYYY).':f.hints.join(' ');
  const attributes={id,'aria-required':f.required,'aria-invalid':Boolean(problem),'aria-describedby':`${id}-help ${id}-error`};
  const label=<>{f.label}{f.required?<span aria-hidden="true"> *</span>:<span className={styles.optional}>Optional</span>}</>;
  const messages=(copy=help)=><div className={styles.fieldMessages}><span className={styles.help} id={id+'-help'}>{copy}</span><span className={styles.error} id={id+'-error'}>{problem}</span></div>;
  if(f.id==='DecisionBox')return <div key={f.id} className={`${styles.choiceField} ${styles.wide}`}><label className={styles.check}><input {...attributes} type="checkbox" checked={value===true} onChange={e=>update(f.id,e.target.checked)}/><span>{f.label}</span></label>{messages()}</div>;
  if(f.id==='Checkbox'||f.type==='13')return <div key={f.id} className={`${styles.choiceField} ${styles.wide}`}>
   <fieldset className={styles.choices} aria-describedby={`${id}-help ${id}-error`} aria-required={f.required}><legend className={styles.legend}>{label}</legend>
    {f.options.map((option,i)=><label className={styles.check} key={option}><input id={id+'-'+i} type={f.id==='Checkbox'?'checkbox':'radio'} name={f.id} value={option} checked={f.id==='Checkbox'?Array.isArray(value)&&value.includes(option):value===option} onChange={e=>update(f.id,f.id==='Checkbox'?(e.target.checked?[...(Array.isArray(value)?value:[]),option]:(Array.isArray(value)?value:[]).filter(v=>v!==option)):option)}/><span>{option}</span></label>)}
   </fieldset>{messages()}
  </div>;
  let control;
  if(f.id==='Number')control=<input {...attributes} value={age===null?'':String(age)} readOnly aria-label="Age, calculated from date of birth"/>;
  else if(f.id==='ImageUpload')control=<>
   <input {...attributes} key={photo?.name||'no-photo'} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0]??null;if(file&&(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>3*1024*1024)){setErrors(old=>({...old,ImageUpload:'Choose a JPG, PNG or WebP photograph no larger than 3 MB.'}));e.target.value='';setPhoto(null);}else{setPhoto(file);setErrors(old=>({...old,ImageUpload:''}));}}}/>
   {photo&&<div className={styles.photoSelection}><span>{photo.name} · {(photo.size/1024/1024).toFixed(1)} MB</span><button type="button" className={styles.termsLink} onClick={()=>setPhoto(null)}>Remove</button></div>}
  </>;
  else if(f.options.length)control=<>
   <select {...attributes} value={text(value)} onChange={e=>update(f.id,e.target.value)}><option value="">Choose an option</option>{f.options.map(option=><option key={option} value={option}>{option==='Afgani'?'Afghan':option==='Benjali'?'Bengali':option}</option>)}</select>
   {f.other&&value==='Other'&&<div className={styles.otherAnswer}><label htmlFor={id+'-other'}>Please specify</label><input id={id+'-other'} value={text(answers[f.id+'_other'])} maxLength={150} onChange={e=>update(f.id+'_other',e.target.value)} aria-describedby={id+'-other-error'} aria-invalid={Boolean(errors[f.id+'_other'])}/><span id={id+'-other-error'} className={styles.error}>{errors[f.id+'_other']}</span></div>}
  </>;
  else if(f.type==='2')control=<textarea {...attributes} rows={5} maxLength={65535} value={text(value)} onChange={e=>update(f.id,e.target.value)}/>;
  else control=<input {...attributes} type={f.id==='SingleLine4'?'email':f.id==='SingleLine5'?'tel':'text'} maxLength={f.id==='Date'?10:255} inputMode={f.id==='Date'?'numeric':undefined} placeholder={f.id==='Date'?'DD/MM/YYYY':undefined} autoComplete={f.id==='Name_first'?'given-name':f.id==='Name_last'?'family-name':f.id==='SingleLine4'?'email':f.id==='SingleLine5'?'tel':f.id==='Date'?'bday':f.id==='SingleLine3'?'street-address':'off'} value={text(value)} onChange={e=>update(f.id,e.target.value)}/>;
  const fullWidth=f.type==='2'||f.type==='32'||['SingleLine3','Dropdown8','Dropdown6','Dropdown7','Dropdown16'].includes(f.id)||f.label.length>42;
  return <div className={`${styles.field} ${fullWidth?styles.wide:''}`} key={f.id}>
   <label htmlFor={id}>{label}</label><div className={styles.control}>{control}</div>{messages()}
  </div>;
 }
 if(reference)return <div className={styles.success} role="status"><h2 ref={heading} tabIndex={-1}>Your profile has been received.</h2><p>Your profile is saved privately. ICSH will review it before considering introductions.</p><p className={styles.reference}>Reference: {reference}</p><p>Keep this reference. For updates or to withdraw your profile, contact <a href="mailto:events@icsh.org.uk">events@icsh.org.uk</a>.</p><Link className="button outline" href="/events">Return to Events & Services</Link></div>;
 return <form ref={form} className={styles.form} onSubmit={e=>{e.preventDefault();if(busy)return;if(step===5)void submit();else if(validateStep()&&(step!==0||!errors.ImageUpload))changeStep(step+1);}} noValidate>
  <ol className={styles.steps} aria-label="Profile progress">{steps.map((s,i)=><li key={s.title} aria-current={i===step?'step':undefined}><span className={styles.stepNumber}>{String(i+1).padStart(2,'0')}</span><span className={styles.stepName}>{s.title}</span></li>)}</ol>
  <section className={styles.panel}><h2 ref={heading} tabIndex={-1}>{steps[step].title}</h2><p className={styles.help}>{step===5?'Check your answers. Use Edit to make changes.':'Fields marked * are required; other questions are optional.'}</p>
   {error&&<p className={styles.errorBox} role="alert">{error}</p>}
   {Object.values(errors).some(Boolean)&&<p className={styles.errorBox} role="alert">Please check the highlighted fields.</p>}
   {step<5?<div className={styles.fields}>{steps[step].ids.map(id=>field(fields.find(f=>f.id===id)!))}</div>:steps.slice(0,5).map((s,i)=><div className={styles.review} key={s.title}><h3>{s.title}</h3><dl>{s.ids.map(id=>{const f=fields.find(x=>x.id===id)!;if(!visible(f,answers))return null;const value=id==='Number'?age:id==='ImageUpload'?(photo?.name||'Not provided'):answers[id];return <div key={id}><dt>{f.label}</dt><dd>{id==='TermsConditions'?(value?'Accepted':'Not accepted'):typeof value==='boolean'?(value?'Yes':'No'):Array.isArray(value)?(value.join(', ')||'Not provided'):String(value||'Not provided')}{answers[id+'_other']?' — '+answers[id+'_other']:''}</dd></div>;})}</dl><button type="button" onClick={()=>changeStep(i)}>Edit this section</button></div>)}
   <div className={styles.honeypot} aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={text(answers.website)} onChange={e=>update('website',e.target.value)}/></label></div>
   {step===5&&<div className={styles.submissionNotice}>
    <details className={styles.terms}><summary>Read the Rishta service terms & conditions</summary><div className={styles.termsCopy} tabIndex={0}>{terms.map((p,i)=><p key={i}>{p}</p>)}</div></details>
    <label className={styles.check}><input id="rishta-SensitiveConsent" type="checkbox" checked={answers.SensitiveConsent===true} onChange={e=>update('SensitiveConsent',e.target.checked)} aria-required="true" aria-invalid={Boolean(errors.SensitiveConsent)} aria-describedby="rishta-sensitive-help rishta-sensitive-error"/><span>I explicitly consent to ICSH using the sensitive profile details I choose to provide, including religion, ethnic background and health information, for introductions and sharing relevant details with suitable potential matches, their families where appropriate, and authorised ICSH volunteers. *</span></label>
    <p className={styles.help} id="rishta-sensitive-help">You can withdraw this consent by contacting <a href="mailto:events@icsh.org.uk">events@icsh.org.uk</a>.</p>
    {errors.SensitiveConsent&&<p className={styles.error} id="rishta-sensitive-error">{errors.SensitiveConsent}</p>}
    <p className={styles.help}>By selecting Submit profile, you agree to the service terms above, acknowledge our <Link href="/privacy#rishta-service" target="_blank" rel="noopener noreferrer" aria-label="Privacy policy (opens in a new tab)">privacy policy</Link>, and confirm that your information is true, accurate and complete to the best of your knowledge.</p>
   </div>}
   <div className={styles.actions}>{step>0?<button type="button" className="button outline" disabled={busy} onClick={()=>changeStep(step-1)}>Back</button>:<Link className="text-link" href="/events">← Events & Services</Link>}<button type="submit" className="button" disabled={busy||(step===5&&!csrf)}>{busy?'Sending your profile…':step===5?'Submit profile':'Continue →'}</button></div>
  </section>
 </form>;
}
