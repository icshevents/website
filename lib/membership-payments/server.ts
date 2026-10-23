import 'server-only';
import {createEventService} from '../event-forms/service.js';
import {getMembershipApplication} from '../membership-applications/store';
import {paymentConfiguration,constantEqual,digest,paymentHeaders,paymentReceipt,paymentReturnCookie,returnCookie,StripeMembershipClient,verifyStripeEvent,type PaymentApplication,type PaymentRow,type PaymentConfig} from './core';
export {paymentConfiguration} from './core';
const json=(body:unknown,status=200,extra={})=>Response.json(body,{status,headers:{...paymentHeaders,...extra}});
async function boundedBody(request:Request,maximum:number){
 if(!request.body)throw new Error('INVALID_BODY');const reader=request.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>maximum){await reader.cancel();throw new Error('INVALID_BODY');}chunks.push(r.value);}return Buffer.concat(chunks).toString('utf8');}finally{reader.releaseLock();}
}
async function limited(request:Request,prefix:string,maximum:number){
 const db=createEventService();const address=(request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')||'local').split(',')[0];
 const key=digest(`${process.env.SUPABASE_SECRET_KEY}:membership-payments:${prefix}:${address}`);
 const r=await db.rpc('icsh_event_rate_limit',{p_key:'membership-payment:'+key,p_max:maximum});if(r.error||r.data!==true)throw new Error('PAYMENT_RATE_LIMIT');
}
export async function authorisedPaymentApplication(id:string,capability:string){
 if(!/^[a-f0-9-]{36}$/i.test(id)||!/^[a-f0-9]{64}$/.test(capability))return null;
 const application=await getMembershipApplication(id);
 return application&&constantEqual(application.capabilityHash,digest(capability))?application:null;
}
export async function membershipPayment(id:string,db=createEventService()):Promise<PaymentRow|null>{
 const r=await db.from('icsh_membership_payments').select('*').eq('application_id',id).maybeSingle();if(r.error)throw new Error('PAYMENT_STORE_UNAVAILABLE');return r.data;
}
/** Call only after organiser access has been verified. */
export async function membershipPaymentsForOrganiser(ids:string[]):Promise<Map<string,PaymentRow>>{
 if(!ids.length)return new Map();const r=await createEventService().from('icsh_membership_payments').select('*').in('application_id',ids);
 if(r.error)throw new Error('PAYMENT_STORE_UNAVAILABLE');return new Map((r.data as PaymentRow[]).map(p=>[p.application_id,p]));
}
async function saveCheckout(id:string,sessionId:string,config:PaymentConfig){
 const r=await createEventService().rpc('icsh_membership_payment_attach',{p_application_id:id,p_session_id:sessionId,p_account_id:config.account,p_mode:config.mode});if(r.error)throw new Error('CHECKOUT_MAPPING_UNAVAILABLE');return r.data as PaymentRow;
}
export async function handleMembershipPayment(request:Request,id:string){
 try{
  if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed.'},405);
  if(request.method==='POST'&&(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json')))return json({error:'Open the payment step on the ICSH website.'},403);
  await limited(request,request.method==='POST'?'checkout':'status',request.method==='POST'?15:100);
  const capability=request.headers.get('x-membership-receipt')||'';
  const application=await authorisedPaymentApplication(id,capability);
  if(!application)return json({error:'Application not found. Use your saved application confirmation.'},404);
  const config=paymentConfiguration();
  if(request.method==='GET'){
   if(application.feePence===0)return json({available:false,paymentRequired:false,payment:null});
   if(!config)return json({available:false,paymentRequired:true,payment:null});
   const payment=await membershipPayment(id);
   return json({available:application.mode===config.mode,paymentRequired:true,payment:paymentReceipt(payment)});
  }
  if(JSON.stringify(JSON.parse(await boundedBody(request,1024)))!=='{}')return json({error:'Invalid payment request.'},400);
  if(application.feePence===0)return json({paymentRequired:false});
  if(!config)return json({error:'Online membership payments are not available yet. Your application remains saved.'},503);
  const db=createEventService();
  const prepared=await db.rpc('icsh_membership_payment_prepare',{p_application_id:id,p_account_id:config.account,p_mode:config.mode});
  if(prepared.error||!prepared.data)throw new Error('PAYMENT_PREPARATION_FAILED');
  let payment=prepared.data as PaymentRow;
  const cookie=`${returnCookie}=${paymentReturnCookie(id,capability,process.env.SUPABASE_SECRET_KEY||'')}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400`;
  if(['paid','partially_refunded','refunded','disputed'].includes(payment.status))return json({paymentRequired:false,payment:paymentReceipt(payment),returnUrl:`/membership/payment?application_id=${id}`},200,{'Set-Cookie':cookie});
  const client=new StripeMembershipClient(config);
  let session;
  if(payment.session_id){session=await client.retrieve(payment.session_id);client.validateSession(session,application);}
  else{
   // Stripe may discard idempotency keys after 24 hours. Never recreate a
   // potentially charged checkout after its mapping was lost beyond that window.
   if(Date.now()-Date.parse(payment.created_at)>22*3600000)return json({error:'This payment needs an organiser check before retrying. Please contact ICSH with your application reference.'},409);
   session=await client.create(application);payment=await saveCheckout(id,session.id,config);
  }
  if(session.payment_status==='paid'||session.status==='complete')return json({paymentRequired:false,returnUrl:`/membership/payment?application_id=${id}`,payment:paymentReceipt(payment)},200,{'Set-Cookie':cookie});
  if(session.status!=='open')return json({error:'This checkout has expired. Contact ICSH with your application reference before starting another payment.'},409);
  return json({paymentRequired:true,url:client.checkoutUrl(session)},200,{'Set-Cookie':cookie});
 }catch(error){
  if(error instanceof SyntaxError)return json({error:'Invalid payment request.'},400);
  if(error instanceof Error&&error.message==='PAYMENT_RATE_LIMIT')return json({error:'Too many payment checks. Please wait ten minutes before retrying.'},429);
  return json({error:'Payment could not be opened or checked. Your application is saved. Retry this same confirmation, or contact ICSH with its reference.'},503);
 }
}
const supported=new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','charge.refunded','charge.dispute.created']);
export async function handleStripeMembershipWebhook(request:Request){
 const config=paymentConfiguration(process.env,false);if(!config)return json({error:'Webhook unavailable.'},503);
 let event;
 try{event=verifyStripeEvent(await boundedBody(request,256000),request.headers.get('stripe-signature')||'',config);}catch{return json({error:'Invalid webhook.'},400);}
 if(!supported.has(event.type))return json({received:true});
 try{
  const client=new StripeMembershipClient(config),object=event.data.object;
  let id:unknown,sessionId:unknown;
  if(event.type.startsWith('checkout.session.')){
   const metadata=object.metadata as Record<string,unknown>|undefined;
   if(metadata?.purpose!=='icsh_website_membership_v1')return json({received:true});
   id=metadata.application_id;sessionId=object.id;
  }else{
   const piId=object.payment_intent;if(typeof piId!=='string'||!/^pi_[A-Za-z0-9]+$/.test(piId))return json({received:true});
   const pi=await client.request('/payment_intents/'+piId);
   if(pi.metadata?.purpose!=='icsh_website_membership_v1')return json({received:true});
   id=pi.metadata.application_id;
  }
  if(typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id))throw new Error('INVALID_EVENT_REFERENCE');
  const app=await getMembershipApplication(id);if(!app||app.mode!==config.mode)throw new Error('APPLICATION_NOT_FOUND');
  const payment=await membershipPayment(id);if(!payment||payment.account_id!==config.account||payment.mode!==config.mode)throw new Error('PAYMENT_NOT_FOUND');
  if(!sessionId)sessionId=payment.session_id;
  if(typeof sessionId!=='string')throw new Error('CHECKOUT_MAPPING_PENDING');
  const session=await client.retrieve(sessionId);const outcome=client.verifiedOutcome(session,app as PaymentApplication);
  if(event.type==='checkout.session.async_payment_failed'&&outcome.status==='pending')outcome.status='failed';
  const db=createEventService();const r=await db.rpc('icsh_membership_payment_record',{
   p_application_id:id,p_account_id:config.account,p_mode:config.mode,p_session_id:sessionId,
   p_event_id:event.id,p_event_type:event.type,p_status:outcome.status,p_amount:app.feePence,
   p_payment_intent_id:outcome.paymentIntentId,p_charge_id:outcome.chargeId,p_paid_at:outcome.paidAt,p_refunded_amount:outcome.refundedAmount,
  });
  if(r.error)throw new Error('PAYMENT_EVENT_NOT_SAVED');
  return json({received:true});
 }catch{
  // A non-2xx response causes Stripe to retry. Never acknowledge an unsaved
  // website payment, expose provider diagnostics, or call the Zoho webhook.
  console.error('ICSH_MEMBERSHIP_PAYMENT_RECONCILIATION_PENDING');
  return json({error:'Payment reconciliation pending. Retry delivery.'},503);
 }
}
