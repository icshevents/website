import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY_ANSWERS,updateAnswer} from '../lib/membership-validation.ts';
import {sameRetryAnswers} from '../lib/membership-applications/retry.ts';

test('permission starts unchecked and clears when the calculated membership becomes free',()=>{
 assert.equal(EMPTY_ANSWERS.whatsappInvitation,false);
 const paid={...EMPTY_ANSWERS,kind:'new',dob:'01/01/2006',education:'no',whatsappInvitation:true};
 const free=updateAnswer(paid,'education','yes','2026-10-30');
 assert.equal(free.whatsappInvitation,false);
 assert.equal(updateAnswer(paid,'mobile','07700900000','2026-10-30').whatsappInvitation,true);
});

test('payment retries accept legacy unchecked applications and cannot silently add permission',()=>{
 const legacy={...EMPTY_ANSWERS};delete legacy.whatsappInvitation;
 assert.equal(sameRetryAnswers(legacy,{...legacy,whatsappInvitation:false}),true);
 assert.equal(sameRetryAnswers(legacy,{...legacy,whatsappInvitation:true}),false);
 assert.equal(sameRetryAnswers({...legacy,whatsappInvitation:true},{...legacy,whatsappInvitation:false}),false);
});

import {acknowledgeMembershipSubmission,MEMBERSHIP_COMMUNICATIONS_NOTICE_VERSION} from '../lib/membership-communications.ts';

test('Submit records service notice and a paid invitation request, without changing open answers',()=>{
 const original={...EMPTY_ANSWERS,kind:'new',dob:'01/01/1990',whatsappInvitation:false};
 const submitted=acknowledgeMembershipSubmission(original,'2026-11-06');
 assert.equal(submitted.communicationsNotice,MEMBERSHIP_COMMUNICATIONS_NOTICE_VERSION);
 assert.equal(submitted.whatsappInvitation,true);assert.equal(submitted.terms,true);assert.equal(submitted.accuracy,true);
 assert.equal(original.whatsappInvitation,false);assert.equal(original.communicationsNotice,undefined);
 assert.equal('marketingConsent' in submitted,false);
});

test('new free students request their members-only invitation through the all-tier notice',()=>{
 const submitted=acknowledgeMembershipSubmission({...EMPTY_ANSWERS,kind:'new',dob:'01/01/2006',education:'yes'},'2026-11-06');
 assert.equal(submitted.communicationsNotice,MEMBERSHIP_COMMUNICATIONS_NOTICE_VERSION);
 assert.equal(submitted.whatsappInvitation,true);
});

test('new Submit acknowledgement cannot be silently applied to a legacy payment retry',()=>{
 const legacy={...EMPTY_ANSWERS,kind:'renewal',dob:'01/01/1990'};
 const submitted=acknowledgeMembershipSubmission(legacy,'2026-11-06');
 assert.equal(sameRetryAnswers(legacy,submitted),false);
 assert.equal(sameRetryAnswers(submitted,{...submitted}),true);
});
