import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {invitationDecision,processInvitation} from '../lib/whatsapp-invitations/core.ts';

const id='09f1db18-6b76-48bb-94f0-29ad9403b0e0';
const today='2026-11-05';
// Fictional numbers only. The real sender, test recipient and group URL remain private.
const config={enabled:true,approved:true,accountId:'acct_fixture',sender:'+447700900992',templateName:'icsh_paid_member_group_invitation',category:'utility',applicationsFrom:'2026-11-05T00:00:00Z'};
function snapshot(){return {
 application:{id,reference:'ICSH-TEST',mode:'live',testData:false,createdAt:'2026-11-05T10:00:00Z',deletedAt:null,applicationStatus:'received',category:'standard',feePence:2000,currency:'GBP',biginRecordId:'123',biginSyncStatus:'synced',answers:{kind:'new',mobile:'07700900993',whatsappInvitation:true}},
 payment:{application_id:id,account_id:'acct_fixture',mode:'live',amount:2000,currency:'gbp',status:'paid',paid_at:'2026-11-05T10:01:00Z',payment_intent_id:'pi_fixture',charge_id:'ch_fixture',refunded_amount:0},
 activation:{application_id:id,account_id:'acct_fixture',activation_kind:'paid',status:'active',contact_id:'123',payment_intent_id:'pi_fixture',paid_at:'2026-11-05T10:01:00Z',start_date:today,expiry_date:'2027-11-05'}
};}
const decide=(s,c=config)=>invitationDecision(s,c,today);
function fixture(initial=snapshot()){
 let current=initial,claimed=false,requests=0,reads=0;
 const outcomes=[];
 return {get requests(){return requests;},get reads(){return reads;},get claimed(){return claimed;},set current(s){current=s;},outcomes,
  deps:{read:async()=>{reads++;return structuredClone(current);},claim:async()=>{if(claimed)return null;claimed=true;return {token:randomUUID()};},request:async()=>{requests++;return 'accepted';},finish:async(_id,_token,outcome)=>{outcomes.push(outcome);}}};
}

test('eligible verified paid activation produces one private request for the matched contact',()=>{
 const d=decide(snapshot());assert.equal(d.eligible,true);assert.deepEqual(d.request,{applicationId:id,contactId:'123',recipient:'+447700900993',paymentIntentId:'pi_fixture',startDate:today,expiryDate:'2027-11-05',templateName:config.templateName,category:'utility',sender:config.sender,accountId:'acct_fixture'});
 const renewal=snapshot();renewal.application.answers.kind='renewal';assert.equal(decide(renewal).eligible,true);
 const pensioner=snapshot();pensioner.application.category='pensioner';pensioner.application.feePence=1500;pensioner.payment.amount=1500;assert.equal(decide(pensioner).eligible,true);
});

test('pending approval, disabled feature, missing release boundary and invalid configuration cannot read or send',async()=>{
 for(const c of [{...config,enabled:false},{...config,approved:false},{...config,applicationsFrom:''},{...config,applicationsFrom:'2026-02-30T00:00:00Z'},{...config,applicationsFrom:'2026-11-05T00:00:00'},{...config,sender:'07700900992'},{...config,category:'service'},{...config,templateName:'unrelated_template'},{...config,accountId:''}]){
  const f=fixture();assert.equal((await processInvitation(id,c,f.deps,today)).status,'skipped');assert.equal(f.reads,0);assert.equal(f.requests,0);
 }
});

test('legacy, opted-out, historical, free, test and deleted applications are excluded',()=>{
 const mutations=[s=>delete s.application.answers.whatsappInvitation,s=>s.application.answers.whatsappInvitation=false,s=>s.application.answers.whatsappInvitation='true',s=>s.application.createdAt='2026-11-04T23:59:59Z',s=>s.application.mode='test',s=>s.application.testData=true,s=>s.application.deletedAt='2026-11-05T10:03:00Z',s=>s.application.feePence=0,s=>s.application.feePence=100,s=>s.application.category='student',s=>s.application.currency='USD',s=>s.application.answers.mobile='invalid',s=>s.application.answers.mobile=config.sender];
 for(const mutate of mutations){const s=snapshot();mutate(s);assert.equal(decide(s).eligible,false);}
 assert.equal(decide(null).eligible,false);
});

test('payment status, evidence, amount and account must all match the application',()=>{
 for(const status of ['pending','failed','refunded','partially_refunded','disputed','expired']){const s=snapshot();s.payment.status=status;assert.equal(decide(s).eligible,false);}
 for(const change of [{amount:1500},{currency:'usd'},{mode:'test'},{account_id:'acct_other'},{application_id:randomUUID()},{refunded_amount:1},{paid_at:null},{payment_intent_id:null},{charge_id:null}]){const s=snapshot();Object.assign(s.payment,change);assert.equal(decide(s).eligible,false);}
 const s=snapshot();s.payment=null;assert.equal(decide(s).eligible,false);
});

test('only the matching active paid activation and a current UK term qualify',()=>{
 for(const change of [{status:'pending'},{status:'review_required'},{activation_kind:'free'},{contact_id:'456'},{account_id:'acct_other'},{application_id:randomUUID()},{payment_intent_id:'pi_other'},{paid_at:'2026-11-05T10:02:00Z'},{start_date:'2026-11-06'},{expiry_date:today},{expiry_date:'2026-02-30'}]){const s=snapshot();Object.assign(s.activation,change);assert.equal(decide(s).eligible,false);}
 for(const change of [{biginSyncStatus:'syncing'},{biginRecordId:null}]){const s=snapshot();Object.assign(s.application,change);assert.equal(decide(s).eligible,false);}
 const s=snapshot();s.activation=null;assert.equal(decide(s).eligible,false);
 // A UTC evening payment during British Summer Time begins on the next UK date.
 const summer=snapshot();summer.application.createdAt='2027-07-01T20:00:00Z';summer.payment.paid_at=summer.activation.paid_at='2027-07-01T23:30:00Z';summer.activation.start_date='2027-07-02';summer.activation.expiry_date='2028-07-02';assert.equal(invitationDecision(summer,config,'2027-07-02').eligible,true);
});

test('sequential retries and concurrent callbacks request only once with an atomic persistent claim',async()=>{
 for(const concurrent of [true,false]){
  const f=fixture();let r;
  if(concurrent)r=await Promise.all([processInvitation(id,config,f.deps,today),processInvitation(id,config,f.deps,today)]);
  else r=[await processInvitation(id,config,f.deps,today),await processInvitation(id,config,f.deps,today)];
  assert.equal(f.requests,1);assert.equal(r.filter(x=>x.status==='request_accepted').length,1);assert.equal(r.filter(x=>x.status==='skipped').length,1);assert.deepEqual(f.outcomes,['request_accepted']);
 }
});

test('permission withdrawal, refund, deletion and target changes between claim and request cancel without sending',async()=>{
 for(const mutate of [s=>s.application.answers.whatsappInvitation=false,s=>s.payment.status='refunded',s=>s.application.deletedAt='2026-11-05T10:03:00Z',s=>s.application.answers.mobile='07700900994']){
  const f=fixture();const claim=f.deps.claim;f.deps.claim=async r=>{const result=await claim(r);const s=snapshot();mutate(s);f.current=s;return result;};
  assert.equal((await processInvitation(id,config,f.deps,today)).status,'cancelled');assert.equal(f.requests,0);assert.deepEqual(f.outcomes,['cancelled']);
 }
});

test('uncertain provider outcomes keep the claim and require review rather than automatic resend',async()=>{
 for(const request of [async()=>{throw new Error('timeout after acceptance');},async()=> 'unknown']){
  const f=fixture();let count=0;f.deps.request=async(...args)=>{count++;return request(...args);};
  assert.equal((await processInvitation(id,config,f.deps,today)).status,'review_required');assert.equal((await processInvitation(id,config,f.deps,today)).status,'skipped');assert.equal(count,1);assert.deepEqual(f.outcomes,['review_required']);
 }
});

test('failed result persistence never reclaims or reports verified delivery',async()=>{
 const f=fixture();f.deps.finish=async()=>{throw new Error('database timeout');};
 assert.deepEqual(await processInvitation(id,config,f.deps,today),{status:'review_required',reason:'INVITATION_RECORD_UNCERTAIN'});
 assert.equal((await processInvitation(id,config,f.deps,today)).status,'skipped');assert.equal(f.requests,1);
});

test('read failures, rejected requests and cross-application reads cannot turn into a send',async()=>{
 const rejected=fixture();rejected.deps.request=async()=> 'rejected';assert.equal((await processInvitation(id,config,rejected.deps,today)).status,'rejected');assert.equal((await processInvitation(id,config,rejected.deps,today)).status,'skipped');
 const failing=fixture();failing.deps.read=async()=>{throw new Error('unavailable');};await assert.rejects(processInvitation(id,config,failing.deps,today));assert.equal(failing.claimed,false);
 const other=fixture();const secondId=randomUUID();other.current=snapshot();assert.equal((await processInvitation(secondId,config,other.deps,today)).reason,'APPLICATION_ID_MISMATCH');assert.equal(other.claimed,false);
});

test('controlled owner test requires the saved one-pound email rate and uses its own form mobile',()=>{
 const restricted={...config,ownerTestOnly:true};
 assert.equal(decide(snapshot(),restricted).reason,'OWNER_TEST_ONLY');
 const s=snapshot();s.application.feePence=100;s.payment.amount=100;s.application.answers.email='events.icsh@gmail.com';
 assert.equal(decide(s,restricted).eligible,true);
 s.application.answers.mobile='07700900994';assert.equal(decide(s,restricted).request.recipient,'+447700900994');
 s.application.answers.email='other@gmail.com';assert.equal(decide(s,restricted).eligible,false);
});
