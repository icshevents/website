import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {invitationDecision,processInvitation} from '../lib/whatsapp-invitations/core.ts';
import {invitationConfiguration} from '../lib/whatsapp-invitations/configuration.ts';
import {confirmationContent} from '../lib/form-emails/core.ts';
const today='2026-11-06';
const config={membershipKind:'free',enabled:true,approved:true,accountId:'free',sender:'+447700900992',templateName:'icsh_free_member_group_invitation',category:'utility',applicationsFrom:'2026-11-06T00:00:00Z'};
const fixture=()=>{
 const id=randomUUID();return {
 application:{id,mode:'live',testData:false,deletedAt:null,applicationStatus:'received',createdAt:'2026-11-06T10:00:00Z',category:'student',feePence:0,currency:'GBP',paymentStatus:'not_required',biginSyncStatus:'synced',biginRecordId:'123',answers:{kind:'new',firstName:'Free',lastName:'Student',dob:'01/01/2006',education:'yes',studentDeclaration:true,terms:true,accuracy:true,email:'student@example.invalid',mobile:'07700900993',whatsappInvitation:true,communicationsNotice:'2026-11-06-all-tiers-v2'}},
 payment:null,activation:{application_id:id,account_id:'free',activation_kind:'free',status:'active',contact_id:'123',payment_intent_id:null,paid_at:null,start_date:today,expiry_date:'2027-11-06'}};
};
test('free Student uses its approved template after activation, with no Stripe evidence or payment claim',()=>{
 const s=fixture(),result=invitationDecision(s,config,today);assert.equal(result.eligible,true);
 assert.equal(result.request.templateName,config.templateName);assert.equal(result.request.paymentIntentId,null);
 assert.equal(result.request.accountId,'free');assert.equal(result.request.recipient,'+447700900993');
 s.application.answers.kind='renewal';assert.equal(invitationDecision(s,config,today).eligible,true);
});
test('legacy and declined notices, historic applications and unverified free eligibility cannot send',()=>{
 for(const change of [
 s=>s.application.answers.communicationsNotice='2026-11-06-membership-service-v1',s=>delete s.application.answers.communicationsNotice,
 s=>s.application.answers.whatsappInvitation=false,s=>s.application.createdAt='2026-11-05T20:00:00Z',
 s=>s.application.answers.education='no',s=>s.application.answers.studentDeclaration=false,s=>s.application.answers.terms=false,
 s=>s.application.answers.dob='01/01/1990',s=>s.application.category='standard',s=>s.application.feePence=2000,
 s=>s.application.paymentStatus='awaiting_payment',s=>s.application.testData=true,s=>s.application.deletedAt=today,
 s=>s.application.answers.mobile='bad',s=>s.application.answers.mobile=config.sender,
 s=>s.payment={status:'paid'},s=>s.activation.status='pending',s=>s.activation.status='review_required',
 s=>s.activation.account_id='acct_fixture',s=>s.activation.activation_kind='paid',s=>s.activation.paid_at='2026-11-06T10:00:00Z',
 s=>s.activation.payment_intent_id='pi_fixture',s=>s.activation.contact_id='456',s=>s.activation.expiry_date=today,
 s=>s.activation.start_date='2026-11-07',s=>s.application.biginRecordId='456']){
 const s=fixture();change(s);assert.equal(invitationDecision(s,config,today).eligible,false,change.toString());}
});
test('free release needs independent template approval, workflow verification and future boundary',()=>{
 const env={VERCEL_ENV:'production',ZOHO_BIGIN_MEMBERSHIP_ACTIVATION_ENABLED:'true',ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED:'true',ZOHO_BIGIN_WHATSAPP_SENDER:config.sender,
 ZOHO_BIGIN_WHATSAPP_FREE_INVITATIONS_ENABLED:'true',ZOHO_BIGIN_WHATSAPP_FREE_TEMPLATE_APPROVED:'true',ZOHO_BIGIN_WHATSAPP_FREE_WORKFLOW_VERIFIED:'true',ZOHO_BIGIN_WHATSAPP_FREE_RELEASE_MODE:'live',ZOHO_BIGIN_WHATSAPP_FREE_TEMPLATE_NAME:config.templateName,ZOHO_BIGIN_WHATSAPP_FREE_TEMPLATE_CATEGORY:'utility',ZOHO_BIGIN_WHATSAPP_FREE_INVITATIONS_FROM:config.applicationsFrom};
 assert.deepEqual(invitationConfiguration(env,'free'),config);assert.equal(invitationConfiguration(env),null);
 for(const key of ['ZOHO_BIGIN_WHATSAPP_FREE_INVITATIONS_ENABLED','ZOHO_BIGIN_WHATSAPP_FREE_TEMPLATE_APPROVED','ZOHO_BIGIN_WHATSAPP_FREE_WORKFLOW_VERIFIED','ZOHO_BIGIN_WHATSAPP_FREE_INVITATIONS_FROM'])assert.equal(invitationConfiguration({...env,[key]:undefined},'free'),null);
 assert.equal(invitationConfiguration({...env,VERCEL_ENV:'preview'},'free'),null);
 const s=fixture();assert.equal(invitationDecision(s,{...config,ownerTestOnly:true},today).reason,'OWNER_TEST_ONLY');
 s.application.answers.email='events.icsh@gmail.com';assert.equal(invitationDecision(s,{...config,ownerTestOnly:true},today).eligible,true);
});
test('free concurrent callbacks and uncertain acknowledgements preserve the permanent no-resend claim',async()=>{
 for(const uncertain of [false,true]){
 const s=fixture();let claimed=false,count=0;const outcomes=[];
 const deps={read:async()=>structuredClone(s),claim:async()=>{if(claimed)return null;claimed=true;return {token:randomUUID()};},request:async()=>{count++;if(uncertain)throw Error('timeout');return 'accepted';},finish:async(_id,_token,outcome)=>outcomes.push(outcome)};
 const results=await Promise.all([processInvitation(s.application.id,config,deps,today),processInvitation(s.application.id,config,deps,today)]);
 assert.equal(count,1);assert.equal(outcomes[0],uncertain?'review_required':'request_accepted');assert.equal(results.filter(r=>r.status==='skipped').length,1);
 }
});
test('all three tiers receive an activation email with the private WhatsApp follow-up notice',()=>{
 for(const [category,activation_kind] of [['standard','paid'],['pensioner','paid'],['student','free']]){
 const email=confirmationContent({id:randomUUID(),kind:'membership_active',activation_kind,recipient:'fictional@icsh.org.uk',reference:'MEM-FIXTURE',event_title:'',membership_number:'ABCD1234',start_date:today,expiry_date:'2027-11-06'});
 assert.match(email.textbody,/members-only WhatsApp group/);assert.match(email.htmlbody,/members-only WhatsApp group/);
 if(category==='student')assert.doesNotMatch(email.textbody,/payment|paid/i);
 }
});
