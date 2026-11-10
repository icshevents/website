import test from 'node:test';import assert from 'node:assert/strict';
import {getQuote,validateApplication} from '../lib/membership-validation.ts';
import {eligibleFreeMembership} from '../lib/membership-activation/free.ts';
import {activateMatchedMembership} from '../lib/zoho/membership-activation.ts';
const answers=()=>({kind:'new',firstName:'Test',lastName:'Test',dob:'01/01/1990',email:'retired@example.invalid',mobile:'07700900876',education:'no',studentDeclaration:false,terms:true,accuracy:true});
const app=()=>({mode:'live',testData:false,deletedAt:null,feePence:0,paymentStatus:'not_required',category:'standard',biginSyncStatus:'synced',createdAt:'2026-10-28T01:00:00Z',answers:answers()});
test('the old launch date and name no longer grant free or pound-rate membership',()=>{
 for(const on of ['2026-10-23','2026-10-28','2026-10-29'])for(const kind of ['new','renewal']){
  assert.equal(getQuote({...answers(),kind},on).fee,20);assert.deepEqual(validateApplication({...answers(),kind},on),{});
  assert.equal(getQuote({...answers(),kind,dob:'01/01/1960'},on).fee,15);
  assert.ok(validateApplication({...answers(),kind,dob:'01/01/2015'},on).dob);
 }
});
test('saved standard launch applications cannot obtain a new free activation',()=>{
 assert.equal(eligibleFreeMembership(app()),false);
 assert.equal(eligibleFreeMembership({...app(),answers:{...answers(),kind:'renewal'},lastErrorCode:'RENEWAL',biginSyncStatus:'review_required'}),false);
});
test('Test Test students retain ordinary free eligibility and declarations',()=>{
 const a={...answers(),dob:'01/01/2006',education:'yes',studentDeclaration:true};
 assert.equal(getQuote(a,'2026-10-28').fee,0);assert.equal(eligibleFreeMembership({...app(),category:'student',answers:a}),true);
 assert.equal(eligibleFreeMembership({...app(),category:'student',answers:{...a,studentDeclaration:false}}),false);
});
test('artificial expired terms can no longer be written for any name',async()=>{
 const a=answers();let writes=0;const state={id:'987654321',...a,membershipDate:null,membershipExpiry:null,membershipStatus:'Inactive',paymentStatus:'Not required'};
 const client={getBiginContact:async()=>state,updateBiginPaidMembership:async()=>{writes++;}};
 await assert.rejects(activateMatchedMembership(client,a,state.id,{Membership_Status:'Active',Payment_Status:'Not required',Membership_Date:'2025-10-28',Expiry_Date:'2026-10-28'},async()=>true,'2026-10-28'),e=>e.code==='PAID_TERM_EXPIRED');assert.equal(writes,0);
});
