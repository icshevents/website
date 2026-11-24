import test from 'node:test';import assert from 'node:assert/strict';
import {checkMembershipEligibility,publicMembershipEligibility} from '../lib/membership-eligibility.ts';
const id={kind:'renewal',firstName:'Alex',lastName:'Taylor',email:'alex@example.invalid',mobile:'07700900993'};
const member={id:'123',email:id.email,fullName:'Alex Taylor',mobile:'+447700900992',membershipStatus:'Active',membershipDate:'2025-11-30',membershipExpiry:'2026-11-30'};
const find=async()=>({records:[member],hasMore:false});
const renewal={status:'active',currentExpiry:'2026-11-30',renewedExpiry:'2027-11-30'};
test('email selects the renewal record; a changed mobile allows renewal with a confirmation flag, never the registered phone',async()=>{const r=await checkMembershipEligibility(id,find,'2026-11-13');assert.deepEqual(r,{status:'allowed',mobileChanged:true,renewal});assert.deepEqual(publicMembershipEligibility(r),r);assert.ok(!JSON.stringify(r).includes(member.mobile));});
test('equivalent formatted phone numbers need no change confirmation',async()=>{const r=await checkMembershipEligibility({...id,mobile:'0044 7700 900992'},find,'2026-11-13');assert.deepEqual(r,{status:'allowed',renewal});});
test('a missing registered mobile does not block email-matched renewal',async()=>{assert.deepEqual(await checkMembershipEligibility(id,async()=>({records:[{...member,mobile:null}],hasMore:false}),'2026-11-13'),{status:'allowed',mobileChanged:true,renewal});});
test('new applications and ambiguous records stay blocked while early renewals are allowed',async()=>{assert.notEqual((await checkMembershipEligibility({...id,kind:'new'},find,'2026-11-13')).status,'allowed');assert.deepEqual(await checkMembershipEligibility(id,find,'2026-10-01'),{status:'allowed',mobileChanged:true,renewal});assert.equal((await checkMembershipEligibility(id,async()=>({records:[member,{...member,id:'124'}],hasMore:false}),'2026-11-13')).status,'review_required');assert.deepEqual(await checkMembershipEligibility({...id,lastName:'Other'},find,'2026-11-13'),{status:'allowed',mobileChanged:true,nameChanged:true,renewal});});

import {mobileCodeHash,proofHash,verifiedMobileIdentity,mobileVerificationContent,renewalContactChanges} from '../lib/membership-mobile/core.ts';
import {createZohoClient} from '../lib/zoho/client.ts';
test('verification codes are purpose-bound and emails use inclusive, minimal wording',()=>{const uuid='f56aefee-629f-4d7f-b3d1-7bb09d6937a4',secret='fixture-secret-at-least-32-characters-long';assert.notEqual(mobileCodeHash(uuid,'012345',secret),mobileCodeHash(uuid,'012346',secret));assert.notEqual(mobileCodeHash(uuid,'012345',secret),mobileCodeHash('f56aefee-629f-4d7f-b3d1-7bb09d6937a5','012345',secret));assert.equal(proofHash('x'.repeat(64)).length,64);assert.throws(()=>mobileCodeHash(uuid,'1',secret));const mail=mobileVerificationContent('012345');assert.match(mail.textbody,/Hello,/);assert.match(mail.textbody,/10 minutes/);assert.match(mail.textbody,/updated once your renewal is confirmed/);assert.ok(!mail.htmlbody.includes('<br>012345'));});
test('a verified renewal accepts only the proven email/contact and old-or-new phone; a third number cannot be overwritten',()=>{const uuid='f56aefee-629f-4d7f-b3d1-7bb09d6937a4',app={id:uuid,answers:{...id,mobileVerificationId:uuid}},proof={id:uuid,application_id:uuid,contact_id:'123',email:id.email,new_mobile:'+447700900993',old_mobile:'+447700900992',verified_at:'2026-11-13T00:00:00Z'},c={id:'123',email:id.email,firstName:'Alex',lastName:'Taylor',mobile:'+447700900992'};assert.equal(verifiedMobileIdentity(app,c,proof),true);assert.equal(verifiedMobileIdentity(app,{...c,mobile:'+447700900993'},proof),true);for(const patch of[{mobile:'+447700900991'},{email:'other@example.invalid'},{id:'124'},{firstName:'Other'}])assert.equal(verifiedMobileIdentity(app,{...c,...patch},proof),false);assert.equal(verifiedMobileIdentity(app,c,null),false);assert.equal(verifiedMobileIdentity({...app,answers:{...app.answers,kind:'new'}},c,proof),false);assert.equal(verifiedMobileIdentity(app,c,{...proof,application_id:null}),false);});
test('renewal contact transport writes only approved fields to the fixed contact, with all workflows suppressed',async()=>{const env={ZOHO_BIGIN_ACCOUNTS_URL:'https://accounts.zoho.eu',ZOHO_BIGIN_API_DOMAIN:'https://www.zohoapis.eu',ZOHO_BIGIN_CLIENT_ID:'fixture',ZOHO_BIGIN_CLIENT_SECRET:'fixture',ZOHO_BIGIN_REFRESH_TOKEN:'fixture',ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED:'true',ZOHO_BIGIN_MEMBERSHIP_ACTIVATION_ENABLED:'true'};const calls=[];const c=createZohoClient(env,async(url,init)=>{calls.push({url:String(url),init});if(calls.length===1)return Response.json({access_token:'fixture',expires_in:3600});return Response.json({data:[{code:'SUCCESS',status:'success',details:{id:'123'}}]})});await c.updateBiginRenewalContact('123',{firstName:'Updated',lastName:'Surname',mobile:'+447700900993'});assert.equal(calls[1].url,'https://www.zohoapis.eu/bigin/v2/Contacts/123');assert.deepEqual(JSON.parse(calls[1].init.body),{data:[{First_Name:'Updated',Last_Name:'Surname',Mobile:'+447700900993'}],trigger:[]});const denied=createZohoClient({...env,ZOHO_BIGIN_MEMBERSHIP_ACTIVATION_ENABLED:'false'},()=>{throw Error('must not send')});await assert.rejects(denied.updateBiginRenewalContact('123',{mobile:'+447700900993'}));});

test('a verified contact change is bound to the app, email, old or new name, and requested mobile',()=>{
 const challenge='f56aefee-629f-4d7f-b3d1-7bb09d6937a4';
 const app={id:challenge,answers:{...id,firstName:'Updated',lastName:'Surname',mobileVerificationId:challenge}};
 const old={id:'123',email:id.email,firstName:'Alex',lastName:'Taylor',mobile:'+447700900992'};
 const proof={id:challenge,application_id:app.id,contact_id:old.id,email:old.email,
  old_first_name:old.firstName,old_last_name:old.lastName,new_first_name:'Updated',new_last_name:'Surname',
  old_mobile:old.mobile,new_mobile:'+447700900993',verified_at:'2026-11-13T00:00:00Z'};
 assert.equal(verifiedMobileIdentity(app,old,proof),true);
 const update=renewalContactChanges(old,proof);
 assert.deepEqual(update,{firstName:'Updated',lastName:'Surname',mobile:'+447700900993'});
 assert.equal(verifiedMobileIdentity(app,{...old,...update},proof),true);
 assert.deepEqual(renewalContactChanges({...old,...update},proof),{});
 assert.deepEqual(renewalContactChanges({...old,mobile:proof.new_mobile},proof),{firstName:'Updated',lastName:'Surname'});
 assert.equal(verifiedMobileIdentity(app,{...old,lastName:'Edited by organiser'},proof),false);
 assert.equal(verifiedMobileIdentity({...app,answers:{...app.answers,firstName:'Altered'}},old,proof),false);
 assert.equal(verifiedMobileIdentity(app,{...old,id:'456',...update},proof),false);
});
