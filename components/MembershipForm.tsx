'use client';
import Link from 'next/link';
import MemberSearch from './MemberSearch';
import MembershipPayment from './MembershipPayment';
import {useEffect,useRef,useState} from 'react';
import {britishToIso,isoToBritish,londonDate,priceLabel,isStudentAge,STUDENT_DECLARATION,ACCURACY_DECLARATION} from '@/lib/membership';
import {membershipEligibilityMessage,type MembershipEligibility} from '@/lib/membership-eligibility';
import {MEMBERSHIP_PRICING} from '@/lib/membership-pricing';
import {EMPTY_ANSWERS,getQuote,validateStep,validateApplication,updateAnswer,errorStep,registrationAgeError,type MembershipAnswers,type FieldErrors} from '@/lib/membership-validation';
const membershipDateLabel=(value:string)=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
function eligibilityResult(value:unknown):MembershipEligibility|null {
 if(!object(value)||typeof value.status!=='string')return null;
 if(value.status==='active'){if(typeof value.membershipDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.membershipDate)||!Number.isFinite(Date.parse(value.membershipDate))||typeof value.membershipExpiry!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.membershipExpiry)||!Number.isFinite(Date.parse(value.membershipExpiry))||!Number.isSafeInteger(value.daysUntilExpiry)||Number(value.daysUntilExpiry)<1)return null;return {status:'active',membershipDate:value.membershipDate,membershipExpiry:value.membershipExpiry,daysUntilExpiry:Number(value.daysUntilExpiry)};}
 return ['allowed','identity_conflict','review_required','renewal_required','new_required'].includes(value.status)?{status:value.status} as MembershipEligibility:null;
}
const steps=['Personal details','Membership information','Review & declaration','Confirmation'];
const screenForError=(key:keyof MembershipAnswers)=>Math.max(1,errorStep(key)-1);
type SavedApplication={id:string;reference:string;createdAt:string;category:'standard'|'pensioner'|'student'|'minor';feePence:number;currency:'GBP';paymentStatus:'awaiting_payment'|'not_required';biginSyncStatus:string;mode:'test'|'live'};
type SubmissionAttempt={requestKey:string;receiptToken:string};
const categoryLabels={standard:'Standard Membership',pensioner:'Pensioner Membership',student:'Student Membership',minor:'Free Membership (16 and below)'};
const syncLabels:Record<string,string>={awaiting_authorisation:'Awaiting Bigin authorisation',ready:'Awaiting organiser review',syncing:'Bigin sync in progress',synced:'Saved in Bigin',review_required:'Organiser review required',outcome_unknown:'Organiser checking Bigin delivery',failed:'Bigin sync needs attention'};
function object(value:unknown):value is Record<string,unknown>{return Boolean(value&&typeof value==='object'&&!Array.isArray(value));}
function savedApplication(value:unknown):SavedApplication|null {
 if(!object(value)||typeof value.id!=='string'||!/^[a-f0-9-]{36}$/i.test(value.id)||typeof value.reference!=='string'||!value.reference||value.reference.length>100||typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt))||typeof value.category!=='string'||!Object.hasOwn(categoryLabels,value.category)||typeof value.feePence!=='number'||!Number.isSafeInteger(value.feePence)||value.feePence<0||value.feePence>100000||value.currency!=='GBP'||!['awaiting_payment','not_required'].includes(String(value.paymentStatus))||typeof value.biginSyncStatus!=='string'||!['test','live'].includes(String(value.mode)))return null;
 // Keep only receipt fields; contact IDs and private applicant data do not belong in this view.
 return {id:value.id,reference:value.reference,createdAt:value.createdAt,category:value.category as SavedApplication['category'],feePence:value.feePence,currency:'GBP',paymentStatus:value.paymentStatus as SavedApplication['paymentStatus'],biginSyncStatus:value.biginSyncStatus,mode:value.mode as SavedApplication['mode']};
}
function responseMessage(value:unknown){return object(value)&&object(value.error)&&typeof value.error.message==='string'&&value.error.message.length<=400?value.error.message:null;}
function responseFields(value:unknown):FieldErrors {
 if(!object(value)||!object(value.error)||!object(value.error.fields))return {};
 return Object.fromEntries(Object.entries(value.error.fields).filter(([key,message])=>Object.hasOwn(EMPTY_ANSWERS,key)&&typeof message==='string'&&message.length<=400)) as FieldErrors;
}
const terms=[
 ['Membership Period.','Paid memberships and renewals are valid for 12 months from confirmed membership fee payment. Free memberships are valid for 12 months from confirmed activation.'],
 ['Refund Policy.','Membership fees are non-refundable under any circumstances once payment has been received.'],
 ['Communication and Notifications.','ICSH may use your contact details to discuss your application and membership. Optional community updates are handled separately; submitting this form does not enrol you in mailing lists or WhatsApp groups.'],
];
export default function MembershipForm({today:initialToday,renewal=false,newMember=false,paymentsEnabled=false}:{today:string;renewal?:boolean;newMember?:boolean;paymentsEnabled?:boolean}) {
 const [today,setToday]=useState(initialToday);
 const [values,setValues]=useState<MembershipAnswers>({...EMPTY_ANSWERS,kind:renewal?'renewal':newMember?'new':''});
 const [step,setStep]=useState(1);const [errors,setErrors]=useState<FieldErrors>({});
 const [submitting,setSubmitting]=useState(false);const [paymentRedirectError,setPaymentRedirectError]=useState('');const [submissionError,setSubmissionError]=useState('');const [receipt,setReceipt]=useState<SavedApplication|null>(null);
 const [checkingDelivery,setCheckingDelivery]=useState(false);const [deliveryError,setDeliveryError]=useState('');const deliveryNotice=useRef<HTMLParagraphElement>(null);const [checkingMembership,setCheckingMembership]=useState(false);const [eligibility,setEligibility]=useState<MembershipEligibility|null>(null);const [membershipCheckError,setMembershipCheckError]=useState('');const membershipNotice=useRef<HTMLDivElement>(null);const busy=submitting||checkingDelivery||checkingMembership;
 const submissionLock=useRef(false);const attempt=useRef<SubmissionAttempt|null>(null);
 const heading=useRef<HTMLHeadingElement>(null);const errorSummary=useRef<HTMLDivElement>(null);const calendar=useRef<HTMLInputElement>(null);const mounted=useRef(false);
 const quote=getQuote(values,today);const studentAge=quote!==null&&!quote.paymentTest&&isStudentAge(quote.age);
 useEffect(()=>{if(mounted.current)heading.current?.focus({preventScroll:false});mounted.current=true;},[step]);
 function change<K extends keyof MembershipAnswers>(key:K,value:MembershipAnswers[K]) {if(submissionLock.current)return;attempt.current=null;setReceipt(null);setEligibility(null);setMembershipCheckError('');setSubmissionError('');setDeliveryError('');const on=londonDate();setToday(on);const ageError=key==='dob'?registrationAgeError(getQuote({...values,[key]:value},on)):undefined;setValues(current=>updateAnswer(current,key,value,on));setErrors(current=>({...current,[key]:ageError,...(key==='dob'||key==='education'?{studentDeclaration:undefined,education:undefined}:{})}));}
 function blur(key:keyof MembershipAnswers,stage:number){setErrors(current=>({...current,[key]:validateStep(values,stage,londonDate())[key]}));}
 function showErrors(next:FieldErrors){setErrors(next);requestAnimationFrame(()=>errorSummary.current?.focus());}
 function goTo(next:number){if(submissionLock.current)return;setErrors({});setSubmissionError('');setDeliveryError('');setStep(next);}
 async function continueStep(){
  if(submissionLock.current)return;
  const on=londonDate();setToday(on);const next=step===1?{...validateStep(values,1,on),...validateStep(values,2,on)}:validateStep(values,step+1,on);
  if(Object.values(next).some(Boolean)){showErrors(next);return;}
  if(step===1){
   submissionLock.current=true;setCheckingMembership(true);setMembershipCheckError('');setEligibility(null);setErrors({});
   let checked:MembershipEligibility|null=null;
   try {
    const response=await fetch('/api/membership/eligibility',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:values.kind,firstName:values.firstName,lastName:values.lastName,email:values.email,mobile:values.mobile}),signal:AbortSignal.timeout(30000)});
    const body:unknown=await response.json().catch(()=>null);
    checked=response.ok?eligibilityResult(body):null;
    if(!checked)throw new Error(object(body)&&typeof body.error==='string'&&body.error.length<=400?body.error:'We could not check your membership. Please try again later. You cannot continue until the check succeeds.');
    setEligibility(checked);
   } catch(error){setMembershipCheckError(error instanceof Error&&!['TimeoutError','AbortError','TypeError'].includes(error.name)?error.message:'We could not check your membership. Please try again later. You cannot continue until the check succeeds.');}
   finally{submissionLock.current=false;setCheckingMembership(false);}
   if(checked?.status!=='allowed'){requestAnimationFrame(()=>membershipNotice.current?.focus());return;}
  }
  goTo(step+1);
 }
 async function complete(){
  if(submissionLock.current)return;
  const on=londonDate();setToday(on);const next=validateApplication(values,on);
  const first=Object.entries(next).find(([,message])=>Boolean(message));
  if(first){setStep(screenForError(first[0] as keyof MembershipAnswers));showErrors(next);return;}
  submissionLock.current=true;setSubmitting(true);setSubmissionError('');setPaymentRedirectError('');setErrors({});
  let saveStarted=false;
  try {
   if(!attempt.current){const bytes=crypto.getRandomValues(new Uint8Array(32));attempt.current={requestKey:crypto.randomUUID(),receiptToken:Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('')};}
   const sessionResponse=await fetch('/api/membership/applications',{method:'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000)});
   const session:unknown=await sessionResponse.json().catch(()=>null);
   if(!sessionResponse.ok||!object(session)||session.ok!==true||session.mode!=='live'||session.available!==true||typeof session.csrf!=='string'||!/^[a-f0-9]{64}$/i.test(session.csrf))throw new Error(responseMessage(session)||'Submissions are not available right now. Your answers are still here; please try again later.');
   saveStarted=true;
   const response=await fetch('/api/membership/applications',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrf},body:JSON.stringify({...attempt.current,answers:values,testData:false,website:''}),signal:AbortSignal.timeout(30000)});
   const body:unknown=await response.json().catch(()=>null);
   const confirmed=object(body)&&body.ok===true?savedApplication(body.application):null;
   if(!response.ok||!confirmed){
    const blocked=object(body)?eligibilityResult(body.eligibility):null;
    if(blocked){setEligibility(blocked);setStep(1);}
    const fields=responseFields(body);const firstField=Object.keys(fields)[0] as keyof MembershipAnswers|undefined;
    if(firstField){setErrors(fields);setStep(screenForError(firstField));}
    throw new Error(responseMessage(body)||'We could not confirm that your application was saved. Your answers are still here. Retry without changing them to check the same application.');
   }
   setReceipt(confirmed);setStep(4);
   if(paymentsEnabled&&confirmed.feePence>0){
    try{
     const response=await fetch(`/api/membership/payments/${confirmed.id}`,{method:'POST',headers:{'Content-Type':'application/json','X-Membership-Receipt':attempt.current.receiptToken},body:'{}',signal:AbortSignal.timeout(35000)});const payment=await response.json();
     if(!response.ok)throw new Error(payment.error||'Payment could not be opened.');
     if(payment.returnUrl===`/membership/payment?application_id=${confirmed.id}`){window.location.assign(payment.returnUrl);return;}
     const url=new URL(payment.url);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')throw new Error('Payment could not be opened.');window.location.assign(url.href);
    }catch{setPaymentRedirectError('Your application is saved. Checkout could not be opened automatically. Use the payment button below to retry.');}
   }
  } catch(error){setSubmissionError(error instanceof Error&&error.name!=='TimeoutError'&&error.name!=='AbortError'&&error.name!=='TypeError'?error.message:saveStarted?'We could not confirm that your application was saved. Your answers are still here. Retry without changing them to check the same application.':'We could not submit your application. Your answers are still here. Please try again.');requestAnimationFrame(()=>errorSummary.current?.focus());}
  finally {submissionLock.current=false;setSubmitting(false);}
 }
 async function checkDelivery(){
  if(submissionLock.current||!receipt||!attempt.current)return;
  submissionLock.current=true;setCheckingDelivery(true);setDeliveryError('');
  try {
   const response=await fetch(`/api/membership/applications/${receipt.id}`,{method:'GET',credentials:'same-origin',cache:'no-store',headers:{'X-Membership-Receipt':attempt.current.receiptToken},signal:AbortSignal.timeout(20000)});
   const body:unknown=await response.json().catch(()=>null);
   const confirmed=object(body)&&body.ok===true?savedApplication(body.application):null;
   if(!response.ok||!confirmed||confirmed.id!==receipt.id)throw new Error(responseMessage(body)||'The delivery status could not be checked. Your last confirmed application details are still shown.');
   setReceipt(confirmed);
  } catch(error){setDeliveryError(error instanceof Error&&error.name!=='TimeoutError'&&error.name!=='AbortError'&&error.name!=='TypeError'?error.message:'The delivery status could not be checked. Your last confirmed application details are still shown.');requestAnimationFrame(()=>deliveryNotice.current?.focus());}
  finally {submissionLock.current=false;setCheckingDelivery(false);}
 }
 function openCalendar(){try{calendar.current?.showPicker()}catch{document.getElementById('dob')?.focus()}}
 function startAgain(){if(submissionLock.current)return;attempt.current=null;setReceipt(null);setEligibility(null);setMembershipCheckError('');setSubmissionError('');setDeliveryError('');setValues({...EMPTY_ANSWERS});setErrors({});setStep(1);}
 const fieldError=(key:keyof MembershipAnswers)=>errors[key]?<span className="field-error" id={`${key}-error`}>{errors[key]}</span>:null;
 function textField(key:'firstName'|'lastName'|'email',label:string,type='text') {return <div className="form-field"><label htmlFor={key}>{label} <span aria-hidden="true">*</span></label><input id={key} type={type} autoComplete="off" required maxLength={key==='email'?254:80} value={values[key]} onChange={event=>change(key,event.target.value)} onBlur={()=>blur(key,1)} aria-invalid={Boolean(errors[key])} aria-describedby={[key==='email'?'test-email-hint':'',errors[key]?`${key}-error`:''].filter(Boolean).join(' ')||undefined} placeholder={key==='email'?'you@example.com':undefined}/>{key==='email'&&<span className="field-hint" id="test-email-hint">Use your own email address. It must not already belong to another member.</span>}{fieldError(key)}</div>}
 const summary=<aside className="membership-live-summary" aria-label="Your ICSH membership"><span className="tag">12 months of belonging</span><h3>Your ICSH Membership</h3><div className="live-summary-price" aria-live="polite" aria-atomic="true">{quote?priceLabel(quote.fee):'—'}<small>{quote?'Annual membership fee · GBP':'Enter your date of birth'}</small></div><dl><div><dt>Membership Type</dt><dd>{quote?.label||'Calculated automatically'}</dd></div><div><dt>Membership Duration</dt><dd>{MEMBERSHIP_PRICING.durationMonths} Months</dd></div>{quote&&<div><dt>Your age</dt><dd>{quote.age}</dd></div>}{quote?.declarationRequired&&<div><dt>Student declaration</dt><dd>{values.studentDeclaration?'Confirmed':'Required to continue'}</dd></div>}</dl><p>{quote?quote.explanation:'Your date of birth and, where applicable, education status determine your category and fee.'}</p><p className="quiet-note">Paid membership lasts 12 months from confirmed membership fee payment; free membership starts on confirmed activation. Applications do not activate membership or allocate start and expiry dates.</p></aside>;
 return <div className="registration-area" aria-label="ICSH membership form">
  <div className="registration-availability"><span className="tag">Membership applications</span><p>Submit your membership application using your own details. New applications are sent automatically to Bigin as Inactive. {paymentsEnabled?'After saving your application, you can pay any membership fee securely with Stripe. Membership activation is confirmed separately.':'No payment is collected and no membership dates are assigned at this stage.'}</p></div>
  {quote?.paymentTest&&<p className="notice" role="status">£1.00 live payment test for Test Test, regardless of age or education. This is a real payment. Enter a valid date of birth and use contact details that pass the normal membership checks.</p>}
  <ol className="membership-stepper" aria-label="Membership form progress">{steps.map((label,index)=><li key={label} className={step===index+1?'current':step>index+1?'done':''} aria-current={step===index+1?'step':undefined}><span aria-hidden="true">{step>index+1?'✓':index+1}</span><span>{label}</span></li>)}</ol>
  {(Object.values(errors).some(Boolean)||submissionError)&&<div className="validation-summary" role="alert" tabIndex={-1} ref={errorSummary}><strong>{submissionError?'Application save not confirmed':'Please check your answers'}</strong>{submissionError&&<p>{submissionError}</p>}<ul>{Object.entries(errors).filter(([,message])=>message).map(([key,message])=><li key={key}><a href={`#${key}`} onClick={event=>{event.preventDefault();document.getElementById(key)?.focus()}}>{message}</a></li>)}</ul></div>}
  {submitting&&<p className="notice" role="status" aria-live="polite">Saving your application. Please keep this page open.</p>}
  {step===4&&receipt?<div className="membership-completion panel"><div className="result-icon complete" aria-hidden="true">✓</div><span className="eyebrow">Application received</span><h3 ref={heading} tabIndex={-1}>Application saved on the website</h3><p>Keep this application reference: <strong>{receipt.reference}</strong>. ICSH organisers can use it to find your saved application.</p><div className="completion-membership"><div><span>Membership category</span><strong>{receipt.feePence===100?'Live payment test':categoryLabels[receipt.category]}</strong></div><div><span>Annual fee</span><strong>{priceLabel(receipt.feePence/100)}</strong></div><div><span>Payment status</span><strong>{receipt.paymentStatus==='not_required'?'No payment required · activation pending':'Awaiting payment'}</strong></div></div>{paymentRedirectError&&<p role="alert" className="notice">{paymentRedirectError}</p>}{submitting&&receipt.feePence>0&&<p role="status">Opening secure Stripe checkout…</p>}{paymentsEnabled&&receipt.feePence>0&&attempt.current&&<MembershipPayment id={receipt.id} capability={attempt.current.receiptToken} disabled={busy}/>}{receipt.feePence===100&&<p className="notice">£1.00 live payment test. This is a real payment; membership activation is separate.</p>}<p className="completion-notice" role="status" aria-live="polite"><strong>Bigin delivery: {syncLabels[receipt.biginSyncStatus]||'Awaiting organiser review'}.</strong> {receipt.biginSyncStatus==='synced'?'Your contact has been verified in Bigin with Membership Status: Inactive.':'This confirms that the website saved your application. It does not yet confirm delivery to Bigin; please contact ICSH with your reference if delivery needs attention.'} Saving this application does not activate membership, take payment or send email.</p><button type="button" className="button outline" disabled={busy} onClick={checkDelivery}>{checkingDelivery?'Checking delivery…':'Check Bigin delivery'}</button>{deliveryError&&<p className="notice" role="alert" tabIndex={-1} ref={deliveryNotice}>{deliveryError}</p>}<p>You can review these answers while this page is open. To correct a saved application, contact ICSH with its reference.</p><div className="form-step-actions"><button type="button" className="button outline" disabled={busy} onClick={()=>goTo(3)}>Review these answers</button><button type="button" className="button" disabled={busy} onClick={startAgain}>Clear form and start again</button></div></div>:<div className="registration-grid">
   <div className="panel registration-panel membership-form-fields" role="group" aria-labelledby="membership-step-heading" aria-busy={busy} inert={busy} onKeyDown={event=>{if(event.key==='Enter'&&event.target instanceof HTMLInputElement&&!['checkbox','radio','date'].includes(event.target.type)){event.preventDefault();if(step<4)continueStep();else complete()}}}>
    <span className="form-step-label">Step {step} of 4</span><h3 id="membership-step-heading" ref={heading} tabIndex={-1}>{step===1?'Let’s get to know you.':step===2?'A few things to know.':'Review your application.'}</h3>
    {step===1&&<>
     <p className="form-intro">Fields marked * are required. Before you continue, we check your full name, email and phone number against current membership records. Email addresses and phone numbers must each be unique; different people may share a full name.</p>
     <fieldset className="registration-choice" id="kind" tabIndex={-1} aria-describedby={errors.kind?'kind-error':undefined}><legend>Membership Category <span aria-hidden="true">*</span></legend><label><input type="radio" name="kind" value="new" required checked={values.kind==='new'} onChange={()=>change('kind','new')}/> New Member</label><label><input type="radio" name="kind" value="renewal" required checked={values.kind==='renewal'} onChange={()=>change('kind','renewal')}/> Membership Renewal</label></fieldset>{fieldError('kind')}
     {values.kind==='new'&&<p className="form-context">New Member Information</p>}
     {values.kind==='renewal'&&<div className="renewal-guidance"><strong>Membership Renewal</strong><p>Use the details recorded for your existing membership. An organiser will review the application; submitting it does not change an existing member’s status or dates. Your current membership will also be checked automatically before you can continue.</p><details className="member-search-inline"><summary>Member Search Tool</summary><div style={{paddingTop:24}}><MemberSearch/></div></details><button className="text-button" type="button" onClick={()=>change('kind','new')}>Switch to New Member</button></div>}
     <div className="form-row">{textField('firstName','First Name')}{textField('lastName','Last Name')}</div>
     <div className="form-field"><label htmlFor="dob">Date of Birth <span aria-hidden="true">*</span></label><div className="dob-control"><input id="dob" type="text" inputMode="numeric" autoComplete="off" required placeholder="DD/MM/YYYY" maxLength={10} value={values.dob} onChange={event=>change('dob',event.target.value)} onBlur={()=>blur('dob',1)} aria-invalid={Boolean(errors.dob)} aria-describedby={`dob-hint${errors.dob?' dob-error':''}`}/><button type="button" className="calendar-picker-button" onClick={openCalendar} aria-label="Open date of birth date picker"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h3M14 14h3M7 18h3"/></svg></button><input ref={calendar} className="dob-calendar-input" type="date" min="1900-01-01" max={today} value={britishToIso(values.dob)||''} onChange={event=>change('dob',isoToBritish(event.target.value))} tabIndex={-1} aria-hidden="true"/></div><span className="field-hint" id="dob-hint">Your date of birth helps us determine the correct membership category and annual fee. Enter DD/MM/YYYY or use the date picker. Applicants must be aged 17 or above. Children aged 16 and below are automatically dependants of a member and do not complete this form.</span>{fieldError('dob')}</div>
     <div className={`education-confirmation${studentAge?' is-visible':''}`} inert={!studentAge} aria-hidden={!studentAge}><div className="education-confirmation-content"><div className="education-confirmation-box"><label htmlFor="fullTimeEducation"><input id="fullTimeEducation" type="checkbox" checked={studentAge&&values.education==='yes'} disabled={!studentAge} onChange={event=>change('education',event.target.checked?'yes':'no')} aria-describedby="education-confirmation-hint"/><span>I confirm that I am currently enrolled in full-time education.</span></label><p id="education-confirmation-hint">Applicants aged 17–21 inclusive who are enrolled in full-time education are eligible for FREE ICSH membership.</p></div></div></div>
     {quote?.declarationRequired&&<div className="student-declaration"><h4>Full-Time Education Declaration</h4><label><input id="studentDeclaration" type="checkbox" required checked={values.studentDeclaration} onChange={event=>change('studentDeclaration',event.target.checked)} aria-invalid={Boolean(errors.studentDeclaration)} aria-describedby={errors.studentDeclaration?'studentDeclaration-error':undefined}/><span>{STUDENT_DECLARATION}</span></label>{fieldError('studentDeclaration')}</div>}
     {textField('email','Email','email')}
     <div className="form-field"><label htmlFor="mobile">Mobile Number <span aria-hidden="true">*</span></label><div className="phone-control"><label className="sr-only" htmlFor="mobile-country">Mobile country code</label><select id="mobile-country" autoComplete="off" defaultValue="GB"><option value="GB">UK +44</option></select><input id="mobile" type="tel" autoComplete="off" required maxLength={25} value={values.mobile} onChange={event=>change('mobile',event.target.value)} onBlur={()=>blur('mobile',1)} aria-invalid={Boolean(errors.mobile)} aria-describedby={`mobile-hint${errors.mobile?' mobile-error':''}`}/></div><span className="field-hint" id="mobile-hint">Use your own mobile number. It must not already belong to another member. No communications enrolment takes place through this form.</span>{fieldError('mobile')}</div>
     <div className="member-status-note"><strong>Not sure if you are a member already?</strong><p><Link href="/membership/search" target="_blank" rel="noopener noreferrer">Check your membership dates <span className="sr-only">(opens in a new tab)</span></Link> using your name, email address or mobile number.</p></div>
    </>}
    {step===2&&<>
     <p>Please read the membership information below, then confirm that you understand and agree.</p><div className="membership-fee-detail"><span>Annual membership fee</span><strong>{quote?priceLabel(quote.fee):'—'}</strong><p>{paymentsEnabled?'The fee is calculated automatically. Save your application, then continue to Stripe for a single secure payment.':'The fee is calculated automatically. Payments are not available through this form.'}</p></div>
     <section className="membership-terms" aria-labelledby="terms-heading"><h4 id="terms-heading">Terms and Conditions</h4>{terms.map(([title,body])=><div key={title}><h5>{title}</h5><p>{body}</p></div>)}<p className="terms-development-note">Submitting saves a application for organiser review. It does not register you as an active member, take a payment, or add you to WhatsApp or email communications. Membership dates are assigned only when the appropriate activation is confirmed.</p></section>
     <div className="required-declaration"><label><input id="terms" type="checkbox" required checked={values.terms} onChange={event=>change('terms',event.target.checked)} aria-invalid={Boolean(errors.terms)} aria-describedby={errors.terms?'terms-error':undefined}/><span>I understand and agree. <span aria-hidden="true">*</span></span></label>{fieldError('terms')}</div>
    </>}
    {step===3&&<>
     <p>Check all your answers. You can edit any section before submitting. A saved application reference is shown only after the website confirms the save.</p>
     <section className="review-section"><div className="review-section-heading"><h4>Personal details</h4><button type="button" className="text-button" onClick={()=>goTo(1)}>Edit personal details</button></div><dl className="review-details"><div><dt>Membership Category</dt><dd>{values.kind==='renewal'?'Membership Renewal':'New Member'}</dd></div><div><dt>First Name</dt><dd>{values.firstName}</dd></div><div><dt>Last Name</dt><dd>{values.lastName}</dd></div><div><dt>Date of Birth</dt><dd>{values.dob}</dd></div><div><dt>Email</dt><dd>{values.email}</dd></div><div><dt>Mobile Number</dt><dd>+44 {values.mobile.replace(/^\+?44\s*/, '').replace(/^0/,'')}</dd></div></dl></section>
     <section className="review-section"><div className="review-section-heading"><h4>Membership eligibility</h4><button type="button" className="text-button" onClick={()=>goTo(1)}>Edit eligibility</button></div><dl className="review-details">{studentAge&&<div><dt>Full-time education</dt><dd>{values.education==='yes'?'Yes':'No'}</dd></div>}<div><dt>Membership Type</dt><dd>{quote?.label}</dd></div><div><dt>Annual Membership Fee</dt><dd>{quote?priceLabel(quote.fee):'—'}</dd></div><div><dt>Membership Duration</dt><dd>{MEMBERSHIP_PRICING.durationMonths} Months</dd></div>{quote?.declarationRequired&&<div><dt>Full-Time Education Declaration</dt><dd>Confirmed</dd></div>}</dl>{quote?.declarationRequired&&<p className="review-declaration-copy">{STUDENT_DECLARATION}</p>}</section>
     <section className="review-section"><div className="review-section-heading"><h4>Additional membership information</h4><button type="button" className="text-button" onClick={()=>goTo(3)}>Edit membership information</button></div><p className="review-declaration-copy">Terms and Conditions — I understand and agree: <strong>{values.terms?'Confirmed':'Confirmation required'}</strong></p><p className="quiet-note">12-month membership period, refund policy, and communication and notification information.</p></section>
     <div className="student-declaration accuracy-declaration"><h4>General Accuracy Declaration <span aria-hidden="true">*</span></h4><label><input id="accuracy" type="checkbox" required checked={values.accuracy} onChange={event=>change('accuracy',event.target.checked)} aria-invalid={Boolean(errors.accuracy)} aria-describedby={errors.accuracy?'accuracy-error':undefined}/><span>{ACCURACY_DECLARATION}</span></label>{fieldError('accuracy')}</div>
     <p className="completion-explanation">Submit Application saves your details and sends a new application to Bigin as Inactive. The confirmation shows your reference and the Bigin delivery result. {paymentsEnabled?'Stripe checkout opens automatically after the save if a membership fee is due.':'No payment is collected.'}</p>
    </>}
    {step===1&&(eligibility||membershipCheckError)&&<div className="membership-check-result" role="status" aria-live="polite" tabIndex={-1} ref={membershipNotice}>
     <strong>{membershipCheckError?'Membership check unavailable':eligibility?.status==='active'?'Your membership is still active':eligibility?.status==='allowed'?'Membership check complete':'Please check your membership details'}</strong>
     <p>{membershipCheckError||(eligibility&&membershipEligibilityMessage(eligibility))}</p>
     {eligibility?.status==='active'&&<><dl><div><dt>Membership Date</dt><dd>{membershipDateLabel(eligibility.membershipDate)}</dd></div><div><dt>Membership Expiry</dt><dd>{membershipDateLabel(eligibility.membershipExpiry)}</dd></div></dl><p>Approximately {eligibility.daysUntilExpiry} {eligibility.daysUntilExpiry===1?'day':'days'} remaining.</p></>}
     {eligibility?.status==='renewal_required'&&<button className="button outline" type="button" onClick={()=>change('kind','renewal')}>Switch to Membership Renewal</button>}
     {eligibility?.status==='new_required'&&<button className="button outline" type="button" onClick={()=>change('kind','new')}>Switch to New Member</button>}
     {(membershipCheckError||eligibility?.status==='identity_conflict'||eligibility?.status==='review_required')&&<Link href="/contact">Contact ICSH</Link>}
    </div>}
    <div className="form-step-actions">{step>1&&<button type="button" className="button outline" disabled={busy} onClick={()=>goTo(step-1)}>← Back</button>}<button type="button" className="button" disabled={busy} onClick={step===3?complete:continueStep}>{checkingMembership?'Checking membership…':submitting?'Saving…':step===3?'Submit Application':'Continue'} <span aria-hidden="true">→</span></button></div>
    <p className="form-privacy">Your name, email and phone number are sent securely for the automatic membership check when you continue. Other unsubmitted answers stay in this open form. Submitted applications are stored privately for ICSH organiser review; the confirmation reports Bigin delivery separately. If you continue to payment, Stripe receives your email address and application reference; card details are entered on Stripe. No mailing-list enrolment occurs. <Link href="/privacy#membership-form">Read the membership privacy information</Link>.</p>
   </div>{summary}
  </div>}
 </div>
}
