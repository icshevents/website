'use client';
import {useRef,useState,type FormEvent} from 'react';
import {getQuote} from '@/lib/membership-validation';
import {londonDate,priceLabel} from '@/lib/membership';
const initial={kind:'new' as 'new'|'renewal',firstName:'Fictional' as const,lastName:'Sandbox' as const,email:'icsh-stripe-test@example.invalid' as const,mobile:'07700900123' as const,dob:'01/01/1990',education:'no' as 'yes'|'no',studentDeclaration:false,terms:false,accuracy:false};
export default function SandboxForm(){
 const [answers,setAnswers]=useState(initial),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const attempt=useRef<string|null>(null),lock=useRef(false);
 const quote=getQuote(answers,londonDate());
 function change(value:Partial<typeof answers>){if(lock.current)return;attempt.current=null;setMessage('');setAnswers(current=>({...current,...value}));}
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setMessage('');
  try{
   attempt.current??=crypto.randomUUID();
   const init=await fetch('/api/membership/sandbox',{cache:'no-store'});const session=await init.json();
   if(!init.ok||typeof session.csrf!=='string')throw new Error('The sandbox is unavailable. Reload and try again.');
   const response=await fetch('/api/membership/sandbox',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrf},body:JSON.stringify({requestKey:attempt.current,answers}),signal:AbortSignal.timeout(30000)});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'Checkout could not be confirmed. Retry this form.');
   if(result.paymentRequired===false){setMessage(result.message);return;}
   const url=new URL(result.url);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')throw new Error('Invalid checkout address.');
   window.location.assign(url.href);
  }catch(error){setMessage(error instanceof Error?error.message:'Checkout could not be confirmed. Retry this form.');}
  finally{lock.current=false;setBusy(false);}
 }
 return <form onSubmit={submit} className="panel registration-panel membership-form-fields"><p><strong>Fictional Sandbox</strong><br/>icsh-stripe-test@example.invalid · 07700 900123</p><fieldset disabled={busy} style={{border:0,padding:0}}><div className="form-field"><label htmlFor="sandbox-kind">Application type</label><select id="sandbox-kind" value={answers.kind} onChange={e=>change({kind:e.target.value as 'new'|'renewal'})}><option value="new">New membership test</option><option value="renewal">Renewal test</option></select></div><div className="form-field"><label htmlFor="sandbox-dob">Fictional date of birth (DD/MM/YYYY)</label><input id="sandbox-dob" value={answers.dob} required maxLength={10} onChange={e=>change({dob:e.target.value,studentDeclaration:false})}/><span className="field-hint">Try 01/01/1990 for standard, 01/01/1950 for pensioner, or 01/01/2007 for student.</span></div><label style={{display:'block',marginBottom:16}}><input type="checkbox" checked={answers.education==='yes'} onChange={e=>change({education:e.target.checked?'yes':'no',studentDeclaration:false})}/> Fictional applicant is in full-time education</label>{quote?.declarationRequired&&<label style={{display:'block',marginBottom:16}}><input type="checkbox" required checked={answers.studentDeclaration} onChange={e=>change({studentDeclaration:e.target.checked})}/> Confirm the full-time education declaration for this fictional student</label>}<p aria-live="polite"><strong>{quote?`${quote.label}: ${priceLabel(quote.fee)}`:'Enter a valid date of birth.'}</strong></p><label style={{display:'block',marginBottom:16}}><input type="checkbox" required checked={answers.terms} onChange={e=>change({terms:e.target.checked})}/> I understand this is a sandbox test and does not create membership.</label><label style={{display:'block',marginBottom:16}}><input type="checkbox" required checked={answers.accuracy} onChange={e=>change({accuracy:e.target.checked})}/> I confirm the fictional details for this test.</label><button className="button" type="submit">{busy?'Opening sandbox…':quote?.fee===0?'Check free membership path':'Continue to Stripe test checkout'}</button></fieldset>{message&&<p role="status" className="notice">{message}</p>}<p className="quiet-note">If you cancelled Checkout, no payment is confirmed. You can start a fresh test here.</p></form>;
}
