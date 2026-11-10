'use client';
import {useEffect,useRef,useState} from 'react';
type Activation={status:string;startDate:string|null;expiryDate:string|null};
type Payment={status:string;amount:number;paidAt:string|null;refundedAmount:number};
export default function MembershipPayment({id,capability,disabled=false}:{id:string;capability:string;disabled?:boolean}){
 const[activation,setActivation]=useState<Activation|null>(null);
 const [available,setAvailable]=useState(false),[payment,setPayment]=useState<Payment|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);const lock=useRef(false);
 useEffect(()=>{const controller=new AbortController();
  fetch(`/api/membership/payments/${id}`,{headers:{'X-Membership-Receipt':capability},cache:'no-store',signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error();return response.json();}).then(body=>{if(!controller.signal.aborted){setAvailable(body.available===true);setPayment(body.payment||null);setActivation(body.activation||null);}}).catch(()=>{});
  return()=>controller.abort();
 },[id,capability]);
 async function pay(){if(lock.current||disabled)return;lock.current=true;setBusy(true);setMessage('');
  try{const response=await fetch(`/api/membership/payments/${id}`,{method:'POST',headers:{'Content-Type':'application/json','X-Membership-Receipt':capability},body:'{}',signal:AbortSignal.timeout(35000)});const body=await response.json();if(!response.ok)throw new Error(body.error||'Payment could not be opened. Retry this confirmation.');
   if(body.returnUrl===`/membership/payment?application_id=${id}`){window.location.assign(body.returnUrl);return;}
   const url=new URL(body.url);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')throw new Error('Payment could not be opened.');window.location.assign(url.href);
  }catch(error){setMessage(error instanceof Error&&error.name==='Error'?error.message:'Payment could not be opened. Retry this same application confirmation.');}
  finally{lock.current=false;setBusy(false);}
 }
 if(!available)return null;
 const paid=payment&&['paid','partially_refunded','refunded','disputed'].includes(payment.status);
 return <section className="notice" aria-label="Membership payment"><h4>{paid?'Membership payment recorded':'Pay your membership fee'}</h4>{paid?<p>{payment.status==='paid'?activation?.status==='active'?`Your membership is active from ${activation.startDate} until ${activation.expiryDate}.`:activation?.status==='review_required'?'Payment received. Please contact ICSH about your membership activation.':'Payment received. Your membership activation is being confirmed automatically.':'This payment needs organiser review. Please contact ICSH with your application reference.'}</p>:<><p>Pay the fee shown above securely through Stripe.</p><button type="button" className="button" disabled={busy||disabled} onClick={pay}>{busy?'Opening secure payment…':'Pay securely with Stripe'}</button><p className="quiet-note">One-off payment. Membership activates after payment is verified.</p></>}{message&&<p role="alert">{message}</p>}</section>;
}
