import test from 'node:test';import assert from 'node:assert/strict';
import {eligibleFreeMembership} from '../lib/membership-activation/free.ts';
import {activateMatchedMembership} from '../lib/zoho/membership-activation.ts';
import {paymentConfiguration,paymentRequestOrigin,StripeMembershipClient} from '../lib/membership-payments/core.ts';
import {confirmationContent} from '../lib/form-emails/core.ts';
const app=()=>({mode:'live',testData:false,deletedAt:null,feePence:0,paymentStatus:'not_required',category:'student',biginSyncStatus:'synced',createdAt:'2026-10-27T10:00:00Z',answers:{kind:'new',firstName:'Free',lastName:'Student',email:'free@example.invalid',mobile:'07700900123',dob:'27/10/2009',education:'yes',studentDeclaration:true,terms:true,accuracy:true}});
test('only eligible saved live student applications activate for free, including age boundaries',()=>{
 for(const dob of ['27/10/2009','28/10/2004'])assert.equal(eligibleFreeMembership({...app(),answers:{...app().answers,dob}}),true);
 for(const dob of ['28/10/2009','27/10/2004','31/02/2006'])assert.equal(eligibleFreeMembership({...app(),answers:{...app().answers,dob}}),false);
 for(const patch of [{feePence:2000},{paymentStatus:'awaiting_payment'},{category:'standard'},{mode:'test',testData:true},{deletedAt:'2026-10-27'},{biginSyncStatus:'outcome_unknown'}])assert.equal(eligibleFreeMembership({...app(),...patch}),false);
 for(const patch of [{education:'no'},{studentDeclaration:false},{terms:false}])assert.equal(eligibleFreeMembership({...app(),answers:{...app().answers,...patch}}),false);
});
test('free activation keeps Not required, checks identity/readback and does not rewrite on retry',async()=>{
 const a=app(),term={Membership_Status:'Active',Payment_Status:'Not required',Membership_Date:'2026-10-27',Expiry_Date:'2027-10-27'};
 let writes=0,state={id:'123',firstName:a.answers.firstName,lastName:a.answers.lastName,email:a.answers.email,mobile:a.answers.mobile,membershipStatus:'Inactive',paymentStatus:'Not required',membershipDate:null,membershipExpiry:null};
 const client={getBiginContact:async()=>state,searchBiginContactsByEmail:async()=>({matches:[{id:'123'}],hasMore:false}),updateBiginPaidMembership:async(id,value)=>{writes++;assert.deepEqual(value,term);state={...state,membershipStatus:value.Membership_Status,paymentStatus:value.Payment_Status,membershipDate:value.Membership_Date,membershipExpiry:value.Expiry_Date};}};
 for(let i=0;i<2;i++)await activateMatchedMembership(client,a.answers,'123',term,async()=>true,'2026-10-27');assert.equal(writes,1);assert.equal(state.paymentStatus,'Not required');
});
test('production payment configuration and old-alias requests always return to the official domain',()=>{
 const env={STRIPE_MEMBERSHIP_PAYMENTS_ENABLED:'true',VERCEL_ENV:'production',STRIPE_SECRET_KEY:'rk_live_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_ACCOUNT_ID:'acct_fixture',STRIPE_SITE_URL:'https://icsh.org.uk'};
 const config=paymentConfiguration(env);assert.equal(config.origin,'https://icsh.org.uk');
 for(const host of ['website-nine-beta-11.vercel.app','www.icsh.org.uk','icsh.org.uk'])assert.equal(paymentRequestOrigin(config,'https://'+host+'/api/payments').origin,'https://icsh.org.uk');
});
test('free confirmation never claims that payment was received',()=>{
 const c=confirmationContent({id:'4487bb98-9dbe-479c-b167-b2e36fa61a48',kind:'membership_active',activation_kind:'free',recipient:'fictional@icsh.org.uk',reference:'MEM-FREE',event_title:'',membership_number:'TEST1234',start_date:'2026-10-27',expiry_date:'2027-10-27'});
 assert.match(c.subject,/Your membership is active/);assert.match(c.textbody,/Your ICSH membership is now active/);for(const body of [c.subject,c.textbody,c.htmlbody])assert.doesNotMatch(body,/payment|paid|verification|verified/i);assert.match(c.textbody,/Membership number: TEST1234/);assert.match(c.textbody,/Membership starts: 27 October 2026/);assert.match(c.textbody,/Membership expires: 27 October 2027/);
});

test('free activation test wording has no payment language; paid wording retains verification',()=>{
 const base={id:'4487bb98-9dbe-479c-b167-b2e36fa61a48',kind:'membership_active',recipient:'fictional@icsh.org.uk',reference:'MEM-FREE',event_title:'',membership_number:'TEST1234',start_date:'2026-10-27',expiry_date:'2027-10-27'};
 const free=confirmationContent({...base,activation_kind:'free',test:true});for(const body of [free.subject,free.textbody,free.htmlbody])assert.doesNotMatch(body,/payment|paid|verification|verified/i);
 const paid=confirmationContent({...base,activation_kind:'paid'});assert.match(paid.subject,/Payment received/);assert.match(paid.textbody,/payment has been verified/);
});
