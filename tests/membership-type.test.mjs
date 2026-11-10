import test from 'node:test';
import assert from 'node:assert/strict';
import {biginMembershipType,membershipTypeForApplication} from '../lib/membership-type.ts';
import {activateMatchedMembership} from '../lib/zoho/membership-activation.ts';
import {syncTestMembershipApplication} from '../lib/zoho/membership-applications.ts';

const app=(category='standard',dob='01/01/1990',feePence=2000)=>({
 id:'11111111-1111-4111-8111-111111111111',mode:'live',testData:false,deletedAt:null,currency:'GBP',category,feePence,createdAt:'2026-11-09T12:00:00Z',
 answers:{kind:'new',firstName:'Alex',lastName:'Taylor',email:'alex@example.invalid',mobile:'07700900993',dob,education:category==='student'?'yes':'no',studentDeclaration:category==='student',terms:true,accuracy:true},
});
test('Bigin type comes from the verified application category for all three tiers',()=>{
 for(const [category,dob,fee,type] of [['standard','01/01/1990',2000,'Standard'],['pensioner','09/11/1961',1500,'Pensioner'],['student','09/11/2009',0,'Student'],['student','10/11/2004',0,'Student']])assert.equal(membershipTypeForApplication(app(category,dob,fee)),type);
 for(const category of ['minor','unknown','Standard','',null,undefined,'toString'])assert.throws(()=>biginMembershipType(category),/CATEGORY_INVALID/);
});
test('invalid or mismatched age, education, fee and category cannot be written as membership type',()=>{
 for(const a of [app('student','09/11/2004',0),app('student','10/11/2009',0),app('pensioner','10/11/1961',1500),app('standard','01/01/1990',1500),app('student','09/11/2009',2000),{...app(),createdAt:'invalid'},{...app(),category:'pensioner'}, {...app('student','09/11/2009',0),answers:{...app('student','09/11/2009',0).answers,education:'no'}},{...app('student','09/11/2009',0),answers:{...app('student','09/11/2009',0).answers,studentDeclaration:false}}])assert.throws(()=>membershipTypeForApplication(a),/CATEGORY_INVALID/);
});
test('saved term category is stable across birthdays; historical authorised test payments keep their real type',()=>{
 const a=app('student','10/11/2004',0);assert.equal(membershipTypeForApplication(a),'Student');
 const testRate={...app(),feePence:100,answers:{...app().answers,email:'events.icsh@gmail.com'}};
 assert.equal(membershipTypeForApplication(testRate),'Standard');
 assert.equal(membershipTypeForApplication({...testRate,category:'pensioner',answers:{...testRate.answers,dob:'01/01/1950'}}),'Pensioner');
 assert.throws(()=>membershipTypeForApplication({...testRate,answers:{...testRate.answers,email:'unrelated@example.invalid'}}));
});
test('renewal updates type for the new term and a matching retry does not write again',async()=>{
 const a=app('pensioner','09/11/1961',1500),value={Membership_Status:'Active',Membership_Type:'Pensioner',Payment_Status:'Completed',Membership_Date:'2026-11-09',Expiry_Date:'2027-11-09'};
 let writes=0,state={id:'123',...a.answers,membershipType:'Standard',membershipStatus:'Active',paymentStatus:'Completed',membershipDate:'2025-11-09',membershipExpiry:'2026-11-09'};
 const client={getBiginContact:async()=>state,updateBiginPaidMembership:async(id,v)=>{writes++;assert.equal(id,'123');assert.deepEqual(v,value);state={...state,membershipType:v.Membership_Type,membershipStatus:v.Membership_Status,paymentStatus:v.Payment_Status,membershipDate:v.Membership_Date,membershipExpiry:v.Expiry_Date};}};
 for(let i=0;i<2;i++)await activateMatchedMembership(client,a.answers,'123',value,async()=>true,'2026-11-09');
 assert.equal(writes,1);assert.equal(state.membershipType,'Pensioner');assert.equal(state.email,a.answers.email);
});
test('a missing or incorrect type readback cannot report successful activation',async()=>{
 const a=app(),value={Membership_Status:'Active',Membership_Type:'Standard',Payment_Status:'Completed',Membership_Date:'2026-11-09',Expiry_Date:'2027-11-09'};
 for(const membershipType of [null,'Student']){
  const state={id:'123',...a.answers,membershipType,membershipStatus:'Active',paymentStatus:'Completed',membershipDate:value.Membership_Date,membershipExpiry:value.Expiry_Date};
  const client={getBiginContact:async()=>state,updateBiginPaidMembership:async()=>{}};
  await assert.rejects(activateMatchedMembership(client,a.answers,'123',value,async()=>true,'2026-11-09'),/READBACK_PENDING/);
 }
});
test('an older saved pending contact with a blank type can be read back without rewriting it',async()=>{
 const a=app();let creates=0;
 const client={getBiginContact:async()=>({id:'123',...a.answers,membershipType:null,membershipStatus:'Inactive',paymentStatus:'Awaiting payment',membershipDate:null,membershipExpiry:null,emailOptOut:true}),createBiginContact:async()=>{creates++;throw Error('No recreation');}};
 const result=await syncTestMembershipApplication({id:a.id,kind:'new',mode:'live',testData:false,annualFee:20,category:'standard',applicant:a.answers,biginContactId:'123'},{client,env:{ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED:'true'}});
 assert.deepEqual(result,{status:'synced',contactId:'123'});assert.equal(creates,0);
});
