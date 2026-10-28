import test from 'node:test';
import assert from 'node:assert/strict';
import {emailConfiguration,confirmationContent,sendConfirmation} from '../lib/form-emails/core.ts';
const env={ZOHO_TRANSACTIONAL_EMAIL_ENABLED:'true',ZOHO_TRANSACTIONAL_API_ORIGIN:'https://cpaas.zoho.eu',ZOHO_TRANSACTIONAL_SEND_KEY:'test-key',ZOHO_TRANSACTIONAL_FROM:'events@icsh.org.uk'};
const value={id:'4487bb98-9dbe-479c-b167-b2e36fa61a48',kind:'membership_active',recipient:'fictional@icsh.org.uk',reference:'MEM-ABC123',event_title:'',membership_number:'TEST1234',start_date:'2026-10-26',expiry_date:'2027-10-25'};
test('sending is disabled by default and credentials only go to a supported origin',()=>{
 assert.equal(emailConfiguration({}),null);
 for(const origin of ['https://evil.test','https://cpaas.zoho.eu/','https://cpaas.zoho.eu@evil.test'])assert.throws(()=>emailConfiguration({...env,ZOHO_TRANSACTIONAL_API_ORIGIN:origin}));
 assert.throws(()=>emailConfiguration({...env,ZOHO_TRANSACTIONAL_SEND_KEY:'key\nheader'}));
});
test('pasted Zoho authorization headers and surrounding whitespace normalise without permitting embedded whitespace',()=>{
 for(const token of ['  test-key\n','Zoho-enczapikey test-key','Authorization: Zoho-enczapikey test-key'])assert.equal(emailConfiguration({...env,ZOHO_TRANSACTIONAL_SEND_KEY:token}).token,'test-key');
 assert.throws(()=>emailConfiguration({...env,ZOHO_TRANSACTIONAL_SEND_KEY:'test-key\nother-header'}),/EMAIL_KEY_FORMAT_INVALID/);
});
test('all form kinds acknowledge receipt without claiming payment or approval',()=>{
 for(const kind of ['membership_active','membership_reminder','donation','rishta','event','stall']){
  const c=confirmationContent({...value,kind,event_title:'Community <event>'});
  assert.ok(c.textbody.includes(value.reference));assert.ok(c.htmlbody.includes('ICSH'));
  if(['event','stall'].includes(kind)){assert.ok(c.htmlbody.includes('&lt;event&gt;'));assert.ok(!c.htmlbody.includes('Community <event>'));}
 }
 assert.match(confirmationContent({...value,kind:'donation'}).textbody,/not a payment receipt/);
 const privateContent=confirmationContent({...value,kind:'rishta',event_title:'DO NOT INCLUDE'});
 assert.ok(!privateContent.textbody.includes('DO NOT INCLUDE'));assert.ok(!privateContent.subject.toLowerCase().includes('rishta'));
});
test('fictional addresses and invalid references never send',async()=>{
 let calls=0;const f=async()=>{calls++;throw Error();};
 for(const recipient of ['person@example.invalid','person@example.com','person@example.org','person@test.example.com','person@host.test','person@host.invalid','person@icsh.org.uk\nbcc:other@icsh.org.uk'])await assert.rejects(sendConfirmation({...value,recipient},env,f));
 await assert.rejects(sendConfirmation({...value,reference:'<script>'},env,f));assert.equal(calls,0);
});
test('one submitter, no copies or attachments, no tracking, EU credentials',async()=>{
 let body;const result=await sendConfirmation(value,env,async(url,options)=>{
  assert.equal(url,'https://cpaas.zoho.eu/v1.1/email');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Zoho-enczapikey test-key');
  body=JSON.parse(options.body);return Response.json({message:'OK',data:[{code:'EM_104',message:'OK'}],request_id:'req-test'});
 });
 assert.deepEqual(result,{status:'accepted',providerId:'req-test'});assert.equal(body.to.length,1);assert.equal(body.to[0].email_address.address,value.recipient);
 assert.equal(body.cc,undefined);assert.equal(body.bcc,undefined);assert.equal(body.attachments,undefined);assert.equal(body.track_opens,false);assert.equal(body.track_clicks,false);assert.equal(body.client_reference,value.id);
});
test('uncertain sends are held for review and only explicit throttling retries',async()=>{
 for(const status of [500,502])assert.equal((await sendConfirmation(value,env,async()=>new Response('',{status}))).status,'review_required');
 assert.equal((await sendConfirmation(value,env,async()=>{throw Error('secret or private provider detail');})).code,'EMAIL_OUTCOME_UNKNOWN');
 assert.equal((await sendConfirmation(value,env,async()=>Response.json({message:'OK'}))).status,'review_required');
 assert.equal((await sendConfirmation(value,env,async()=>new Response('',{status:429}))).status,'retry');
 assert.equal((await sendConfirmation(value,env,async()=>new Response('',{status:401}))).status,'failed');
});

test('paid membership emails combine payment and activation, with a separate incomplete-payment reminder',()=>{
 const active=confirmationContent({...value,kind:'membership_active'});
 assert.match(active.textbody,/payment has been verified/);assert.match(active.textbody,/membership is now active/);
 const reminder=confirmationContent({...value,kind:'membership_reminder'});
 assert.match(reminder.textbody,/only activate after payment has been verified/);assert.doesNotMatch(reminder.textbody,/membership is now active/);
 assert.throws(()=>confirmationContent({...value,kind:'membership'}));
});

test('active membership uses confirmed ID and dates; incomplete details never claim activation',async()=>{
 const c=confirmationContent(value);
 assert.match(c.textbody,/Membership number: TEST1234/);
 assert.match(c.textbody,/Membership starts: 26 October 2026/);
 assert.match(c.textbody,/Membership expires: 25 October 2027/);
 let calls=0;const noSend=async()=>{calls++;throw Error();};
 for(const patch of [{membership_number:undefined},{membership_number:'bad\nID'},{start_date:'2026-02-30'},{expiry_date:'2025-10-25'}])await assert.rejects(sendConfirmation({...value,...patch},env,noSend));
 assert.equal(calls,0);
 const reminder=confirmationContent({...value,kind:'membership_reminder'});
 assert.doesNotMatch(reminder.textbody,/Membership number:|Membership starts:|Membership expires:/);
});
test('provider rejections retain only recognised codes, never private response text',async()=>{
 const result=await sendConfirmation(value,env,async()=>Response.json({error:{code:'TM_4001',details:[{code:'SM_111',message:'private recipient or credential',target:'do not store'}]}},{status:400}));
 assert.deepEqual(result,{status:'failed',code:'ZOHO_TM_4001_SM_111'});
});
test('Zoho dotted request identifiers are recorded as accepted without accepting an ambiguous response',async()=>{
 const providerId='13ef.17961bc29321d39f.m1.41d68070-d1d2-11f1-95f9-16423a433ff6.1a17c1d09f7';
 assert.deepEqual(await sendConfirmation(value,env,async()=>Response.json({message:'OK',data:[{code:'EM_104'}],request_id:providerId})),{status:'accepted',providerId});
 assert.equal((await sendConfirmation(value,env,async()=>Response.json({message:'OK',data:[{code:'EM_104'}],request_id:'bad\nidentifier'}))).status,'review_required');
});
