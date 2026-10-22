import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { quoteRegistration, register, registrationSchema, eventSchema } from '../lib/event-forms/domain.js';
import { lookupEventAttendee, prepareEventMembershipChecks, EventMembershipError } from '../lib/event-forms/membership.ts';
const on='2026-10-22';
const event={id:'11111111-1111-4111-8111-111111111111',version:1,title:'Membership check test',status:'published',startsAt:'2028-11-01T12:00:00Z',capacity:12,questions:[],membershipCheckRequired:true,rates:{member:500,nonmember:1000,pensioner:400,student:0}};
const member=(changes={})=>({id:'10001',fullName:'Alex Smith',email:'alex@example.invalid',mobile:'+447700900123',membershipStatus:'Active',paymentStatus:'Completed',membershipDate:'2026-01-19',membershipExpiry:'2027-01-19',Created_Time:'2020-01-01T12:00:00Z',Member_Year:'2020',...changes});
const attendee=(changes={})=>({name:'Alex Smith',ticket:'member',membershipIdentity:{method:'email',value:'alex@example.invalid'},...changes});
const lookup=records=>async()=>({records,hasMore:false});
const input=(attendees=[attendee()])=>registrationSchema.parse({eventId:event.id,idempotencyKey:randomUUID(),contact:{name:'Fictional Group Contact',email:'group@example.invalid',phone:''},attendees,answers:{},consent:true,testData:true,website:''});
function freezeDate(t,date=on+'T12:00:00Z'){t.mock.timers.enable({apis:['Date'],now:new Date(date)});}

test('Bigin saved dates and status govern member eligibility at signup, even for a later event',async t=>{
 freezeDate(t);
 const data=input(),checks=await prepareEventMembershipChecks(event,data.attendees,lookup([member()]),on);
 const quote=quoteRegistration(event,data,checks);
 assert.equal(quote.attendees[0].membership.status,'active');
 assert.equal(quote.attendees[0].membership.membershipDate,'2026-01-19');
 assert.equal(quote.attendees[0].membership.membershipExpiry,'2027-01-19');
 assert.equal(quote.total,500);assert.equal(quote.mode,'test');
 const saved=register({events:[event],registrations:[]},data,'test-capability',checks);
 assert.equal(saved.total,500);assert.equal(saved.paymentProvider,'simulated');
 assert.doesNotMatch(JSON.stringify(saved.attendees),/alex@example|447700|membershipIdentity|10001|Created_Time|Member_Year/);
});

test('membership check off makes no provider calls and leaves the configured prices unchanged',async t=>{
 freezeDate(t);let calls=0;const off={...event,membershipCheckRequired:false};
 const data=input([{name:'Any Guest',ticket:'member'},{name:'Other Guest',ticket:'nonmember'}]);
 assert.equal(await prepareEventMembershipChecks(off,data.attendees,async()=>{calls++;throw new Error('must not call');}),null);
 const quote=quoteRegistration(off,data);assert.equal(calls,0);assert.equal(quote.total,1500);
 assert.ok(quote.attendees.every(a=>a.membership===null));
});

test('nonmember, pensioner and student tickets keep their existing rules without checking Bigin',async t=>{
 freezeDate(t);let calls=0;const data=input(['nonmember','pensioner','student'].map(ticket=>({name:ticket+' guest',ticket})));
 assert.equal(await prepareEventMembershipChecks(event,data.attendees,async()=>{calls++;}),null);
 assert.equal(quoteRegistration(event,data).total,1400);assert.equal(calls,0);
});

test('mixed groups check each member ticket independently and do not reuse the group contact',async t=>{
 freezeDate(t);const calls=[];const data=input([attendee(),{name:'Nonmember guest',ticket:'nonmember'},{name:'Student guest',ticket:'student'}]);
 const checks=await prepareEventMembershipChecks(event,data.attendees,async q=>{calls.push(q);return {records:[member()],hasMore:false};},on);
 assert.deepEqual(calls,[{method:'email',email:'alex@example.invalid'}]);
 const quote=quoteRegistration(event,data,checks);assert.deepEqual(quote.attendees.map(a=>a.unitAmount),[500,1000,0]);
 assert.equal(quote.attendees[0].membership.verified,true);assert.equal(quote.attendees[1].membership,null);
});

test('duplicate full names are resolved by unique contact details; shared identifiers stay ambiguous',async t=>{
 freezeDate(t);const second=member({id:'10002',email:'second@example.invalid',mobile:'+447700900124'});
 const data=input([attendee(),attendee({membershipIdentity:{method:'email',value:'second@example.invalid'}})]);
 const checks=await prepareEventMembershipChecks(event,data.attendees,lookup([member(),second]),on);
 assert.equal(quoteRegistration(event,data,checks).total,1000);
 const ambiguous=await lookupEventAttendee(attendee(),lookup([member(),member({id:'10002'})]),on);
 assert.equal(ambiguous.result.status,'ambiguous');assert.equal(ambiguous.contactId,undefined);
});

test('one Bigin contact cannot qualify two attendees for member tickets',async()=>{
 await assert.rejects(()=>prepareEventMembershipChecks(event,[attendee(),attendee()],lookup([member()]),on),/different member/);
});

test('phone formats and name case normalize without accepting another attendee’s identity',async()=>{
 const checked=await lookupEventAttendee(attendee({name:' ALEX   SMITH ',membershipIdentity:{method:'mobile',value:'07700 900123'}}),lookup([member()]),on);
 assert.equal(checked.result.status,'active');
 const mismatch=await lookupEventAttendee(attendee({name:'Other Person'}),lookup([member()]),on);
 assert.deepEqual(mismatch.result,{status:'identity_mismatch',verified:false,checkedOn:on});
});

test('inactive, expired, future and undated memberships cannot qualify for member tickets',async()=>{
 for(const [changes,reason] of [[{membershipExpiry:on},'expired'],[{membershipStatus:'Inactive'},'inactive'],[{paymentStatus:'Processing'},'inactive'],[{membershipDate:'2026-12-01'},'not_started'],[{membershipDate:null},'expired_undated'],[{membershipExpiry:''},'expired_undated']]){
  const result=await lookupEventAttendee(attendee(),lookup([member(changes)]),on);assert.equal(result.result.status,'inactive');assert.equal(result.result.reason,reason);
  await assert.rejects(()=>prepareEventMembershipChecks(event,[attendee()],lookup([member(changes)]),on),error=>error instanceof EventMembershipError&&error.status===409&&error.attendeeIndex===0);
 }
 const invalid=await lookupEventAttendee(attendee(),lookup([member({membershipExpiry:'2027-02-30'})]),on);assert.equal(invalid.result.status,'review_required');
 assert.equal((await lookupEventAttendee(attendee(),lookup([member({membershipDate:on,paymentStatus:'Not required'})]),on)).result.status,'active');
});

test('not found, truncated results and connection errors never grant member pricing',async()=>{
 assert.equal((await lookupEventAttendee(attendee(),lookup([]),on)).result.status,'not_found');
 assert.equal((await lookupEventAttendee(attendee(),async()=>({records:[member()],hasMore:true}),on)).result.status,'ambiguous');
 await assert.rejects(()=>lookupEventAttendee(attendee(),async()=>{throw new Error('private token and URL');},on),error=>error.status===503&&!error.message.includes('private'));
});

test('client flags, copied proof JSON and a synthetic test membership ID cannot authorize a member rate',async t=>{
 freezeDate(t);const data=input([{name:'Alex Smith',ticket:'member',membershipId:'TEST-MEMBER-001',membership:{verified:true},active:true}]);
 assert.equal('membership' in data.attendees[0],false);
 assert.throws(()=>quoteRegistration(event,data,{verified:true}),/checked again/);
 const checks=await prepareEventMembershipChecks(event,[attendee()],lookup([member()]),on);
 assert.throws(()=>quoteRegistration(event,input(),JSON.parse(JSON.stringify(checks))),/checked again/);
 await assert.rejects(()=>prepareEventMembershipChecks(event,data.attendees,lookup([member()]),on),/own email address or phone/);
});

test('proof cannot be reused for a different attendee, event version or calendar date',async t=>{
 freezeDate(t);const data=input(),checks=await prepareEventMembershipChecks(event,data.attendees,lookup([member()]),on);
 assert.throws(()=>quoteRegistration({...event,version:2},data,checks),/checked again/);
 assert.throws(()=>quoteRegistration({...event,id:randomUUID()},data,checks),/checked again/);
 assert.throws(()=>quoteRegistration(event,input([attendee({name:'Other Person'})]),checks),/checked again/);
 t.mock.timers.setTime(new Date('2026-10-23T12:00:00Z').getTime());
 assert.throws(()=>quoteRegistration(event,data,checks),/checked again/);
});

test('event settings default to no required check and only accept an explicit boolean',()=>{
 const base={title:'Example event',slug:'example-event',description:'Example description',venue:'Test venue',startsAt:'2028-11-01T12:00:00Z',endsAt:'2028-11-01T15:00:00Z',capacity:12,status:'draft',rates:event.rates,questions:[]};
 assert.equal(eventSchema.parse(base).membershipCheckRequired,false);
 assert.equal(eventSchema.parse({...base,membershipCheckRequired:true}).membershipCheckRequired,true);
 assert.throws(()=>eventSchema.parse({...base,membershipCheckRequired:'true'}));
});
