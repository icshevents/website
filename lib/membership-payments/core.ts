import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {MEMBERSHIP_PRICING,MEMBERSHIP_PAYMENT_TEST_FEE,isMembershipPaymentTest} from '../membership-pricing.ts';
export type PaymentConfig={key:string;webhookSecret:string;account:string;mode:'live'|'test';origin:string};
export function paymentRequestOrigin(config:PaymentConfig,url:string):PaymentConfig{
 const origin=new URL(url);return origin.protocol==='https:'&&config.mode==='live'&&['website-icsh.vercel.app','website-nine-beta-11.vercel.app','www.icsh.org.uk','icsh.org.uk'].includes(origin.hostname)?{...config,origin:origin.origin}:config;
}
export function paymentConfiguration(env:NodeJS.ProcessEnv=process.env,requireEnabled=true):PaymentConfig|null{
 if(requireEnabled&&env.STRIPE_MEMBERSHIP_PAYMENTS_ENABLED!=='true')return null;
 const key=env.STRIPE_SECRET_KEY||'',account=env.STRIPE_ACCOUNT_ID||'',webhookSecret=env.STRIPE_WEBHOOK_SECRET||'';
 const mode=env.VERCEL_ENV==='production'?'live':env.VERCEL_ENV==='preview'?'test':null;
 if(!mode||!new RegExp(`^(rk|sk)_${mode}_[A-Za-z0-9]+$`).test(key)||!/^acct_[A-Za-z0-9]+$/.test(account)||!/^whsec_[A-Za-z0-9]+$/.test(webhookSecret))return null;
 let origin;try{const url=new URL(env.STRIPE_SITE_URL||'');if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)return null;origin=url.origin;}catch{return null;}
 if(mode==='live'&&!['website-icsh.vercel.app','www.icsh.org.uk','icsh.org.uk'].includes(new URL(origin).hostname))return null;
 if(mode==='test'&&!/^website-[a-z0-9-]+-icsh\.vercel\.app$/.test(new URL(origin).hostname))return null;
 return {key,webhookSecret,account,mode,origin};
}
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export function constantEqual(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export const paymentHeaders={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'};
export const returnCookie='__Host-icsh-membership-payment';
const signature=(text:string,secret:string)=>createHmac('sha256',secret).update('icsh-payment-return-v1:'+text).digest('hex');
export function paymentReturnCookie(id:string,capability:string,secret:string,now=Date.now()){
 const payload=`${id}.${capability}.${now+86400000}`;return `${payload}.${signature(payload,secret)}`;
}
export function readPaymentReturnCookie(value:string,secret:string,now=Date.now()):{id:string;capability:string}|null{
 const [id,capability,expires,sig,...extra]=value.split('.');
 if(extra.length||!z.string().uuid().safeParse(id).success||!/^[a-f0-9]{64}$/.test(capability||'')||!/^\d{13}$/.test(expires||'')||Number(expires)<=now||Number(expires)>now+86400000||!constantEqual(signature(`${id}.${capability}.${expires}`,secret),sig||''))return null;
 return {id,capability};
}
export type StripeEvent={id:string;type:string;livemode:boolean;account?:string;data:{object:Record<string,unknown>}};
export function verifyStripeEvent(raw:string,header:string,config:PaymentConfig,now=Date.now()):StripeEvent{
 const entries=header.split(',').map(x=>x.trim().split('='));const timestamp=entries.find(x=>x[0]==='t')?.[1];const signatures=entries.filter(x=>x[0]==='v1').map(x=>x[1]);
 if(!timestamp||!/^\d{10}$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300)throw new Error('Invalid Stripe signature');
 const expected=createHmac('sha256',config.webhookSecret).update(`${timestamp}.${raw}`).digest('hex');
 if(!signatures.some(s=>/^[a-f0-9]{64}$/.test(s||'')&&constantEqual(s,expected)))throw new Error('Invalid Stripe signature');
 const event=z.object({id:z.string().regex(/^evt_[A-Za-z0-9]+$/),type:z.string(),livemode:z.boolean(),account:z.string().optional(),data:z.object({object:z.record(z.string(),z.unknown())})}).parse(JSON.parse(raw));
 if(event.livemode!==(config.mode==='live')||(event.account&&event.account!==config.account))throw new Error('Stripe event account mismatch');return event;
}
export type PaymentApplication={id:string;reference:string;mode:'test'|'live';category:string;feePence:number;currency:string;answers:{email:string;firstName?:string;lastName?:string}};
export function applicationAmount(a:PaymentApplication,config:PaymentConfig){
 const testRate=a.category==='standard'&&isMembershipPaymentTest(a.answers)&&a.feePence===MEMBERSHIP_PAYMENT_TEST_FEE*100;
 const amount=testRate?MEMBERSHIP_PAYMENT_TEST_FEE*100:a.category==='standard'?MEMBERSHIP_PRICING.standardFee*100:a.category==='pensioner'?MEMBERSHIP_PRICING.pensionerFee*100:0;
 if(a.mode!==config.mode||a.currency!=='GBP'||a.feePence!==amount||![100,1500,2000].includes(amount))throw new Error('Application is not eligible for payment');return amount;
}
export type PaymentRow={application_id:string;account_id:string;mode:'live'|'test';amount:number;currency:'gbp';session_id:string|null;payment_intent_id:string|null;charge_id:string|null;status:string;paid_at:string|null;refunded_amount:number;created_at:string;updated_at:string};
export function paymentReceipt(row:PaymentRow|null){return row?{status:row.status,amount:row.amount,currency:'GBP',paidAt:row.paid_at,refundedAmount:row.refunded_amount}:null;}
export class StripeMembershipClient{
 private config:PaymentConfig;private transport:typeof fetch;
 constructor(config:PaymentConfig,transport:typeof fetch=fetch){this.config=config;this.transport=transport;}
 async request(path:string,params?:URLSearchParams,idempotency?:string):Promise<Record<string,any>>{
  if(!/^\/(account|checkout\/sessions(?:\/cs_[A-Za-z0-9_]+)?|payment_intents\/pi_[A-Za-z0-9]+|charges\/ch_[A-Za-z0-9]+)(\?[^#]*)?$/.test(path))throw new Error('Invalid Stripe operation');
  const response=await this.transport('https://api.stripe.com/v1'+path,{method:params?'POST':'GET',headers:{Authorization:`Bearer ${this.config.key}`,'Stripe-Version':'2026-09-30.endive',...(params?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotency?{'Idempotency-Key':idempotency}:{})},body:params,cache:'no-store',signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw new Error('Stripe payment service unavailable');return await response.json();
 }
 async verifyAccount(){const a=await this.request('/account');if(a.id!==this.config.account||a.charges_enabled!==true)throw new Error('Stripe live account is not ready');}
 async create(a:PaymentApplication){
  const amount=applicationAmount(a,this.config);await this.verifyAccount();
  const params=new URLSearchParams({mode:'payment',client_reference_id:a.id,customer_email:a.answers.email,
   success_url:`${this.config.origin}/membership/payment?application_id=${a.id}&result=return`,cancel_url:`${this.config.origin}/membership/payment?application_id=${a.id}&result=cancelled`,
   'line_items[0][quantity]':'1','line_items[0][price_data][currency]':'gbp','line_items[0][price_data][unit_amount]':String(amount),
   'line_items[0][price_data][product_data][name]':amount===MEMBERSHIP_PAYMENT_TEST_FEE*100?'ICSH website payment test':`ICSH ${a.category==='pensioner'?'Pensioner':'Standard'} Membership · 12 months`,
   'metadata[purpose]':'icsh_website_membership_v1','metadata[application_id]':a.id,'metadata[account_id]':this.config.account,
   'payment_intent_data[metadata][purpose]':'icsh_website_membership_v1','payment_intent_data[metadata][application_id]':a.id,
   integration_identifier:'icsh_membership_portal_zqvnmhtr','adaptive_pricing[enabled]':'false'});
  const session=await this.request('/checkout/sessions',params,`icsh-membership-v1-${this.config.account}-${this.config.mode}-${a.id}`);
  this.validateSession(session,a);return session;
 }
 async retrieve(id:string){if(!/^cs_[A-Za-z0-9_]{10,250}$/.test(id))throw new Error('Invalid checkout');return this.request('/checkout/sessions/'+id+'?expand[]=payment_intent.latest_charge');}
 validateSession(session:Record<string,any>,a:PaymentApplication){
  const amount=applicationAmount(a,this.config);
  if(!/^cs_[A-Za-z0-9_]+$/.test(session.id)||session.livemode!==(this.config.mode==='live')||session.mode!=='payment'||session.currency!=='gbp'||session.amount_total!==amount||session.client_reference_id!==a.id||session.metadata?.purpose!=='icsh_website_membership_v1'||session.metadata?.application_id!==a.id||session.metadata?.account_id!==this.config.account)throw new Error('Checkout does not match this application');
 }
 checkoutUrl(session:Record<string,any>){let url;try{url=new URL(session.url);}catch{throw new Error('Checkout unavailable');}if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')throw new Error('Checkout unavailable');return url.href;}
 verifiedOutcome(session:Record<string,any>,a:PaymentApplication){
  this.validateSession(session,a);
  if(session.payment_status!=='paid')return {status:session.status==='expired'?'expired':'pending',paymentIntentId:null,chargeId:null,paidAt:null,refundedAmount:0};
  const pi=session.payment_intent,charge=pi?.latest_charge;
  if(session.status!=='complete'||!pi||typeof pi!=='object'||!/^pi_[A-Za-z0-9]+$/.test(pi.id)||pi.livemode!==(this.config.mode==='live')||pi.status!=='succeeded'||pi.amount!==a.feePence||pi.amount_received!==a.feePence||pi.currency!=='gbp'||!charge||typeof charge!=='object'||!/^ch_[A-Za-z0-9]+$/.test(charge.id)||charge.payment_intent!==pi.id||charge.paid!==true||charge.captured!==true||charge.status!=='succeeded'||charge.amount!==a.feePence||charge.currency!=='gbp'||charge.livemode!==(this.config.mode==='live')||!Number.isSafeInteger(charge.created)||!Number.isSafeInteger(charge.amount_refunded)||charge.amount_refunded<0||charge.amount_refunded>a.feePence)throw new Error('Payment evidence could not be verified');
  return {status:charge.disputed?'disputed':charge.amount_refunded===a.feePence?'refunded':charge.amount_refunded>0?'partially_refunded':'paid',paymentIntentId:pi.id as string,chargeId:charge.id as string,paidAt:new Date(charge.created*1000).toISOString(),refundedAmount:charge.amount_refunded as number};
 }
}
