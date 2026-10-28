import test from 'node:test';import assert from 'node:assert/strict';
import {getQuote,validateApplication} from '../lib/membership-validation.ts';
import {eligibleFreeMembership} from '../lib/membership-activation/free.ts';
import {activateMatchedMembership} from '../lib/zoho/membership-activation.ts';
import {checkMembershipEligibility} from '../lib/membership-eligibility.ts';
import {ensureContactMemberId} from '../lib/member-ids/core.ts';
const day='2026-10-28';
const answers=()=>({kind:'new',firstName:'Test',lastName:'Test',dob:'01/01/1990',email:'launch@example.invalid',mobile:'07700900876',education:'no',studentDeclaration:false,terms:true,accuracy:true});
const app=()=>({mode:'live',testData:false,deletedAt:null,feePence:0,paymentStatus:'not_required',category:'standard',biginSyncStatus:'synced',createdAt:day+'T01:00:00Z',answers:answers()});
test('launch £0 applies only to exact Test Test name, both form kinds, on the authorised date',()=>{
 for(const kind of ['new','renewal']){const a={...answers(),kind};assert.equal(getQuote(a,day).fee,0);assert.deepEqual(validateApplication(a,day),{});assert.equal(eligibleFreeMembership({...app(),answers:a}),true);}
 for(const date of ['2026-10-27','2026-10-29']){assert.equal(getQuote(answers(),date).fee,1);assert.equal(eligibleFreeMembership({...app(),createdAt:date+'T01:00:00Z'}),false);}
 for(const patch of [{firstName:'Testing'},{lastName:'Test Member'},{kind:''}])assert.notEqual(getQuote({...answers(),...patch},day).launchTest,true);
 assert.ok(validateApplication({...answers(),dob:'01/01/2015'},day).dob);
 assert.equal(getQuote({...answers(),firstName:'Ordinary',lastName:'Member'},day).fee,20);
 assert.equal(getQuote({...answers(),firstName:'Ordinary',lastName:'Member',dob:'01/01/1960'},day).fee,15);
});
test('zero-fee activation still requires saved live evidence, completed declarations and valid identity',()=>{
 for(const patch of [{mode:'test',testData:true},{feePence:100},{paymentStatus:'awaiting_payment'},{deletedAt:day},{biginSyncStatus:'outcome_unknown'},{category:'student'}])assert.equal(eligibleFreeMembership({...app(),...patch}),false);
 for(const patch of [{terms:false},{accuracy:false},{dob:'31/02/1990'},{dob:'01/01/2015'},{firstName:'Other'}])assert.equal(eligibleFreeMembership({...app(),answers:{...answers(),...patch}}),false);
});
test('first expired test term can renew on the same contact, keeping its member number',async()=>{
 let state={id:'987654321',firstName:'Test',lastName:'Test',email:answers().email,mobile:answers().mobile,membershipStatus:'Inactive',paymentStatus:'Not required',membershipDate:null,membershipExpiry:null,memberId:'TETE8877'},writes=0;
 const client={getBiginContact:async()=>state,searchBiginContactsByEmail:async()=>({matches:[{id:state.id}],hasMore:false}),updateBiginPaidMembership:async(id,v)=>{assert.equal(id,state.id);writes++;state={...state,membershipStatus:v.Membership_Status,paymentStatus:v.Payment_Status,membershipDate:v.Membership_Date,membershipExpiry:v.Expiry_Date};}};
 const expired={Membership_Status:'Active',Payment_Status:'Not required',Membership_Date:'2025-10-28',Expiry_Date:day};
 await assert.rejects(activateMatchedMembership(client,answers(),state.id,expired,async()=>true,day),e=>e.code==='PAID_TERM_EXPIRED');
 await activateMatchedMembership(client,answers(),state.id,expired,async()=>true,day,{allowExpiredLaunchTest:true});assert.equal(writes,1);
 const identity={kind:'renewal',firstName:'Test',lastName:'Test',email:answers().email,mobile:answers().mobile};const decision=await checkMembershipEligibility(identity,async()=>({records:[{...state,fullName:'Test Test'}],hasMore:false}),day);assert.equal(decision.status,'allowed');
 const renewed={...expired,Membership_Date:day,Expiry_Date:'2027-10-28'};await activateMatchedMembership(client,{...answers(),kind:'renewal'},state.id,renewed,async()=>true,day);assert.equal(writes,2);assert.equal(state.membershipExpiry,'2027-10-28');
 assert.equal((await checkMembershipEligibility(identity,async()=>({records:[{...state,fullName:'Test Test'}],hasMore:false}),day)).status,'active');
 let confirmed;const memberId=await ensureContactMemberId(client,state.id,()=>true,{confirm:async id=>{confirmed=id;},reserve:async()=>{throw Error('must preserve member number');},start:async()=>{throw Error('must not rewrite member number');}});assert.equal(memberId,'TETE8877');assert.equal(confirmed,'TETE8877');
});
test('expired-term exception cannot apply to ordinary people, paid terms, wrong dates or other expired years',async()=>{
 for(const change of [{firstName:'Other'},{lastName:'Other'}]){const identity={...answers(),...change},state={id:'987654321',...identity,membershipDate:null,membershipExpiry:null,membershipStatus:'Inactive',paymentStatus:'Not required'};const client={getBiginContact:async()=>state,updateBiginPaidMembership:async()=>{throw Error('unsafe write');}};await assert.rejects(activateMatchedMembership(client,identity,state.id,{Membership_Status:'Active',Payment_Status:'Not required',Membership_Date:'2025-10-28',Expiry_Date:day},async()=>true,day,{allowExpiredLaunchTest:true}),e=>e.code==='PAID_TERM_EXPIRED');}
});
