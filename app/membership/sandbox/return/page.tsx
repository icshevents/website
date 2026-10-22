import Link from 'next/link';
import {cookies} from 'next/headers';
import {notFound} from 'next/navigation';
import {sandboxConfiguration,sandboxCookie,validSandboxSession,StripeSandboxClient} from '@/lib/stripe-sandbox';
export const dynamic='force-dynamic';
export const metadata={title:'Sandbox payment result',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function SandboxReturn({searchParams}:{searchParams:Promise<{session_id?:string}>}){
 const config=sandboxConfiguration();if(!config)notFound();
 const params=await searchParams;const session=(await cookies()).get(sandboxCookie)?.value;
 let receipt=null;
 if(session&&validSandboxSession(session,config.key)&&typeof params.session_id==='string'){
  try{receipt=await new StripeSandboxClient(config.key).receipt(params.session_id,session);}catch{/* No unverified success, provider details, or secret-bearing error text. */}
 }
 return <section className="section white"><div className="wrap reading"><span className="tag">Stripe sandbox · no real money</span><h1>{receipt?.paid?'Test payment verified.':'Test payment not confirmed.'}</h1>{receipt?<><p>Reference: <strong>{receipt.reference}</strong></p><p>Membership fee: {new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(receipt.amount/100)}</p><p>Stripe status: {receipt.paid?'Paid in sandbox':receipt.paymentStatus==='unpaid'?'Awaiting payment':'Pending verification'}</p></>:<p>We could not verify this checkout in this browser. Return using the same browser that opened Checkout.</p>}<p>No real application was saved, no membership activated, and no Bigin record or existing Zoho Forms connection was changed.</p><Link href="/membership/sandbox" className="button">Run another sandbox test</Link></div></section>;
}
