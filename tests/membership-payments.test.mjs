import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {paymentConfiguration,applicationAmount,paymentReturnCookie,readPaymentReturnCookie,verifyStripeEvent,StripeMembershipClient,paymentReceipt} from '../lib/membership-payments/core.ts';
const live={STRIPE_MEMBERSHIP_PAYMENTS_ENABLED:'true',VERCEL_ENV:'production',STRIPE_SECRET_KEY:'rk_live_fixtureonly',STRIPE_WEBHOOK_SECRET:'whsec_fixtureonly',STRIPE_ACCOUNT_ID:'acct_fixture',STRIPE_SITE_URL:'https://website-icsh.vercel.app'};
const config=()=>paymentConfiguration(live);
const app={id:'11111111-1111-4111-8111-111111111111',reference:'MEM-FIXTURE',mode:'live',category:'standard',feePence:2000,currency:'GBP',answers:{email:'fictional@example.invalid'}};
const session=(change={})=>({id:'cs_live_fixture12345',livemode:true,mode:'payment',currency:'gbp',amount_total:2000,client_reference_id:app.id,status:'open',payment_status:'unpaid',url:'https://checkout.stripe.com/c/pay/cs_live_fixture12345',metadata:{purpose:'icsh_website_membership_v1',application_id:app.id,account_id:'acct_fixture'},...change});
const paid=()=>session({status:'complete',payment_status:'paid',payment_intent:{id:'pi_fixture',livemode:true,status:'succeeded',amount:2000,amount_received:2000,currency:'gbp',latest_charge:{id:'ch_fixture',payment_intent:'pi_fixture',paid:true,captured:true,status:'succeeded',amount:2000,currency:'gbp',livemode:true,created:1792740000,amount_refunded:0,disputed:false}}});
test('the saved Test Test rate creates and verifies a GBP 1 checkout without permitting other discounted names',async()=>{
 const a={...app,feePence:100,answers:{...app.answers,firstName:' Test ',lastName:'tEsT'}};
 assert.equal(applicationAmount(a,config()),100);
 for(const names of [{firstName:'Alex',lastName:'Test'},{firstName:'Test',lastName:'Tester'},{firstName:undefined,lastName:'Test'}])assert.throws(()=>applicationAmount({...a,answers:{...a.answers,...names}},config()));
 assert.equal(applicationAmount({...a,feePence:2000},config()),2000); // Existing saved checkouts retain their original fee.
 const client=new StripeMembershipClient(config(),async(url,options)=>{
  if(url.endsWith('/account'))return Response.json({id:'acct_fixture',charges_enabled:true});
  assert.equal(options.body.get('line_items[0][price_data][unit_amount]'),'100');assert.equal(options.body.get('line_items[0][price_data][product_data][name]'),'ICSH website payment test');
  return Response.json(session({amount_total:100}));
 });await client.create(a);
 const settled=paid();settled.amount_total=100;settled.payment_intent.amount=100;settled.payment_intent.amount_received=100;settled.payment_intent.latest_charge.amount=100;
 assert.equal(client.verifiedOutcome(settled,a).status,'paid');settled.payment_intent.latest_charge.amount=2000;assert.throws(()=>client.verifiedOutcome(settled,a));
});
test('live config requires separate live key, signing secret, account and trusted site; missing config fails closed',()=>{
 assert.ok(config());
 assert.ok(paymentConfiguration({...live,STRIPE_MEMBERSHIP_PAYMENTS_ENABLED:'false'},false));
 for(const change of [{STRIPE_MEMBERSHIP_PAYMENTS_ENABLED:'false'},{STRIPE_SECRET_KEY:'rk_test_fixture'},{STRIPE_WEBHOOK_SECRET:''},{STRIPE_ACCOUNT_ID:''},{STRIPE_SITE_URL:'https://evil.example'},{STRIPE_SITE_URL:'https://website-icsh.vercel.app/foo'},{VERCEL_ENV:'development'}])assert.equal(paymentConfiguration({...live,...change}),null);
 assert.equal(paymentConfiguration({...live,VERCEL_ENV:'preview'}),null);
 assert.ok(paymentConfiguration({...live,VERCEL_ENV:'preview',STRIPE_SECRET_KEY:'rk_test_fixture',STRIPE_SITE_URL:'https://website-fixture-icsh.vercel.app'}));
});
test('server uses saved membership fees and denies free, mismatched, or cross-environment applications',()=>{
 assert.equal(applicationAmount(app,config()),2000);assert.equal(applicationAmount({...app,category:'pensioner',feePence:1500},config()),1500);
 for(const changes of [{feePence:1},{category:'student',feePence:0},{mode:'test'},{currency:'USD'},{category:'pensioner',feePence:2000}])assert.throws(()=>applicationAmount({...app,...changes},config()));
});
test('private payment return cookie is signed, time-limited and bound to its application capability',()=>{
 const now=1792740000000,token='a'.repeat(64),secret='fixture return signing secret',cookie=paymentReturnCookie(app.id,token,secret,now);
 assert.deepEqual(readPaymentReturnCookie(cookie,secret,now),{id:app.id,capability:token});
 assert.equal(readPaymentReturnCookie(cookie,secret,now+86400001),null);assert.equal(readPaymentReturnCookie(cookie+'0',secret,now),null);assert.equal(readPaymentReturnCookie(cookie,'different secret',now),null);
});
test('webhook verification rejects forged, stale, future, tampered, wrong-account and wrong-mode events',()=>{
 const now=1792740000000,base={id:'evt_fixture',type:'checkout.session.completed',livemode:true,data:{object:{id:'cs_live_fixture12345'}}};
 const sign=(text,t=now/1000)=>`t=${t},v1=${createHmac('sha256',config().webhookSecret).update(`${t}.${text}`).digest('hex')}`;
 const raw=JSON.stringify(base);assert.equal(verifyStripeEvent(raw,sign(raw),config(),now).id,base.id);
 assert.equal(verifyStripeEvent(raw,sign(raw)+',v1='+'0'.repeat(64),config(),now).id,base.id);
 for(const [text,header]of [[raw,sign(raw,now/1000-301)],[raw,sign(raw,now/1000+301)],[raw,`t=${now/1000},v1=${'0'.repeat(64)}`],[raw+' ',sign(raw)]])assert.throws(()=>verifyStripeEvent(text,header,config(),now));
 for(const changes of [{livemode:false},{account:'acct_other'}]){const text=JSON.stringify({...base,...changes});assert.throws(()=>verifyStripeEvent(text,sign(text),config(),now));}
});
test('Checkout is one-off GBP and idempotent per saved application, with private return cookie rather than capability in URLs',async()=>{
 const keys=[];const client=new StripeMembershipClient(config(),async(url,options)=>{
  if(url.endsWith('/account'))return Response.json({id:'acct_fixture',charges_enabled:true});
  assert.equal(url,'https://api.stripe.com/v1/checkout/sessions');const p=options.body;assert.equal(p.get('mode'),'payment');assert.equal(p.get('line_items[0][price_data][unit_amount]'),'2000');assert.equal(p.get('line_items[0][price_data][currency]'),'gbp');assert.equal(p.get('client_reference_id'),app.id);assert.equal(p.has('payment_method_types'),false);assert.equal(p.get('adaptive_pricing[enabled]'),'false');assert.doesNotMatch(p.toString(),/receiptToken|capability|recurring|subscription|dob|mobile/);keys.push(options.headers['Idempotency-Key']);return Response.json(session());
 });
 await client.create(app);await client.create(app);assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
});
test('wrong live account and unready Stripe account cannot create a checkout',async()=>{
 for(const a of [{id:'acct_other',charges_enabled:true},{id:'acct_fixture',charges_enabled:false}]){
  let calls=0;const client=new StripeMembershipClient(config(),async()=>{calls++;return Response.json(a)});await assert.rejects(()=>client.create(app));assert.equal(calls,1);
 }
});
test('paid status requires complete session, correct PI, captured successful charge and matching amount',()=>{
 const client=new StripeMembershipClient(config());const evidence=paid();assert.equal(client.verifiedOutcome(evidence,app).status,'paid');
 assert.equal(client.verifiedOutcome(session(),app).status,'pending');assert.equal(client.verifiedOutcome(session({status:'expired'}),app).status,'expired');
 for(const changes of [{livemode:false},{currency:'usd'},{amount_total:1},{client_reference_id:'another'},{status:'open'},{payment_intent:null},{payment_intent:'pi_fixture'}])assert.throws(()=>client.verifiedOutcome({...evidence,...changes},app));
 for(const changes of [{status:'processing'},{amount_received:1},{amount:1},{livemode:false}])assert.throws(()=>client.verifiedOutcome({...evidence,payment_intent:{...evidence.payment_intent,...changes}},app));
 for(const changes of [{captured:false},{paid:false},{status:'failed'},{amount:1},{payment_intent:'pi_other'},{amount_refunded:2001}])assert.throws(()=>client.verifiedOutcome({...evidence,payment_intent:{...evidence.payment_intent,latest_charge:{...evidence.payment_intent.latest_charge,...changes}}},app));
});
test('refunds and disputes use authoritative charge state and preserve the original payment time',()=>{
 const client=new StripeMembershipClient(config());
 for(const [changes,status]of [[{amount_refunded:500},'partially_refunded'],[{amount_refunded:2000},'refunded'],[{disputed:true},'disputed']]){
  const s=paid();Object.assign(s.payment_intent.latest_charge,changes);const r=client.verifiedOutcome(s,app);assert.equal(r.status,status);assert.equal(r.paidAt,new Date(1792740000000).toISOString());
 }
});
test('provider failures do not expose diagnostics; Checkout URLs cannot redirect off Stripe',async()=>{
 const client=new StripeMembershipClient(config(),async()=>Response.json({error:{message:'private provider details'}},{status:403}));await assert.rejects(()=>client.verifyAccount(),e=>!e.message.includes('private provider details'));
 const c=new StripeMembershipClient(config());for(const url of ['https://evil.example','http://checkout.stripe.com/pay','https://checkout.stripe.com.evil.example'])assert.throws(()=>c.checkoutUrl({url}));
 assert.equal(c.checkoutUrl(session()),session().url);
});
test('public payment receipts omit Stripe IDs, account IDs and internal application fields',()=>{
 const publicValue=paymentReceipt({status:'paid',amount:2000,paid_at:'2026-10-23T12:00:00Z',refunded_amount:0,session_id:'private-session',payment_intent_id:'private-intent',account_id:'private-account'});
 assert.deepEqual(publicValue,{status:'paid',amount:2000,currency:'GBP',paidAt:'2026-10-23T12:00:00Z',refundedAmount:0});assert.equal(paymentReceipt(null),null);
});
