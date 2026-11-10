import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {prepareBookingPrice,verifiedBookingPrice} from '../lib/event-forms/booking-membership.ts';
import {bookingRegistrationSchema,registerBooking} from '../lib/event-forms/booking.js';
import {quoteRegistration} from '../lib/event-forms/domain.js';
import {cleanRegistration} from '../lib/event-forms/security.js';
const on='2026-10-22';
const event=()=>({id:'11111111-1111-4111-8111-111111111111',version:1,pricingStrategy:'booking_email',prototype:true,mode:'test',title:'Christmas Party prototype',slug:'christmas-party-prototype',status:'published',startsAt:'2026-12-19T18:00:00Z',capacity:100,eventTerms:'Prototype only; no payment.',rates:{member:1500,pensioner:1500,student:1500,nonmember:2500}});
const member=(changes={})=>({id:'123',fullName:'Fictional Member',email:'member@example.com',mobile:null,membershipStatus:'Active',paymentStatus:'Completed',membershipDate:'2026-02-01',membershipExpiry:'2027-02-01',...changes});
const lookup=(records,hasMore=false)=>async input=>{assert.deepEqual(input,{method:'email',email:'member@example.com'});return {records,hasMore};};
const price=(records,quantity=1,e=event())=>prepareBookingPrice(e,' MEMBER@EXAMPLE.COM ',quantity,lookup(records),false,on);
function input(q,changes={}){return bookingRegistrationSchema.parse({eventId:event().id,idempotencyKey:randomUUID(),firstName:'Fictional',lastName:'Booker',email:'member@example.com',mobile:'07700900123',quantity:q.quantity,dietaryRequirements:'Vegetarian',additionalNotes:'Synthetic test',terms:true,continueAsNonMember:false,website:'',expectedQuote:{configurationVersion:q.configurationVersion,unitAmount:q.unitAmount,total:q.total},...changes});}
function freeze(t){t.mock.timers.enable({apis:['Date'],now:new Date(on+'T12:00:00Z')});}

test('active regular, pensioner and student membership all cost £15 and cover the booking quantity',async()=>{
 for(const membershipType of ['Regular Member','Pensioner Member','Student Member',null]){
  const {quote,diagnostics}=await price([member({membershipType})],2);assert.equal(quote.memberStatus,'active');assert.equal(quote.unitAmount,1500);assert.equal(quote.discountEligible,true);assert.equal(quote.total,3000);assert.equal(quote.canRegister,true);assert.equal(diagnostics.records[0].contactId,'123');assert.doesNotMatch(JSON.stringify(quote),/member@example|123|membershipExpiry|paymentStatus|membershipDate/);
 }
});
test('membership type never changes the active paid member price, even if legacy category rates differ',async()=>{
 const e={...event(),rates:{member:1500,pensioner:1000,student:700,nonmember:2500}};
 for(const [membershipType,amount]of [['regular',1500],['pensioner',1500],['student',1500],['unmapped',1500],[null,1500]]){
  const {quote}=await price([member({membershipType})],3,e);assert.equal(quote.unitAmount,amount);assert.equal(quote.total,amount*3);
 }
});
test('inactive, expired, future, malformed, missing-date and unpaid contacts never receive member prices',async()=>{
 for(const changes of [{membershipStatus:'Inactive'},{membershipExpiry:on},{membershipExpiry:'2026-01-01'},{membershipDate:'2026-12-01'},{membershipDate:null},{membershipExpiry:''},{membershipExpiry:'2027-02-30'},{membershipDate:'2027-01-01',membershipExpiry:'2026-12-01'}]){
  const {quote}=await price([member(changes)],2);assert.equal(quote.memberStatus,'inactive');assert.equal(quote.unitAmount,2500);assert.equal(quote.total,5000);
 }
 for(const paymentStatus of ['Not required','Awaiting payment','Processing',null]){const {quote}=await price([member({paymentStatus,membershipType:'Student'})]);assert.equal(quote.memberStatus,'active');assert.equal(quote.discountEligible,false);assert.equal(quote.unitAmount,2500);assert.equal(quote.priceRule,'active_without_completed_payment');}
});
test('no exact email match is a £25 non-member booking',async()=>{
 for(const records of [[],[member({email:'someone-else@example.com'})]]){const {quote}=await price(records,2);assert.equal(quote.memberStatus,'non_member');assert.equal(quote.total,5000);}
});
test('duplicates remain ambiguous regardless of order, activity or incomplete pagination',async()=>{
 for(const records of [[member(),member({id:'456',membershipStatus:'Inactive'})],[member({id:'456'}),member()]]){
  const {quote,diagnostics}=await price(records);assert.equal(quote.memberStatus,'ambiguous');assert.equal(quote.unitAmount,null);assert.equal(quote.canRegister,false);assert.equal(diagnostics.matchedCount,2);
 }
 const {quote}=await prepareBookingPrice(event(),'member@example.com',1,lookup([member()],true),false,on);assert.equal(quote.memberStatus,'ambiguous');
});
test('provider errors expose no secrets and allow an explicit non-member fallback',async()=>{
 const fail=async()=>{throw Error('refresh_token=private-secret');};
 const result=await prepareBookingPrice(event(),'member@example.com',2,fail,false,on);assert.equal(result.quote.memberStatus,'unavailable');assert.equal(result.quote.unitAmount,null);assert.doesNotMatch(JSON.stringify(result),/private-secret|refresh_token/);
 const fallback=await prepareBookingPrice(event(),'member@example.com',2,fail,true,on);assert.equal(fallback.quote.memberStatus,'unverified');assert.equal(fallback.quote.unitAmount,2500);assert.equal(fallback.quote.total,5000);
});
test('opaque proofs reject browser JSON, stale dates, another email, event version, quantity and fallback',async()=>{
 const e=event(),{quote,proof}=await price([member()],2,e);assert.equal(verifiedBookingPrice(e,'member@example.com',2,false,proof,on).total,3000);
 for(const [ev,email,n,choice,p,date]of [[e,'member@example.com',2,false,JSON.parse(JSON.stringify(proof)),on],[e,'other@example.com',2,false,proof,on],[{...e,version:2},'member@example.com',2,false,proof,on],[e,'member@example.com',1,false,proof,on],[e,'member@example.com',2,true,proof,on],[e,'member@example.com',2,false,proof,'2026-10-23']])assert.throws(()=>verifiedBookingPrice(ev,email,n,choice,p,date),/RECHECK/);
 quote.unitAmount=1;assert.equal(verifiedBookingPrice(e,'member@example.com',2,false,proof,on).unitAmount,1500);
});
test('server booking saves the authoritative rate, private declarations and pending payment once',async t=>{
 freeze(t);const e=event(),{quote,proof}=await price([member()],2,e),body=input(quote),s={events:[e],registrations:[]};
 const r=registerBooking(s,body,'private-capability',proof);assert.equal(r.total,3000);assert.equal(r.attendees.length,2);assert.equal(r.mode,'test');assert.equal(r.status,'pending');assert.equal(r.paymentProvider,'not_connected');assert.equal(r.answers.dietary,'Vegetarian');assert.equal(r.contact.phone,'+447700900123');assert.equal(r.booking.termsAgreed,true);
 assert.equal(registerBooking(s,body,'private-capability',{}).id,r.id);assert.equal(s.registrations.length,1);assert.throws(()=>registerBooking(s,body,'other',proof),/already saved/);assert.throws(()=>registerBooking(s,{...body,firstName:'Changed'},'private-capability',proof),/already saved/);
 assert.doesNotMatch(JSON.stringify(cleanRegistration(r)),/private-capability|requestHash|idempotencyKey|contactId|membershipExpiry/);
});
test('tampered or changed prices, stale proofs and over-capacity requests cannot save',async t=>{
 freeze(t);const e=event(),{quote,proof}=await price([member()],2,e),body=input(quote);
 assert.throws(()=>registerBooking({events:[e],registrations:[]},{...body,expectedQuote:{...body.expectedQuote,total:1}},'a',proof),/price has changed/);
 assert.throws(()=>registerBooking({events:[{...e,version:2}],registrations:[]},body,'a',proof),/checked again/);
 assert.throws(()=>registerBooking({events:[{...e,capacity:1}],registrations:[]},body,'a',proof),/not enough places/);
});
test('legacy ticket endpoints cannot bypass automatic email pricing',()=>{
 assert.throws(()=>quoteRegistration(event(),{attendees:[{name:'Bypass',ticket:'member'}],answers:{}},null),/automatic email pricing/);
});
test('strict registration validation rejects browser membership claims and invalid quantities',async()=>{
 const {quote}=await price([member()]);for(const extra of [{memberStatus:'active'},{membershipType:'student'},{unitAmount:1},{quantity:0},{quantity:1.5},{quantity:13},{terms:false},{mobile:'invalid'}])assert.throws(()=>input(quote,extra));
});

test('turning off membership checks cannot grant an unverified member discount',()=>{
 const e={...event(),pricingStrategy:'per_attendee',membershipCheckRequired:false};assert.throws(()=>quoteRegistration(e,{attendees:[{name:'Guest',ticket:'member'}],answers:{}},null),/discount requires a membership check/);
});
