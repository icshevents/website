'use client';
import Link from 'next/link';
import {useRef,useState} from 'react';
import {ageOn,quoteMembership,dateLabel,priceLabel,STUDENT_DECLARATION,type MembershipQuote} from '@/lib/membership';
import {validateApplicant,type Applicant,type FieldErrors,type PreviewOutcome,type Simulation} from '@/lib/membership-preview';
const blank:Applicant={firstName:'',lastName:'',dob:'',email:'',mobile:'',kind:'new',education:false,declaration:false};
export default function MembershipForm({today,renewal=false}:{today:string;renewal?:boolean}) {
 const [values,setValues]=useState<Applicant>({...blank,kind:renewal?'renewal':'new'});
 const [errors,setErrors]=useState<FieldErrors>({});const [step,setStep]=useState(1);const [busy,setBusy]=useState(false);const [outcome,setOutcome]=useState<PreviewOutcome|null>(null);const errorSummary=useRef<HTMLDivElement>(null);const reviewTitle=useRef<HTMLHeadingElement>(null);
 let quote:MembershipQuote|null=null;let age:number|null=null;
 try {age=ageOn(values.dob,today);quote=quoteMembership(values.dob,values.education,today)}catch{}
 function change<K extends keyof Applicant>(key:K,value:Applicant[K]) {
  setValues(current=>({...current,[key]:value,...(key==='dob'||key==='education'?{declaration:false}:{})}));
  setErrors({});setOutcome(null);
 }
 function sample(kind:'standard'|'student'|'pensioner'|'renewal'|'early'|'duplicate') {
  const years=kind==='student'?18:kind==='pensioner'?70:40;
  const [year,month,day]=today.split('-');const dob=`${Number(year)-years}-${month}-${month==='02'&&day==='29'?'28':day}`;
  setValues({firstName:'Alex',lastName:'Taylor',dob,email:kind==='early'?'early@example.test':kind==='renewal'?'renewal@example.test':kind==='duplicate'?'duplicate@example.test':'alex@example.test',mobile:'+44 7700 900123',kind:kind==='renewal'||kind==='early'?'renewal':'new',education:kind==='student',declaration:false});setErrors({});setStep(1);setOutcome(null);
 }
 function showErrors(next:FieldErrors){setErrors(next);requestAnimationFrame(()=>errorSummary.current?.focus());}
 async function preview(simulation:Simulation) {
  setBusy(true);setOutcome(null);setErrors({});
  try {
   const response=await fetch('/api/membership/preview',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({...values,simulation})});
   const data=await response.json();if(!response.ok){showErrors(data.errors||{form:data.error||'Please try again.'});return}
   setOutcome(data.outcome);setStep(3);requestAnimationFrame(()=>reviewTitle.current?.focus());
  }catch{showErrors({form:'The preview could not connect. Your details have not been saved. Please try again.'})}finally{setBusy(false)}
 }
 function proceed(event:React.FormEvent<HTMLFormElement>){event.preventDefault();const check=validateApplicant(values,today);if(Object.keys(check.errors).length){showErrors(check.errors);return}setErrors({});setStep(2);requestAnimationFrame(()=>reviewTitle.current?.focus());}
 const shownQuote=outcome?.quote||quote;
 const error=(key:keyof Applicant)=>errors[key]?<span className="field-error" id={`${key}-error`}>{errors[key]}</span>:null;
 function field(key:'firstName'|'lastName'|'email'|'mobile',label:string,type='text',autoComplete='off') {return <div className="form-field"><label htmlFor={key}>{label} <span aria-hidden="true">*</span></label><input id={key} name={key} type={type} autoComplete={autoComplete} required maxLength={key==='email'?254:80} value={values[key]} onChange={e=>change(key,e.target.value)} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key]?`${key}-error`:undefined}/>{error(key)}</div>}
 return <div className="registration-area">
  <div className="preview-form-notice"><span className="tag">Preview only</span><strong>Try the proposed membership experience.</strong><p>Use sample details. No real membership, CRM record or payment will be created. Details are processed to validate this preview and are not saved by the application.</p><details><summary>Try a sample applicant</summary><div className="sample-buttons">{(['standard','pensioner','student','renewal','early','duplicate'] as const).map(kind=><button type="button" key={kind} onClick={()=>sample(kind)}>{kind==='early'?'Early renewal':kind==='renewal'?'Expired renewal':kind==='duplicate'?'Duplicate record':kind.charAt(0).toUpperCase()+kind.slice(1)}</button>)}</div></details></div>
  <ol className="registration-progress" aria-label="Registration progress">{['Your details','Review & preview','Result'].map((label,index)=><li key={label} aria-current={step===index+1?'step':undefined} className={step>=index+1?'reached':''}><span>{index+1}</span>{label}</li>)}</ol>
  {Object.keys(errors).length>0&&<div className="validation-summary" tabIndex={-1} ref={errorSummary} role="alert"><strong>Please check the following</strong><ul>{Object.entries(errors).map(([key,message])=><li key={key}>{key==='form'?message:<a href={`#${key==='declaration'?'declaration':key}`}>{message}</a>}</li>)}</ul></div>}
  <div className="registration-grid">
   <div className="panel registration-panel">
    {step===1?<form onSubmit={proceed} noValidate>
      <h3>Your details</h3><p className="form-intro">Fields marked * are required. Please use sample information in this preview.</p>
      <fieldset className="registration-choice"><legend>I’d like to *</legend><label><input type="radio" name="kind" value="new" checked={values.kind==='new'} onChange={()=>change('kind','new')}/> Join ICSH</label><label><input type="radio" name="kind" value="renewal" checked={values.kind==='renewal'} onChange={()=>change('kind','renewal')}/> Renew membership</label></fieldset>
      {values.kind==='renewal'&&<p className="notice">Use the email from your existing membership. Early renewals will be reviewed so the remaining membership period is protected.</p>}
      <div className="form-row">{field('firstName','First name','text','given-name')}{field('lastName','Last name','text','family-name')}</div>
      <div className="form-field"><label htmlFor="dob">Date of birth <span aria-hidden="true">*</span></label><input id="dob" name="dob" type="date" required min="1900-01-01" max={today} autoComplete="off" value={values.dob} onChange={e=>change('dob',e.target.value)} aria-invalid={Boolean(errors.dob)} aria-describedby={`dob-hint${errors.dob?' dob-error':''}`}/><span className="field-hint" id="dob-hint">Choose your date or type day, month and year. We use the full date to calculate your age and rate.{age!==null?` Age on ${dateLabel(today)}: ${age}.`:''}</span>{error('dob')}</div>
      {age!==null&&age<21&&<fieldset className="registration-choice education-choice"><legend>Are you currently in full-time education? *</legend><label><input type="radio" name="education" checked={values.education} onChange={()=>change('education',true)}/> Yes</label><label><input type="radio" name="education" checked={!values.education} onChange={()=>change('education',false)}/> No</label><p className="field-hint">Free membership requires both age under 21 and full-time education. Otherwise, the standard £20 rate applies.</p></fieldset>}
      {quote?.declarationRequired&&<div className="student-declaration"><h4>Full-Time Education Declaration</h4><label><input id="declaration" name="declaration" type="checkbox" required checked={values.declaration} onChange={e=>change('declaration',e.target.checked)} aria-invalid={Boolean(errors.declaration)} aria-describedby={errors.declaration?'declaration-error':undefined}/><span>{STUDENT_DECLARATION}</span></label>{error('declaration')}<p className="field-hint">No proof upload is required at this stage.</p></div>}
      {quote?.minor&&<p className="notice">Under-18 registration is not enabled. ICSH must approve the parent or guardian process before registration for minors can launch.</p>}
      {field('email','Email address','email','email')}{field('mobile','Mobile number','tel','tel')}
      <p className="form-privacy">Your sample date of birth is used to check eligibility; your email is used for a temporary sample-record check. No details are saved to Zoho or a member database. No marketing signup is included. <Link href="/privacy#membership-preview">Read the membership privacy information</Link>.</p>
      <button type="submit" className="button registration-next">Review my membership <span aria-hidden="true">→</span></button>
     </form>:step===2?<div>
      <h3 ref={reviewTitle} tabIndex={-1}>Check your membership</h3><p>Review the proposed rate and your sample details before trying the next step.</p>
      <dl className="review-details"><div><dt>Name</dt><dd>{values.firstName} {values.lastName}</dd></div><div><dt>Email</dt><dd>{values.email}</dd></div><div><dt>Mobile</dt><dd>{values.mobile}</dd></div><div><dt>Application</dt><dd>{values.kind==='renewal'?'Renewal':'New membership'}</dd></div>{quote?.declarationRequired&&<div><dt>Student declaration</dt><dd>Confirmed · timestamp calculated by the server when previewed</dd></div>}</dl>
      <button type="button" className="text-button" onClick={()=>{setStep(1);setErrors({})}}>← Edit my details</button>
      {quote?.minor?<div className="notice">Registration for under-18s needs ICSH’s approved safeguarding and parent or guardian process. You can explore pricing, but cannot complete registration.</div>:<div className="simulation-panel"><span className="tag">Test mode</span><h4>{quote?.fee===0?'No payment step':'Preview the payment step'}</h4><p>{quote?.fee===0?'Eligible free membership skips payment. The declaration is checked again on the server.':'A real membership would activate only after confirmation from the payment provider. These buttons simulate outcomes; no card details are requested.'}</p><div className="simulation-actions"><button className="button" type="button" disabled={busy} onClick={()=>preview('success')}>{busy?'Checking…':quote?.fee===0?'Preview free registration':'Try successful payment'}</button>{quote?.fee!==0&&<><button className="button outline" type="button" disabled={busy} onClick={()=>preview('failure')}>Try failed payment</button><button className="text-button" type="button" disabled={busy} onClick={()=>preview('not_started')}>Try payment pending</button></>}</div></div>}
     </div>:outcome&&<div className="registration-result">
      <div className={`result-icon ${outcome.status==='complete'?'complete':''}`} aria-hidden="true">{outcome.status==='complete'?'✓':'i'}</div><span className="tag">Preview result</span><h3 ref={reviewTitle} tabIndex={-1}>{outcome.status==='complete'?'Your preview is complete':outcome.status==='payment_failed'?'Payment failure handled':outcome.status==='payment_pending'?'Waiting for payment':'Committee review needed'}</h3><p>{outcome.message}</p>{outcome.existingExpiry&&<p className="notice">Existing sample expiry: <strong>{dateLabel(outcome.existingExpiry)}</strong> This date has not been changed.</p>}
      <div className="preview-outcome"><strong>No real registration or payment took place.</strong><p>{outcome.crmAction==='none'?'No sample CRM record was changed.':`In the temporary test, the sample record was ${outcome.crmAction==='update'?'updated':'created'}.`} Zoho Bigin is not connected to this preview. The test data is discarded after this request.</p></div>
      {outcome.declarationAt&&<p className="quiet-note">Sample declaration confirmed at {new Date(outcome.declarationAt).toLocaleString('en-GB',{timeZone:'Europe/London',dateStyle:'long',timeStyle:'short'})} (UK time).</p>}
      <button type="button" className="button" onClick={()=>{setStep(1);setOutcome(null)}}>Try another preview <span aria-hidden="true">↗</span></button>
     </div>}
   </div>
   <aside className="membership-live-summary" aria-label="Your membership summary"><span className="tag">Proposed rate</span><h3>Your membership</h3><div className="live-summary-price" aria-live="polite">{shownQuote?priceLabel(shownQuote.fee):'—'}<small>{shownQuote?.fee===0?'for 12 months':shownQuote?'GBP / year':'Enter your date of birth'}</small></div><dl><div><dt>Membership type</dt><dd>{shownQuote?.label||'Calculated from your details'}</dd></div><div><dt>Duration</dt><dd>12 months</dd></div><div><dt>Start date</dt><dd>{values.kind==='renewal'?'Confirmed after record review':shownQuote?dateLabel(shownQuote.startDate):'Date of joining'}</dd></div><div><dt>Expiry date</dt><dd>{values.kind==='renewal'?'Confirmed after record review':shownQuote?dateLabel(shownQuote.expiryDate):'12 months after joining'}</dd></div>{shownQuote?.declarationRequired&&<div><dt>Student declaration</dt><dd>{values.declaration?'Confirmed for this preview':'Confirmation required'}</dd></div>}</dl><p>{values.kind==='renewal'?'Early renewals need committee approval of the date calculation. Your remaining membership will be protected.':'The server recalculates your age, eligibility, fee and dates when you preview registration.'}</p><p className="quiet-note">Some events have separate charges and eligibility requirements. All rates shown here await ICSH approval.</p></aside>
  </div>
 </div>
}
