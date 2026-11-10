import MembershipPaymentRefresh from '@/components/MembershipPaymentRefresh';
import {publicActivation} from '@/lib/membership-activation/server';
import Link from 'next/link';
import {cookies} from 'next/headers';
import {authorisedPaymentApplication,verifiedMembershipPaymentState} from '@/lib/membership-payments/server';
import {paymentReceipt,readPaymentReturnCookie,returnCookie} from '@/lib/membership-payments/core';
export const dynamic='force-dynamic';
export const maxDuration=90;
export const metadata={title:'Membership payment',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function MembershipPaymentResult({searchParams}:{searchParams:Promise<{application_id?:string}>}){
 const params=await searchParams;
 const cookie=(await cookies()).get(returnCookie)?.value||'';
 const proof=readPaymentReturnCookie(cookie,process.env.SUPABASE_SECRET_KEY||'');
 let application=null,payment=null,activation=null;
 try{if(proof&&params.application_id===proof.id){application=await authorisedPaymentApplication(proof.id,proof.capability);if(application){const state=await verifiedMembershipPaymentState(application);payment=paymentReceipt(state.payment);activation=publicActivation(state.activation);}}}catch{/* Preserve uncertainty; the browser never records a successful payment. */}
 const paid=payment?.status==='paid',active=paid&&activation?.status==='active';
 const pending=Boolean(application&&payment&&(payment.status==='pending'||paid&&!active&&activation?.status!=='review_required'));
 return <section className="section white"><div className="wrap reading"><span className="tag">ICSH membership</span><h1>{active?'Your membership is active.':paid?'Payment received.':payment&&['refunded','partially_refunded','disputed'].includes(payment.status)?'Payment needs review.':pending?'Checking your payment.':'Payment not yet confirmed.'}</h1>{pending&&<MembershipPaymentRefresh/>}{application?<><p>Application reference: <strong>{application.reference}</strong></p><p>Membership fee: {new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(application.feePence/100)}</p>{paid?<p>{active?`Your payment is confirmed and your membership runs from ${activation?.startDate} until ${activation?.expiryDate}.`:activation?.status==='review_required'?'Your payment is confirmed. Please contact ICSH with your reference so we can complete membership activation.':'Your payment is confirmed. Your membership is being activated automatically. Refresh this page shortly to check its status.'}</p>:<p>{payment?.status==='expired'?'This checkout has expired. Contact ICSH before starting another payment.':payment&&['refunded','partially_refunded','disputed'].includes(payment.status)?'Please contact ICSH about this payment.':'Your application is saved. We’re checking your payment with Stripe. This page will refresh automatically for a short time; you can also use the button below.'}</p>}<p>Paid membership lasts 12 months from the verified payment date. No automatic recurring payment has been set up.</p><a className="button outline" href={`/membership/payment?application_id=${application.id}`}>Refresh payment status</a></>:<p>Open the payment confirmation using the same browser that started Checkout. If you need help, contact ICSH with your application reference.</p>}<p><Link href="/contact">Contact ICSH</Link> · <Link href="/membership">Membership information</Link></p></div></section>;
}
