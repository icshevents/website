import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDonationAmount,WebsiteStripeClient,paymentCookie,readPaymentCookie,websitePaymentConfiguration} from '../lib/payments/core.ts';
const config={key:'rk_live_fixtureonly',webhookSecret:'whsec_fixtureonly',account:'acct_fixture',mode:'live',origin:'https://website-icsh.vercel.app'};
const source={kind:'donation',id:'11111111-1111-4111-8111-111111111111',mode:'live',amount:1234,currency:'gbp',reference:'DON-FIXTURE',description:'Donation to ICSH',email:'',capabilityHash:'a'.repeat(64),eligible:true};
const session=(changes={})=>({id:'cs_live_fixturecheckout',mode:'payment',livemode:true,currency:'gbp',amount_total:1234,client_reference_id:source.id,metadata:{purpose:'icsh_website_payment_v1',source_kind:'donation',source_id:source.id,account_id:'acct_fixture'},status:'open',payment_status:'unpaid',...changes});
test('donations parse exact pence with provider minimum, upper bound and no floating point coercion',()=>{
 for(const [input,expected]of [['0.30',30],['1',100],['12.34',1234],['100000.00',10000000]])assert.equal(parseDonationAmount(input),expected);
 for(const input of ['0','0.29','-1','1.234','1e2','Infinity',' 1','100000.01',''])assert.throws(()=>parseDonationAmount(input));
});
test('shared return proof is bound to source type, ID, token and expiry',()=>{const now=1792734000000,secret='fictional return secret',cap='b'.repeat(64),cookie=paymentCookie('donation',source.id,cap,secret,now);assert.deepEqual(readPaymentCookie(cookie,secret,now),{kind:'donation',id:source.id,capability:cap});assert.equal(readPaymentCookie(cookie.replace('donation','event'),secret,now),null);assert.equal(readPaymentCookie(cookie+'x',secret,now),null);assert.equal(readPaymentCookie(cookie,secret,now+86400001),null);});
test('donation checkout uses saved pence and source metadata without requiring optional donor details',async()=>{
 const keys=[];const client=new WebsiteStripeClient(config,async(url,options)=>{if(url.endsWith('/account'))return Response.json({id:'acct_fixture',charges_enabled:true});const p=options.body;assert.equal(p.get('line_items[0][price_data][unit_amount]'),'1234');assert.equal(p.get('metadata[source_kind]'),'donation');assert.equal(p.get('payment_intent_data[metadata][source_id]'),source.id);assert.equal(p.has('payment_method_types'),false);assert.equal(p.has('customer_email'),false);assert.equal(p.has('subscription_data'),false);assert.doesNotMatch(p.toString(),/capability|capabilityHash/);keys.push(options.headers['Idempotency-Key']);return Response.json(session());});await client.create(source);await client.create(source);assert.equal(keys[0],keys[1]);
});
test('verified shared payments require exact amount, account, source and captured provider evidence',()=>{
 const client=new WebsiteStripeClient(config);assert.equal(client.outcome(session(),source).status,'pending');
 const paid=session({status:'complete',payment_status:'paid',payment_intent:{id:'pi_fixture',livemode:true,status:'succeeded',amount:1234,amount_received:1234,currency:'gbp',latest_charge:{id:'ch_fixture',payment_intent:'pi_fixture',amount:1234,currency:'gbp',livemode:true,paid:true,captured:true,status:'succeeded',created:1792734000,amount_refunded:0,disputed:false}}});assert.equal(client.outcome(paid,source).status,'paid');
 for(const changes of [{amount_total:1},{livemode:false},{metadata:{...paid.metadata,source_kind:'event'}},{payment_intent:{...paid.payment_intent,amount_received:1}}])assert.throws(()=>client.outcome({...paid,...changes},source));
 paid.payment_intent.latest_charge.amount_refunded=1234;assert.equal(client.outcome(paid,source).status,'refunded');
});
test('closed sources and cross-mode sources cannot create checkout',async()=>{const c=new WebsiteStripeClient(config,async()=>{throw new Error('Unexpected provider request');});for(const change of [{eligible:false},{mode:'test'},{amount:1}])await assert.rejects(()=>c.create({...source,...change}));assert.equal(websitePaymentConfiguration({}),null);});
