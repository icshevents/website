import test from 'node:test';
import assert from 'node:assert/strict';
import {checkMembershipEligibilityWithOwnerTest,sharedPhoneTestAllowed} from '../lib/membership-test-eligibility.ts';
import {checkMembershipEligibility} from '../lib/membership-eligibility.ts';
import {createZohoClient} from '../lib/zoho/client.ts';
import {syncTestMembershipApplication} from '../lib/zoho/membership-applications.ts';
import {handleMembershipEligibility} from '../lib/membership-eligibility-api.ts';
const today='2026-11-06',phone='+447700900993',email='events.icsh@gmail.com';
const identity={kind:'new',firstName:'ICSH',lastName:'WhatsApp Test',email,mobile:phone};
const settings={VERCEL_ENV:'production',ICSH_MEMBERSHIP_TEST_PRICING_ENABLED:'true',ZOHO_BIGIN_WHATSAPP_RELEASE_MODE:'owner-test',ICSH_MEMBERSHIP_SHARED_PHONE_TEST_ENABLED:'true',ICSH_MEMBERSHIP_SHARED_PHONE_TEST_MOBILE:phone};
const real={id:'100',fullName:'Real Member',email:'real@example.invalid',mobile:phone,membershipStatus:'Active',paymentStatus:'Completed',membershipDate:'2026-01-01',membershipExpiry:'2027-01-01'};
const owner={...real,id:'200',fullName:'ICSH WhatsApp Test',email};
function search(ownerRecords=[]){const calls=[];return {calls,lookup:async q=>{calls.push(q);return {records:q.method==='email'?(q.email===email?ownerRecords:[real]):[real],hasMore:false};}};}

test('shared-number registrations are allowed without an owner-test exception and do not read or change another contact',async()=>{
 const f=search();const before=structuredClone(real);assert.equal((await checkMembershipEligibilityWithOwnerTest(identity,f.lookup,settings,today)).status,'allowed');assert.deepEqual(f.calls,[{method:'email',email}]);assert.deepEqual(real,before);
 for(const key of Object.keys(settings)){assert.equal(sharedPhoneTestAllowed(identity,{...settings,[key]:undefined}),false,key);}
 for(const changes of [{email:'other@example.invalid'},{firstName:'Other'},{lastName:'Test'},{mobile:'+447700900994'},{kind:'renewal'}])assert.equal(sharedPhoneTestAllowed({...identity,...changes},settings),false);
 const blocked=search();assert.equal((await checkMembershipEligibilityWithOwnerTest(identity,blocked.lookup,{...settings,ICSH_MEMBERSHIP_SHARED_PHONE_TEST_ENABLED:'false'},today)).status,'allowed');assert.deepEqual(blocked.calls,[{method:'email',email}]);
});

test('the shared-phone exception retains owner email uniqueness, identity, active-term and incomplete-result checks',async()=>{
 assert.equal((await checkMembershipEligibilityWithOwnerTest(identity,search([owner]).lookup,settings,today)).status,'active');
 for(const record of [{...owner,fullName:'Someone Else'},{...owner,mobile:'+447700900994'}])assert.equal((await checkMembershipEligibilityWithOwnerTest(identity,search([record]).lookup,settings,today)).status,'identity_conflict');
 assert.equal((await checkMembershipEligibilityWithOwnerTest(identity,search([owner,{...owner,id:'201'}]).lookup,settings,today)).status,'review_required');
 assert.equal((await checkMembershipEligibilityWithOwnerTest(identity,async()=>({records:[],hasMore:true}),settings,today)).status,'review_required');
});

test('the authorised shared-phone profile receives a one-pound quote through the public eligibility handler',async()=>{
 const url='https://icsh.test/api/membership/eligibility';const request=new Request(url,{method:'POST',headers:{origin:'https://icsh.test','Content-Type':'application/json'},body:JSON.stringify({...identity,quote:{dob:'01/01/1990',education:'no'}})});
 const response=await handleMembershipEligibility(request,{secret:'fixture-readonly-test-secret-at-least-32-characters',rateLimit:async()=>true,testPricingEnabled:true,today:()=>today,check:value=>checkMembershipEligibilityWithOwnerTest(value,search().lookup,settings,today)});
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{status:'allowed',quote:{category:'standard',feePence:100,currency:'GBP'}});
});

test('a new owner application creates and verifies its own Contact rather than binding the real member Contact',async()=>{
 const calls=[];const input={id:'11111111-1111-4111-8111-111111111111',kind:'new',mode:'live',testData:false,annualFee:1,category:'standard',applicant:identity};
 const client={searchBiginContactsByEmail:async value=>{calls.push(['email',value]);return {matches:[],hasMore:false};},createBiginContact:async payload=>{calls.push(['create',payload]);return {contactId:'200'};},getBiginContact:async id=>{calls.push(['get',id]);assert.equal(id,'200');return {id,email,firstName:'ICSH',lastName:'WhatsApp Test',mobile:phone,membershipStatus:'Inactive',membershipType:'Standard',paymentStatus:'Awaiting payment',emailOptOut:true,membershipDate:null,membershipExpiry:null};}};
 const before=structuredClone(real);assert.deepEqual(await syncTestMembershipApplication(input,{client,env:{ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED:'true'}}),{status:'synced',contactId:'200'});
 assert.equal(calls.filter(([method])=>method==='create').length,1);assert.deepEqual(real,before);assert.equal(calls.some(([method,id])=>method==='get'&&id==='100'),false);
});

test('the clearly named owner test Contact cannot change the real member result in shared phone searches',async()=>{
 const env={ZOHO_BIGIN_ACCOUNTS_URL:'https://accounts.zoho.eu',ZOHO_BIGIN_API_DOMAIN:'https://www.zohoapis.eu',ZOHO_BIGIN_CLIENT_ID:'fixture',ZOHO_BIGIN_CLIENT_SECRET:'fixture-secret',ZOHO_BIGIN_REFRESH_TOKEN:'fixture-refresh'};
 const record=r=>({id:r.id,Full_Name:r.fullName,Email:r.email,Mobile:r.mobile,Membership_Status:r.membershipStatus,Payment_Status:r.paymentStatus,Membership_Date:r.membershipDate,Expiry_Date:r.membershipExpiry});
 const calls=[];const client=createZohoClient(env,async(url,init)=>{const u=new URL(url);calls.push({url:u,method:init.method});if(u.pathname==='/oauth/v2/token')return Response.json({access_token:'fixture',expires_in:3600});assert.equal(init.method,'GET');const requested=u.searchParams.get('email');return Response.json({data:(requested?(requested===email?[owner]:[real]):[real,owner]).map(record),info:{more_records:false}});});
 assert.deepEqual((await client.searchBiginMembershipRecords({method:'mobile',mobile:phone})).records,[real]);
 const result=await checkMembershipEligibility({kind:'renewal',firstName:'Real',lastName:'Member',email:real.email,mobile:phone},client.searchBiginMembershipRecords,today);assert.equal(result.status,'active');assert.equal(result.membershipExpiry,real.membershipExpiry);
 assert.equal((await client.searchBiginMembershipRecords({method:'email',email})).records[0].id,owner.id);
 assert.equal(calls.some(c=>c.url.pathname.startsWith('/bigin/')&&c.method!=='GET'),false);
});
