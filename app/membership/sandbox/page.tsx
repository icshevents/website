import {notFound} from 'next/navigation';
import {sandboxConfiguration} from '@/lib/stripe-sandbox';
import SandboxForm from './sandbox-form';
export const dynamic='force-dynamic';
export const metadata={title:'Membership payment sandbox',robots:{index:false,follow:false}};
export default function SandboxPage(){
 if(!sandboxConfiguration())notFound();
 return <section className="section white"><div className="wrap reading"><span className="tag">Preview only · Stripe sandbox</span><h1>Test a membership payment.</h1><p>This test uses fictional details and the same age-based fee rules as the membership form. No real money moves. It does not submit a real application, contact Bigin, activate membership, or send email.</p><p>Standard £20 · Age 65+ £15 · Eligible full-time students aged 17–21 FREE. Joining and renewal are single payments; there is no automatic recurring charge.</p><SandboxForm/><p className="quiet-note">Use Stripe test card 4242 4242 4242 4242, a future expiry date and any three-digit CVC. For a decline test, use 4000 0000 0000 0002. Enter fictional billing details only. Payment status is checked securely with Stripe when you return.</p><p className="quiet-note">Signed payment webhooks and durable application reconciliation are required before enabling membership activation or live payments.</p></div></section>;
}
