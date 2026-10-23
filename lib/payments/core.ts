import {createHmac} from 'node:crypto';
import {z} from 'zod';
import {paymentConfiguration,StripeMembershipClient,constantEqual,type PaymentConfig} from '../membership-payments/core.ts';
export {paymentHeaders,constantEqual,digest,verifyStripeEvent} from '../membership-payments/core.ts';
export type Kind='donation'|'event';
export const sourceSchema=z.object({kind:z.enum(['donation','event']),id:z.uuid(),mode:z.enum(['live','test']),amount:z.number().int().min(0).max(12000000),currency:z.literal('gbp'),reference:z.string().min(1).max(100),description:z.string().min(1).max(200),email:z.string().max(254),capabilityHash:z.string().regex(/^[a-f0-9]{64}$/),eligible:z.boolean()});
export type Source=z.infer<typeof sourceSchema>;
export function websitePaymentConfiguration(env:NodeJS.ProcessEnv=process.env){return env.STRIPE_WEBSITE_PAYMENTS_ENABLED==='true'?paymentConfiguration(env,false):null;}
export function parseDonationAmount(value:string){
 if(!/^\d{1,6}(?:\.\d{1,2})?$/.test(value))throw new Error('Enter a donation amount with up to two decimal places.');
 const [whole,fraction='']=value.split('.');const amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(amount<30||amount>10000000)throw new Error('Enter an amount between £0.30 and £100,000.');return amount;
}
export type FormPayment={source_kind:Kind;source_id:string;account_id:string;mode:'live'|'test';amount:number;currency:'gbp';reference:string;description:string;session_id:string|null;status:string;paid_at:string|null;refunded_amount:number;created_at:string};
export const publicPayment=(p:FormPayment|null)=>p?{status:p.status,amount:p.amount,currency:'GBP',paidAt:p.paid_at,refundedAmount:p.refunded_amount}:null;
export const paymentCookieName='__Host-icsh-website-payment';
const sign=(value:string,secret:string)=>createHmac('sha256',secret).update('icsh-website-payment-v1:'+value).digest('hex');
export function paymentCookie(kind:Kind,id:string,capability:string,secret:string,now=Date.now()){const payload=`${kind}.${id}.${capability}.${now+86400000}`;return payload+'.'+sign(payload,secret);}
export function readPaymentCookie(value:string,secret:string,now=Date.now()){
 const [kind,id,capability,expires,sig,...extra]=value.split('.');
 if(extra.length||!['donation','event'].includes(kind)||!z.uuid().safeParse(id).success||!/^[a-f0-9]{64}$/.test(capability||'')||!/^\d{13}$/.test(expires||'')||Number(expires)<=now||Number(expires)>now+86400000||!constantEqual(sign(`${kind}.${id}.${capability}.${expires}`,secret),sig||''))return null;
 return {kind:kind as Kind,id,capability};
}
export class WebsiteStripeClient{
 client:StripeMembershipClient;config:PaymentConfig;
 constructor(config:PaymentConfig,transport:typeof fetch=fetch){this.config=config;this.client=new StripeMembershipClient(config,transport);}
 async create(s:Source){
  if(s.mode!==this.config.mode||s.amount<30||!s.eligible)throw new Error('Payment is not available.');await this.client.verifyAccount();
  const params=new URLSearchParams({mode:'payment',client_reference_id:s.id,success_url:`${this.config.origin}/payment?kind=${s.kind}&id=${s.id}`,cancel_url:`${this.config.origin}/payment?kind=${s.kind}&id=${s.id}`,
   'line_items[0][quantity]':'1','line_items[0][price_data][currency]':'gbp','line_items[0][price_data][unit_amount]':String(s.amount),'line_items[0][price_data][product_data][name]':s.description,
   'metadata[purpose]':'icsh_website_payment_v1','metadata[source_kind]':s.kind,'metadata[source_id]':s.id,'metadata[account_id]':this.config.account,
   'payment_intent_data[metadata][purpose]':'icsh_website_payment_v1','payment_intent_data[metadata][source_kind]':s.kind,'payment_intent_data[metadata][source_id]':s.id,
   integration_identifier:'icsh_website_checkout_pqzrmvnt','adaptive_pricing[enabled]':'false'});
  if(s.email)params.set('customer_email',s.email);
  const session=await this.client.request('/checkout/sessions',params,`icsh-website-v1-${this.config.account}-${this.config.mode}-${s.kind}-${s.id}`);this.validate(session,s);return session;
 }
 validate(v:Record<string,any>,s:Source){if(!/^cs_[A-Za-z0-9_]+$/.test(v.id)||s.mode!==this.config.mode||v.livemode!==(this.config.mode==='live')||v.mode!=='payment'||v.currency!=='gbp'||v.amount_total!==s.amount||v.client_reference_id!==s.id||v.metadata?.purpose!=='icsh_website_payment_v1'||v.metadata?.source_kind!==s.kind||v.metadata?.source_id!==s.id||v.metadata?.account_id!==this.config.account)throw new Error('Checkout does not match the saved payment.');}
 outcome(v:Record<string,any>,s:Source){
  this.validate(v,s);if(v.payment_status!=='paid')return{status:v.status==='expired'?'expired':'pending',intent:null,charge:null,paidAt:null,refunded:0};
  const p=v.payment_intent,c=p?.latest_charge;
  if(v.status!=='complete'||!p||typeof p!=='object'||!/^pi_[A-Za-z0-9]+$/.test(p.id)||p.livemode!==(this.config.mode==='live')||p.status!=='succeeded'||p.amount!==s.amount||p.amount_received!==s.amount||p.currency!=='gbp'||!c||typeof c!=='object'||!/^ch_[A-Za-z0-9]+$/.test(c.id)||c.payment_intent!==p.id||c.paid!==true||c.captured!==true||c.status!=='succeeded'||c.amount!==s.amount||c.currency!=='gbp'||c.livemode!==(this.config.mode==='live')||!Number.isSafeInteger(c.created)||!Number.isSafeInteger(c.amount_refunded)||c.amount_refunded<0||c.amount_refunded>s.amount)throw new Error('Payment evidence could not be verified.');
  return{status:c.disputed?'disputed':c.amount_refunded===s.amount?'refunded':c.amount_refunded>0?'partially_refunded':'paid',intent:p.id as string,charge:c.id as string,paidAt:new Date(c.created*1000).toISOString(),refunded:c.amount_refunded as number};
 }
}
