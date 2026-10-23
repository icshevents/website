'use client';
import {useRef,useState} from 'react';
import styles from './services.module.css';
export default function DonationForm({available=false}:{available?:boolean}){
 const [amount,setAmount]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false),attempt=useRef<{id:string;capability:string;saved:boolean}|null>(null);
 const numeric=Number(amount),valid=/^\d+(\.\d{1,2})?$/.test(amount)&&numeric>=0.3&&numeric<=100000;
 function reset(){if(!lock.current){attempt.current=null;setError('');}}
 async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(lock.current||!valid||!available)return;lock.current=true;setBusy(true);setError('');
  const fields=new FormData(event.currentTarget);
  try{
   attempt.current??={id:crypto.randomUUID(),capability:Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),saved:false};const a=attempt.current;
   if(!a.saved){const bootstrap=await fetch('/api/donations',{cache:'no-store'}),session=await bootstrap.json();if(!bootstrap.ok)throw new Error(session.error||'Donations are unavailable.');
    const response=await fetch('/api/donations',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrf},body:JSON.stringify({id:a.id,capability:a.capability,amount,firstName:String(fields.get('firstName')||''),lastName:String(fields.get('lastName')||''),email:String(fields.get('email')||''),website:String(fields.get('website')||'')}),signal:AbortSignal.timeout(25000)});const body=await response.json();if(!response.ok)throw new Error(body.error||'The donation could not be saved.');a.saved=true;
   }
   const response=await fetch('/api/payments/donation/'+a.id,{method:'POST',headers:{'Content-Type':'application/json','X-Payment-Receipt':a.capability},body:'{}',signal:AbortSignal.timeout(35000)});const body=await response.json();if(!response.ok)throw new Error(body.error||'Checkout could not be opened. Retry these same details.');
   if(body.returnUrl==='/payment?kind=donation&id='+a.id){window.location.assign(body.returnUrl);return;}const url=new URL(body.url);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')throw new Error('Checkout could not be opened.');window.location.assign(url.href);
  }catch(e){setError(e instanceof Error&&!['TypeError','TimeoutError','AbortError'].includes(e.name)?e.message:'Checkout could not be opened. Retry these same details.');}finally{lock.current=false;setBusy(false);}
 }
 return <form className={styles.panel} onSubmit={submit} onChange={reset}><fieldset disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0}}>
  <div className="eyebrow">A little can go a long way</div><h2>Your donation</h2><p className={styles.help}>Choose an amount to donate securely through Stripe.</p>
  <div className={styles.donationAmounts} aria-label="Suggested donation amounts">{[10,20,50,100].map(n=><button key={n} type="button" aria-pressed={amount===String(n)} onClick={()=>{reset();setAmount(String(n));}}>£{n}</button>)}</div>
  <div className={styles.fields}><div className={styles.field+' '+styles.wide}><label htmlFor="donation-amount">How much would you like to donate?</label><input id="donation-amount" name="amount" inputMode="decimal" type="number" min="0.30" max="100000" step="0.01" placeholder="Enter an amount in £" value={amount} onChange={e=>setAmount(e.target.value)} required aria-describedby="donation-amount-help"/><p className={styles.help} id="donation-amount-help">GBP · Minimum £0.30.</p></div>
  <div className={styles.field}><label htmlFor="donation-first">First name <span className={styles.optional}>Optional</span></label><input id="donation-first" name="firstName" autoComplete="given-name" maxLength={80}/></div><div className={styles.field}><label htmlFor="donation-last">Last name <span className={styles.optional}>Optional</span></label><input id="donation-last" name="lastName" autoComplete="family-name" maxLength={80}/></div><div className={styles.field+' '+styles.wide}><label htmlFor="donation-email">Email <span className={styles.optional}>Optional</span></label><input id="donation-email" name="email" autoComplete="email" type="email" maxLength={254}/></div></div>
  <div className={styles.honeypot} aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
  {error&&<p className={styles.errorBox} role="alert">{error}</p>}{!available&&<p className={styles.help}>Online donations are temporarily unavailable. Please contact ICSH.</p>}
  <div className={styles.actions}><button className="button" type="submit" disabled={!available||!valid||busy}>{busy?'Opening secure payment…':valid?'Donate £'+numeric.toFixed(2)+' securely':'Continue to secure donation'}</button></div><p className={styles.help}>This is a one-off donation. Your details are used to manage it. <a href="/privacy">Privacy information</a>.</p>
 </fieldset></form>;
}
