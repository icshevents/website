import Link from 'next/link';
import {cookies} from 'next/headers';
import {paymentCookieName,readPaymentCookie} from '@/lib/payments/core';
import {paymentSource,formPayment} from '@/lib/payments/server';
export const dynamic='force-dynamic';
export const metadata={title:'Payment confirmation',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function Payment({searchParams}:{searchParams:Promise<{kind?:string;id?:string}>}){
 const query=await searchParams,proof=readPaymentCookie((await cookies()).get(paymentCookieName)?.value||'',process.env.SUPABASE_SECRET_KEY||'');let source=null,payment=null;
 try{if(proof&&proof.kind===query.kind&&proof.id===query.id){source=await paymentSource(proof.kind,proof.id,proof.capability);if(source)payment=await formPayment(source.kind,source.id);}}catch{/* A return URL cannot confirm payment. */}
 const paid=payment?.status==='paid',review=payment&&['partially_refunded','refunded','disputed'].includes(payment.status);
 return <section className="section white"><div className="wrap reading"><span className="tag">ICSH payment</span><h1>{paid?'Payment received.':review?'Payment needs review.':'Payment not yet confirmed.'}</h1>{source?<><p>{source.description}</p><p>Reference: <strong>{source.reference}</strong></p><p>Amount: {new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(source.amount/100)}</p><p>{paid?source.kind==='donation'?'Thank you for supporting ICSH. Your donation has been confirmed by Stripe.':'Stripe has confirmed your payment. Check your saved booking confirmation for the place status.':review?'Please contact ICSH with your reference about this payment.':'Your details remain saved. Payment may still be processing, or you may have cancelled Checkout. Refresh to check again.'}</p><a className="button outline" href={`/payment?kind=${source.kind}&id=${source.id}`}>Refresh payment status</a></>:<p>Open this confirmation in the same browser that started the payment. Contact ICSH if you need help.</p>}<p>No recurring payment has been set up.</p><p><Link href="/contact">Contact ICSH</Link> · <Link href={source?.kind==='donation'?'/donate':'/events'}>Return to ICSH</Link></p></div></section>;
}
