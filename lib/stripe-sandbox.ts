import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {getQuote,validateApplication} from './membership-validation.ts';
import {londonDate} from './membership.ts';
import {MEMBERSHIP_PRICING} from './membership-pricing.ts';

// This proof of concept never imports a database or CRM client. Production is denied
// even if a test key is accidentally assigned there in the future.
export function sandboxConfiguration(env:NodeJS.ProcessEnv=process.env){
 const key=env.STRIPE_SECRET_KEY;
 const host=env.VERCEL_URL;
 if(env.VERCEL_ENV!=='preview'||!key||!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key)||!host||!/^website-[a-z0-9-]+-icsh\.vercel\.app$/.test(host))return null;
 return {key,origin:`https://${host}`};
}
export const sandboxHeaders={'Cache-Control':'private, no-store, max-age=0','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
export const sandboxCookie='__Host-icsh-stripe-sandbox';
const hex=/^[a-f0-9]{64}$/;
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const mac=(s:string,key:string)=>createHmac('sha256',key).update(s).digest('hex');
const equal=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function newSandboxSession(key:string,now=Date.now()){
 const payload=`${randomBytes(32).toString('hex')}.${now+3600000}`;
 return `${payload}.${mac(payload,key)}`;
}
export function validSandboxSession(value:string,key:string,now=Date.now()){
 const [token,expires,signature,...extra]=value.split('.');
 return extra.length===0&&hex.test(token||'')&&/^\d{13}$/.test(expires||'')&&Number(expires)>now&&Number(expires)<=now+3600000&&hex.test(signature||'')&&equal(mac(`${token}.${expires}`,key),signature);
}
export const sandboxCsrf=(session:string,key:string)=>mac(`csrf:${session}`,key);
export function sandboxRequestSession(request:Request,key:string){
 const value=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(sandboxCookie+'='))?.slice(sandboxCookie.length+1)||'';
 return validSandboxSession(value,key)?value:null;
}
const answers=z.object({kind:z.enum(['new','renewal']),firstName:z.literal('Fictional'),lastName:z.literal('Sandbox'),dob:z.string().max(10),email:z.literal('icsh-stripe-test@example.invalid'),mobile:z.literal('07700900123'),education:z.enum(['yes','no']),studentDeclaration:z.boolean(),terms:z.literal(true),accuracy:z.literal(true)}).strict();
export function sandboxQuote(input:unknown,on=londonDate()){
 const parsed=z.object({requestKey:z.string().uuid(),answers}).strict().parse(input);
 const errors=validateApplication(parsed.answers,on);
 if(Object.values(errors).some(Boolean))throw new Error('Check the date of birth and required declarations. Applicants must be at least 17.');
 const quote=getQuote(parsed.answers,on);
 if(!quote||!['standard','pensioner','student'].includes(quote.category))throw new Error('Invalid membership category.');
 return {...parsed,quote,amount:Math.round(quote.fee*100)};
}
export type SandboxSession={id:string;livemode:boolean;mode:string;currency:string;amount_total:number;status:string;payment_status:string;url:string|null;metadata:Record<string,string>;client_reference_id:string};
export class StripeSandboxClient {
 private key:string;
 private transport:typeof fetch;
 constructor(key:string,transport:typeof fetch=fetch){this.key=key;this.transport=transport;}
 private async request(path:string,body?:URLSearchParams,idempotencyKey?:string):Promise<SandboxSession>{
  const response=await this.transport(`https://api.stripe.com/v1/checkout/sessions${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${this.key}`,'Stripe-Version':'2026-09-30.endive',...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},body,cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('Stripe sandbox is temporarily unavailable. Retry this same form.');
  const data=await response.json() as SandboxSession;
  if(data.livemode!==false||!/^cs_test_[A-Za-z0-9]+$/.test(data.id))throw new Error('Stripe sandbox verification failed.');
  return data;
 }
 async create(input:ReturnType<typeof sandboxQuote>,session:string,origin:string){
  const reference=`ICSH-SANDBOX-${input.requestKey}`;
  const fingerprint=hash(JSON.stringify(input.answers));
  const body=new URLSearchParams({mode:'payment',client_reference_id:reference,customer_email:'icsh-stripe-test@example.invalid',success_url:`${origin}/membership/sandbox/return?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${origin}/membership/sandbox?cancelled=1`,'line_items[0][quantity]':'1','line_items[0][price_data][currency]':'gbp','line_items[0][price_data][unit_amount]':String(input.amount),'line_items[0][price_data][product_data][name]':`ICSH SANDBOX · ${input.quote.label} · 12 months`,'metadata[purpose]':'icsh_membership_sandbox','metadata[browser]':hash(session),'metadata[category]':input.quote.category,'metadata[amount]':String(input.amount),'metadata[reference]':reference,'payment_intent_data[metadata][purpose]':'icsh_membership_sandbox',integration_identifier:'icsh_membership_sandbox_qjbrmsnt'});
  const result=await this.request('',body,`icsh-sandbox-${hash(session)}-${input.requestKey}-${fingerprint}`);
  const url=result.url?new URL(result.url):null;
  if(!url||url.protocol!=='https:'||url.hostname!=='checkout.stripe.com'||result.amount_total!==input.amount||result.currency!=='gbp')throw new Error('Stripe checkout could not be verified.');
  return {url:result.url,reference,amount:input.amount,category:input.quote.category};
 }
 async receipt(id:string,session:string){
  if(!/^cs_test_[A-Za-z0-9]{10,250}$/.test(id))throw new Error('Invalid sandbox checkout.');
  const r=await this.request('/'+encodeURIComponent(id));
  const expected=r.metadata?.category==='standard'?MEMBERSHIP_PRICING.standardFee*100:r.metadata?.category==='pensioner'?MEMBERSHIP_PRICING.pensionerFee*100:null;
  if(r.mode!=='payment'||r.metadata?.purpose!=='icsh_membership_sandbox'||r.metadata.browser!==hash(session)||expected===null||r.amount_total!==expected||r.metadata.amount!==String(expected)||r.currency!=='gbp'||r.client_reference_id!==r.metadata.reference)throw new Error('This checkout cannot be verified in this browser.');
  return {reference:r.client_reference_id,amount:r.amount_total,category:r.metadata.category,paid:r.status==='complete'&&r.payment_status==='paid',status:r.status,paymentStatus:r.payment_status};
 }
}
