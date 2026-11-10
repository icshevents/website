import test from 'node:test';
import assert from 'node:assert/strict';
import {getQuote} from '../lib/membership-validation.ts';
import {testMembershipQuote,ownerTestEmail,membershipTestPricingEnabled,savedOwnerTestRate} from '../lib/membership-test-pricing.ts';
import {handleMembershipEligibility} from '../lib/membership-eligibility-api.ts';
import {handleMembershipApplications} from '../lib/membership-applications/api.ts';
import {applicationAmount,StripeMembershipClient} from '../lib/membership-payments/core.ts';
import {processInvitation} from '../lib/whatsapp-invitations/core.ts';
import {syncTestMembershipApplication} from '../lib/zoho/membership-applications.ts';
import {activateMatchedMembership} from '../lib/zoho/membership-activation.ts';

const id='39278dca-a522-42a0-8f67-0c92a4aeea11';
const email='events.icsh@gmail.com';
const secret='owner-profile-local-test-secret-with-at-least-32-characters';
const answers=(changes={})=>({kind:'new',firstName:'Alex',lastName:'Taylor',dob:'01/01/1990',email,mobile:'07700900993',education:'no',studentDeclaration:false,terms:true,accuracy:true,whatsappInvitation:true,...changes});
const config={key:'rk_live_fixture',webhookSecret:'whsec_fixture',account:'acct_fixture',mode:'live',origin:'https://icsh.test',testPricingEnabled:true};
const app=(changes={})=>({id,reference:'MEM-FIXTURE',mode:'live',testData:false,currency:'GBP',category:'standard',feePence:100,answers:answers(),createdAt:'2026-11-05T10:00:00Z',deletedAt:null,applicationStatus:'received',biginRecordId:'123',biginSyncStatus:'synced',...changes});

test('temporary rate matches the exact email case-insensitively and remains disabled by default',()=>{
 assert.equal(ownerTestEmail(' EVENTS.ICSH@GMAIL.COM '),true);
 for(const value of ['events.icsh+test@gmail.com','eventsicsh@gmail.com','events.icsh@googlemail.com','other@gmail.com','events.icsh@gmail.com.evil',null])assert.equal(ownerTestEmail(value),false);
 assert.equal(membershipTestPricingEnabled({}),false);
 assert.equal(membershipTestPricingEnabled({VERCEL_ENV:'production',ICSH_MEMBERSHIP_TEST_PRICING_ENABLED:'true'}),true);
 assert.equal(membershipTestPricingEnabled({VERCEL_ENV:'preview',ICSH_MEMBERSHIP_TEST_PRICING_ENABLED:'true'}),false);
 const q=getQuote(answers(),'2026-11-05');
 assert.equal(testMembershipQuote(q,email).fee,20);assert.equal(testMembershipQuote(q,email,true).fee,1);
 assert.equal(testMembershipQuote(q,'other@gmail.com',true).fee,20);
 const senior=getQuote(answers({dob:'01/01/1960'}),'2026-11-05');assert.equal(testMembershipQuote(senior,email,true).fee,1);
 const free=getQuote(answers({dob:'01/01/2006',education:'yes',studentDeclaration:true}),'2026-11-05');assert.equal(testMembershipQuote(free,email,true).fee,0);
 assert.equal(testMembershipQuote(null,email,true),null);
});

test('eligibility check returns the server quote without publishing an email allowlist or accepting client amounts',async()=>{
 const endpoint='https://icsh.test/api/membership/eligibility';
 const identity={kind:'new',firstName:'Alex',lastName:'Taylor',email,mobile:'07700900993'};
 const req=body=>new Request(endpoint,{method:'POST',headers:{origin:'https://icsh.test','Content-Type':'application/json'},body:JSON.stringify(body)});
 const deps={secret,rateLimit:async()=>true,check:async()=>({status:'allowed'}),testPricingEnabled:true,today:()=> '2026-11-05'};
 const body={...identity,quote:{dob:'01/01/1990',education:'no'}};
 let response=await handleMembershipEligibility(req(body),deps);
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{status:'allowed',quote:{category:'standard',feePence:100,currency:'GBP'}});
 response=await handleMembershipEligibility(req(body),{...deps,testPricingEnabled:false});assert.equal((await response.json()).quote.feePence,2000);
 response=await handleMembershipEligibility(req({...body,email:'other@gmail.com'}),deps);assert.equal((await response.json()).quote.feePence,2000);
 assert.equal((await handleMembershipEligibility(req({...body,quote:{...body.quote,feePence:100}}),deps)).status,400);
 response=await handleMembershipEligibility(req(body),{...deps,check:async()=>({status:'identity_conflict'})});assert.deepEqual(await response.json(),{status:'identity_conflict'});
});

async function saveUsingApi(enabled=true,answer=answers(),extra={},overrides={}){
 let saved=null;
 const endpoint='https://icsh.test/api/membership/applications';
 const deps={secret,available:async()=>true,rateLimit:async()=>true,checkIdentity:async()=>({status:'allowed'}),writesEnabled:false,whatsappInvitationsEnabled:true,testPricingEnabled:enabled,today:()=> '2026-11-05',get:async()=>null,
  save:async input=>{saved={...app(input),requestHash:input.requestHash,capabilityHash:input.capabilityHash,biginSyncStatus:'awaiting_authorisation',biginRecordId:null};return {application:saved,created:true};}};
 Object.assign(deps,overrides);
 const session=await handleMembershipApplications(new Request(endpoint),deps);const csrf=(await session.json()).csrf;const cookie=session.headers.get('set-cookie').split(';')[0];
 const response=await handleMembershipApplications(new Request(endpoint,{method:'POST',headers:{origin:'https://icsh.test','Content-Type':'application/json',cookie,'X-CSRF-Token':csrf},body:JSON.stringify({requestKey:id,receiptToken:'a'.repeat(64),answers:answer,testData:false,website:'',...extra})}),deps);
 return {response,saved};
}

test('application save recomputes the discount server-side and does not accept a browser price',async()=>{
 const discounted=await saveUsingApi();assert.equal(discounted.response.status,201);assert.equal(discounted.saved.feePence,100);
 assert.equal((await saveUsingApi(false)).saved.feePence,2000);
 assert.equal((await saveUsingApi(true,answers({email:'other@gmail.com'}))).saved.feePence,2000);
 const forged=await saveUsingApi(true,answers(),{feePence:1});assert.equal(forged.response.status,400);assert.equal(forged.saved,null);
 const free=await saveUsingApi(true,answers({dob:'01/01/2006',education:'yes',studentDeclaration:true,whatsappInvitation:false}));assert.equal(free.saved.feePence,0);
 const blocked=await saveUsingApi(true,answers(),{},{checkIdentity:async()=>({status:'active',membershipDate:'2026-01-01',membershipExpiry:'2027-01-01',daysUntilExpiry:57})});assert.equal(blocked.response.status,409);assert.equal(blocked.saved,null);
});

test('new one-pound checkouts require the active profile, while settled evidence survives disabling it',async()=>{
 const a=app();assert.equal(savedOwnerTestRate(a),true);assert.equal(applicationAmount(a,config),100);
 assert.throws(()=>applicationAmount(a,{...config,testPricingEnabled:false}));
 for(const change of [{answers:answers({email:'events.icsh+test@gmail.com'})},{category:'student'},{currency:'USD'},{mode:'test'},{feePence:1}])assert.equal(savedOwnerTestRate(app(change)),false);
 const paid={id:'cs_live_owner12345',livemode:true,mode:'payment',currency:'gbp',amount_total:100,client_reference_id:id,status:'complete',payment_status:'paid',metadata:{purpose:'icsh_website_membership_v1',application_id:id,account_id:'acct_fixture'},payment_intent:{id:'pi_owner',livemode:true,status:'succeeded',amount:100,amount_received:100,currency:'gbp',latest_charge:{id:'ch_owner',payment_intent:'pi_owner',paid:true,captured:true,status:'succeeded',amount:100,currency:'gbp',livemode:true,created:Date.parse('2026-11-05T10:01:00Z')/1000,amount_refunded:0,disputed:false}}};
 const client=new StripeMembershipClient({...config,testPricingEnabled:false});assert.equal(client.verifiedOutcome(paid,a).status,'paid');
 assert.throws(()=>client.verifiedOutcome({...paid,amount_total:2000},a));
});

test('the profile runs through saved application, 100p checkout, verified payment and one invitation request',async()=>{
 const {response,saved}=await saveUsingApi();assert.equal(response.status,201);
 const session={id:'cs_live_owner12345',livemode:true,mode:'payment',currency:'gbp',amount_total:100,client_reference_id:id,status:'open',payment_status:'unpaid',metadata:{purpose:'icsh_website_membership_v1',application_id:id,account_id:'acct_fixture'}};
 let creates=0;
 const client=new StripeMembershipClient(config,async(url,init)=>{
  if(url.endsWith('/account'))return Response.json({id:'acct_fixture',charges_enabled:true});
  creates++;assert.equal(init.body.get('line_items[0][price_data][unit_amount]'),'100');assert.equal(init.body.get('line_items[0][price_data][currency]'),'gbp');return Response.json(session);
 });
 await client.create(saved);assert.equal(creates,1);
 const settled={...session,status:'complete',payment_status:'paid',payment_intent:{id:'pi_owner',livemode:true,status:'succeeded',amount:100,amount_received:100,currency:'gbp',latest_charge:{id:'ch_owner',payment_intent:'pi_owner',paid:true,captured:true,status:'succeeded',amount:100,currency:'gbp',livemode:true,created:Date.parse('2026-11-05T10:01:00Z')/1000,amount_refunded:0,disputed:false}}};
 const payment=client.verifiedOutcome(settled,saved);assert.equal(payment.status,'paid');
 let member={id:'123',firstName:'Alex',lastName:'Taylor',email,mobile:'+447700900993',membershipStatus:'Inactive',membershipType:'Standard',paymentStatus:'Awaiting payment',membershipDate:null,membershipExpiry:null};
 const activationClient={getBiginContact:async()=>member,updateBiginPaidMembership:async(_id,fields)=>{member={...member,membershipStatus:fields.Membership_Status,membershipType:fields.Membership_Type,paymentStatus:fields.Payment_Status,membershipDate:fields.Membership_Date,membershipExpiry:fields.Expiry_Date};}};
 assert.equal(await activateMatchedMembership(activationClient,saved.answers,'123',{Membership_Status:'Active',Membership_Type:'Standard',Payment_Status:'Completed',Membership_Date:'2026-11-05',Expiry_Date:'2027-11-05'},async()=>true,'2026-11-05'),'123');assert.equal(member.membershipStatus,'Active');
 const active={...saved,biginSyncStatus:'synced',biginRecordId:'123'};
 const snapshot={application:active,payment:{application_id:id,account_id:'acct_fixture',mode:'live',amount:100,currency:'gbp',status:payment.status,paid_at:payment.paidAt,payment_intent_id:payment.paymentIntentId,charge_id:payment.chargeId,refunded_amount:0},activation:{application_id:id,account_id:'acct_fixture',payment_intent_id:payment.paymentIntentId,paid_at:payment.paidAt,activation_kind:'paid',status:'active',contact_id:'123',start_date:'2026-11-05',expiry_date:'2027-11-05'}};
 let claimed=false,sends=0;
 const deps={read:async()=>snapshot,claim:async()=>{if(claimed)return null;claimed=true;return {token:id};},request:async()=>{sends++;return 'accepted';},finish:async()=>{}};
 const inviteConfig={enabled:true,approved:true,accountId:'acct_fixture',sender:'+447700900992',templateName:'icsh_paid_member_group_invitation',category:'utility',applicationsFrom:'2026-11-05T00:00:00Z'};
 assert.equal((await processInvitation(id,inviteConfig,deps,'2026-11-05')).status,'request_accepted');
 assert.equal((await processInvitation(id,inviteConfig,deps,'2026-11-05')).status,'skipped');assert.equal(sends,1);
 const other={...snapshot,application:{...active,answers:answers({email:'other@gmail.com'})}};let claims=0;assert.equal((await processInvitation(id,inviteConfig,{...deps,read:async()=>other,claim:async()=>{claims++;return {token:id};}},'2026-11-05')).status,'skipped');assert.equal(claims,0);
});

test('Bigin accepts the saved one-pound profile without changing names, terms or ordinary contact safeguards',async()=>{
 const a={id,kind:'new',mode:'live',testData:false,applicant:answers(),annualFee:1,category:'standard'};let created=0;let payload;
 const client={searchBiginContactsByEmail:async()=>({matches:[],hasMore:false}),createBiginContact:async p=>{created++;payload=p;return {contactId:'123'};},getBiginContact:async()=>({id:'123',firstName:'Alex',lastName:'Taylor',email,mobile:'+447700900993',membershipStatus:'Inactive',membershipType:'Standard',paymentStatus:'Awaiting payment',emailOptOut:true,membershipDate:null,membershipExpiry:null})};
 const options={client,env:{ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED:'true'}};
 assert.equal((await syncTestMembershipApplication(a,options)).status,'synced');assert.equal(created,1);assert.equal(payload.Membership_Status,'Inactive');
 assert.equal((await syncTestMembershipApplication({...a,applicant:answers({email:'other@gmail.com'})},options)).status,'failed');assert.equal(created,1);
});

test('restricted owner invitation permission accepts the form mobile but rejects other emails before saving',async()=>{
 const overrides={whatsappOwnerTestOnly:true};
 for(const mobile of ['07700900993','07700900994']){const owner=await saveUsingApi(true,answers({mobile}),{},overrides);assert.equal(owner.response.status,201);assert.equal(owner.saved.answers.mobile,mobile);}
 const wrongEmail=await saveUsingApi(true,answers({email:'other@gmail.com'}),{},overrides);assert.equal(wrongEmail.response.status,400);assert.equal(wrongEmail.saved,null);
 const normal=await saveUsingApi(true,answers({email:'other@gmail.com',whatsappInvitation:false}),{},overrides);assert.equal(normal.response.status,201);assert.equal(normal.saved.feePence,2000);
});
