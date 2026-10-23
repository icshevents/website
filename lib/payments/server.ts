import 'server-only';
import {createHmac} from 'node:crypto';
import {z} from 'zod';
import {createEventService} from '../event-forms/service.js';
import {signedPublicSession} from '../event-forms/security.js';
import {paymentConfiguration,paymentRequestOrigin} from '../membership-payments/core';
import {sourceSchema,websitePaymentConfiguration,parseDonationAmount,WebsiteStripeClient,paymentCookie,paymentCookieName,paymentHeaders,constantEqual,digest,publicPayment,verifyStripeEvent,type Kind,type Source,type FormPayment} from './core';
const json=(body:unknown,status=200,headers:Record<string,string>={})=>Response.json(body,{status,headers:{...paymentHeaders,...headers}});
export async function boundedBody(request:Request,maximum:number){const reader=request.body?.getReader();if(!reader)return '';let size=0;const chunks:Uint8Array[]=[];try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>maximum){await reader.cancel();throw new Error('Request too large.');}chunks.push(p.value);}}finally{reader.releaseLock();}return Buffer.concat(chunks).toString('utf8');}
async function limit(request:Request,prefix:string,max:number){const key=createHmac('sha256',process.env.SUPABASE_SECRET_KEY||'').update(prefix+':'+(request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')||'local').split(',')[0]).digest('hex');const r=await createEventService().rpc('icsh_event_rate_limit',{p_key:key,p_max:max});if(r.error||r.data!==true)throw new Error('RATE_LIMIT');}
export async function paymentSource(kind:string,id:string,capability?:string):Promise<Source|null>{
 if(!['donation','event'].includes(kind)||!z.uuid().safeParse(id).success)return null;
 const r=await createEventService().rpc('icsh_form_payment_source',{p_kind:kind,p_id:id});if(r.error)throw new Error('Source unavailable.');if(!r.data)return null;const s=sourceSchema.parse(r.data);
 if(s.kind!==kind||s.id!==id)return null;if(capability!==undefined&&(!/^[a-f0-9]{64}$/.test(capability)||!constantEqual(digest(capability),s.capabilityHash)))return null;return s;
}
export async function formPayment(kind:Kind,id:string):Promise<FormPayment|null>{const r=await createEventService().from('icsh_form_payments').select('*').eq('source_kind',kind).eq('source_id',id).maybeSingle();if(r.error)throw new Error('Payment status unavailable.');return r.data;}
export async function handleWebsitePayment(request:Request,kind:string,id:string){
 try{
  if(request.method==='POST'&&(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json')))return json({error:'Open this payment on the ICSH website.'},403);
  await limit(request,request.method==='POST'?'website-checkout':'website-payment-read',request.method==='POST'?20:100);
  const capability=request.headers.get('x-payment-receipt')||'';const s=await paymentSource(kind,id,capability);if(!s)return json({error:'Payment not found. Open your saved confirmation.'},404);
  const configured=websitePaymentConfiguration(),config=configured?paymentRequestOrigin(configured,request.url):null,p=await formPayment(s.kind,s.id);
  if(request.method==='GET')return json({available:Boolean(config&&s.mode===config.mode&&s.amount>=30),canPay:s.eligible,reference:s.reference,amount:s.amount,payment:publicPayment(p)});
  if(JSON.stringify(JSON.parse(await boundedBody(request,1024)))!=='{}')return json({error:'Invalid payment request.'},400);
  if(!config||s.mode!==config.mode)return json({error:'Online payment is currently unavailable. Your details remain saved.'},503);
  const headers={'Set-Cookie':`${paymentCookieName}=${paymentCookie(s.kind,s.id,capability,process.env.SUPABASE_SECRET_KEY||'')}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400`};
  if(p&&['paid','partially_refunded','refunded','disputed'].includes(p.status))return json({returnUrl:`/payment?kind=${s.kind}&id=${s.id}`},200,headers);
  if(!s.eligible)return json({error:'This booking is no longer available for payment. Contact ICSH with your reference.'},409);
  const db=createEventService(),prepared=await db.rpc('icsh_form_payment_prepare',{p_kind:s.kind,p_id:s.id,p_account:config.account,p_mode:config.mode});if(prepared.error||!prepared.data)throw new Error('Payment preparation failed.');
  const payment=prepared.data as FormPayment,client=new WebsiteStripeClient(config);let session;
  if(payment.session_id){session=await client.client.retrieve(payment.session_id);client.validate(session,s);}
  else{if(Date.now()-Date.parse(payment.created_at)>22*3600000)return json({error:'This payment needs an ICSH check before retrying.'},409);session=await client.create(s);const attached=await db.rpc('icsh_form_payment_attach',{p_kind:s.kind,p_id:s.id,p_account:config.account,p_mode:config.mode,p_session:session.id});if(attached.error)throw new Error('Payment mapping failed.');}
  if(session.payment_status==='paid'||session.status==='complete')return json({returnUrl:`/payment?kind=${s.kind}&id=${s.id}`},200,headers);
  if(session.status!=='open')return json({error:'This checkout has expired. Contact ICSH before starting another booking.'},409);
  return json({url:client.client.checkoutUrl(session)},200,headers);
 }catch(error){if(error instanceof SyntaxError)return json({error:'Invalid request.'},400);if(error instanceof Error&&error.message==='RATE_LIMIT')return json({error:'Too many requests. Please wait ten minutes.'},429);return json({error:'Payment could not be opened. Your details remain saved. Retry this same confirmation.'},503);}
}
const donationInput=z.object({id:z.uuid(),capability:z.string().regex(/^[a-f0-9]{64}$/),amount:z.string().max(30),firstName:z.string().trim().max(80),lastName:z.string().trim().max(80),email:z.union([z.literal(''),z.email().max(254)]).transform(s=>s.toLowerCase()),website:z.literal('')}).strict();
export async function handleDonations(request:Request){
 try{
  const config=websitePaymentConfiguration();if(!config)return json({error:'Online donations are currently unavailable.'},503);
  const secret=createHmac('sha256',process.env.SUPABASE_SECRET_KEY||'').update('icsh-donation-session').digest('hex'),cookieName='__Host-icsh-donations';
  const existing=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);const session=signedPublicSession(secret,existing);
  if(request.method==='GET')return json({csrf:session.csrf},200,{'Set-Cookie':`${cookieName}=${session.cookie}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800`});
  if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json')||!existing||existing!==session.cookie||!constantEqual(request.headers.get('x-csrf-token')||'',session.csrf))return json({error:'Your session changed. Reload and try again.'},403);
  await limit(request,'donation-save',20);const parsed=donationInput.safeParse(JSON.parse(await boundedBody(request,4096)));if(!parsed.success)return json({error:'Check your donation amount and contact details.'},400);
  const v=parsed.data;let amount;try{amount=parseDonationAmount(v.amount);}catch(e){return json({error:e instanceof Error?e.message:'Invalid amount.'},400);}
  if(/[<>\u0000-\u001f]/.test(v.firstName+v.lastName))return json({error:'Enter a valid name.'},400);
  const requestHash=digest(JSON.stringify({amount,firstName:v.firstName,lastName:v.lastName,email:v.email,mode:config.mode}));const saved=await createEventService().rpc('icsh_donation_save',{p_id:v.id,p_request_hash:requestHash,p_capability_hash:digest(v.capability),p_amount:amount,p_first_name:v.firstName,p_last_name:v.lastName,p_email:v.email,p_mode:config.mode});
  if(saved.error)return json({error:'This donation request changed. Retry the same details or start a new donation.'},409);return json(saved.data,201);
 }catch(e){return json({error:e instanceof Error&&e.message==='RATE_LIMIT'?'Too many requests. Please wait ten minutes.':'Your donation could not be saved. Retry the same details.'},e instanceof SyntaxError?400:503);}
}
const supported=new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','charge.refunded','charge.dispute.created']);
export async function handleWebsiteStripeWebhook(request:Request):Promise<Response|null>{
 const config=paymentConfiguration(process.env,false);if(!config)return null;let event;
 try{event=verifyStripeEvent(await boundedBody(request,256000),request.headers.get('stripe-signature')||'',config);}catch{return json({error:'Invalid webhook.'},400);}
 if(!supported.has(event.type))return null;
 try{
  const client=new WebsiteStripeClient(config);let object=event.data.object,sessionId:unknown;
  if(event.type.startsWith('checkout.session.'))sessionId=object.id;
  else{if(typeof object.payment_intent!=='string'||!/^pi_[A-Za-z0-9]+$/.test(object.payment_intent))return null;object=await client.client.request('/payment_intents/'+object.payment_intent);}
  const metadata=object.metadata as Record<string,unknown>|undefined;if(metadata?.purpose!=='icsh_website_payment_v1')return null;
  if(typeof metadata.source_kind!=='string'||typeof metadata.source_id!=='string')throw new Error('Missing source.');
  const s=await paymentSource(metadata.source_kind,metadata.source_id);if(!s||s.mode!==config.mode)throw new Error('Payment source unavailable.');const p=await formPayment(s.kind,s.id);if(!p||p.account_id!==config.account||p.mode!==config.mode)throw new Error('Payment mapping unavailable.');
  sessionId||=p.session_id;if(typeof sessionId!=='string'||sessionId!==p.session_id)throw new Error('Payment mapping mismatch.');
  const session=await client.client.retrieve(sessionId),outcome=client.outcome(session,s);if(event.type==='checkout.session.async_payment_failed'&&outcome.status==='pending')outcome.status='failed';
  const saved=await createEventService().rpc('icsh_form_payment_record',{p_kind:s.kind,p_id:s.id,p_account:config.account,p_mode:config.mode,p_session:sessionId,p_event:event.id,p_event_type:event.type,p_status:outcome.status,p_amount:s.amount,p_intent:outcome.intent,p_charge:outcome.charge,p_paid_at:outcome.paidAt,p_refunded:outcome.refunded});if(saved.error)throw new Error('Payment not recorded.');return json({received:true});
 }catch{console.error('ICSH_WEBSITE_PAYMENT_RECONCILIATION_PENDING');return json({error:'Payment reconciliation pending. Retry delivery.'},503);}
}
