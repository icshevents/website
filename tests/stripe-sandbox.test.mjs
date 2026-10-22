import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {sandboxConfiguration,newSandboxSession,validSandboxSession,sandboxCsrf,sandboxQuote,StripeSandboxClient} from '../lib/stripe-sandbox.ts';
const key='sk_test_fixtureonly';
const env={VERCEL_ENV:'preview',STRIPE_SECRET_KEY:key,VERCEL_URL:'website-fixture-icsh.vercel.app'};
const answers={kind:'new',firstName:'Fictional',lastName:'Sandbox',dob:'01/01/1990',email:'icsh-stripe-test@example.invalid',mobile:'07700900123',education:'no',studentDeclaration:false,terms:true,accuracy:true};
const input=(changes={})=>sandboxQuote({requestKey:randomUUID(),answers:{...answers,...changes}},'2026-10-22');
const hash=s=>createHash('sha256').update(s).digest('hex');
const result=(session,changes={})=>({id:'cs_test_123456789012345',livemode:false,mode:'payment',amount_total:2000,currency:'gbp',status:'complete',payment_status:'paid',url:'https://checkout.stripe.com/c/pay/cs_test_123456789012345',client_reference_id:'ICSH-SANDBOX-reference',metadata:{purpose:'icsh_membership_sandbox',browser:hash(session),category:'standard',amount:'2000',reference:'ICSH-SANDBOX-reference'},...changes});
test('sandbox fails closed in production, development, missing config and live keys',()=>{
 assert.ok(sandboxConfiguration(env));
 for(const changes of [{VERCEL_ENV:'production'},{VERCEL_ENV:'development'},{VERCEL_ENV:undefined},{STRIPE_SECRET_KEY:'sk_live_fixtureonly'},{STRIPE_SECRET_KEY:undefined},{VERCEL_URL:'evil.example'},{VERCEL_URL:'website-icsh.vercel.app'}])assert.equal(sandboxConfiguration({...env,...changes}),null);
});
test('signed browser sessions expire and reject tampering or another secret',()=>{
 const now=1792650000000,s=newSandboxSession(key,now);
 assert.equal(validSandboxSession(s,key,now),true);assert.equal(validSandboxSession(s,key,now+3600001),false);assert.equal(validSandboxSession(s+'0',key,now),false);assert.equal(validSandboxSession(s,'other',now),false);assert.notEqual(sandboxCsrf(s,key),sandboxCsrf(newSandboxSession(key,now),key));
});
test('membership fees are server-calculated for joining and renewal; minors and invented fields fail',()=>{
 assert.equal(input().amount,2000);assert.equal(input({kind:'renewal'}).amount,2000);assert.equal(input({dob:'01/01/1950'}).amount,1500);assert.equal(input({dob:'01/01/2007',education:'yes',studentDeclaration:true}).amount,0);
 for(const changes of [{dob:'01/01/2015'},{dob:'30/02/1990'},{dob:'01/01/2007',education:'yes'},{email:'real@example.com'},{terms:false},{amount:1},{payment_status:'paid'}])assert.throws(()=>input(changes));
 assert.throws(()=>sandboxQuote({requestKey:randomUUID(),answers,amount:1}));
});
test('Checkout uses GBP and calculated fee, no recurring billing, one retry key and no applicant DOB metadata',async()=>{
 const session=newSandboxSession(key),body=input();let lastKey,requests=0;
 const client=new StripeSandboxClient(key,async(url,options)=>{
  requests++;assert.equal(url,'https://api.stripe.com/v1/checkout/sessions');const p=options.body;
  assert.equal(p.get('mode'),'payment');assert.equal(p.get('line_items[0][price_data][unit_amount]'),'2000');assert.equal(p.get('line_items[0][price_data][currency]'),'gbp');assert.equal(p.get('success_url'),'https://website-fixture-icsh.vercel.app/membership/sandbox/return?session_id={CHECKOUT_SESSION_ID}');assert.equal(p.has('payment_method_types'),false);assert.doesNotMatch(p.toString(),/1990|recurring|subscription/);
  if(lastKey)assert.equal(options.headers['Idempotency-Key'],lastKey);lastKey=options.headers['Idempotency-Key'];
  return Response.json(result(session,{status:'open',payment_status:'unpaid'}));
 });
 await client.create(body,session,'https://website-fixture-icsh.vercel.app');await client.create(body,session,'https://website-fixture-icsh.vercel.app');assert.equal(requests,2);
});
test('a redirect or browser paid claim cannot establish payment; receipt verifies Stripe and browser binding',async()=>{
 const session=newSandboxSession(key);
 const receipt=async change=>new StripeSandboxClient(key,async()=>Response.json(result(session,change))).receipt('cs_test_123456789012345',session);
 assert.equal((await receipt({})).paid,true);assert.equal((await receipt({status:'open'})).paid,false);assert.equal((await receipt({payment_status:'unpaid'})).paid,false);
 for(const change of [{livemode:true},{currency:'usd'},{amount_total:1},{mode:'subscription'},{client_reference_id:'wrong'},{metadata:{...result(session).metadata,browser:hash('another browser')}},{metadata:{...result(session).metadata,purpose:'another_integration'}}])await assert.rejects(()=>receipt(change));
});
test('provider errors and untrusted Checkout URLs fail without returning provider error text',async()=>{
 const session=newSandboxSession(key);
 for(const change of [{livemode:true},{url:'https://example.com/checkout'},{url:'http://checkout.stripe.com/pay'},{amount_total:1}]){
  const client=new StripeSandboxClient(key,async()=>Response.json(result(session,change)));await assert.rejects(()=>client.create(input(),session,'https://website-fixture-icsh.vercel.app'));
 }
 const client=new StripeSandboxClient(key,async()=>Response.json({error:'private provider diagnostic'},{status:500}));await assert.rejects(()=>client.create(input(),session,'https://website-fixture-icsh.vercel.app'),error=>!error.message.includes('private provider diagnostic'));
});
