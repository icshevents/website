import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {prepareBookingPrice,verifiedBookingPrice} from '../lib/event-forms/booking-membership.ts';
import {bookingRegistrationSchema,registerBooking} from '../lib/event-forms/booking.js';
import {eventSchema} from '../lib/event-forms/domain.js';
const on='2026-11-16';
const event=eventSchema.parse({id:randomUUID(),version:4,title:'ICSH winter lunch',slug:'icsh-winter-lunch-2026',description:'Community lunch',venue:'Lahore, Eastcote',startsAt:'2026-12-27T13:00:00Z',endsAt:'2026-12-27T16:00:00Z',capacity:60,status:'published',mode:'live',pricingStrategy:'booking_email',membershipPricingRule:'active',rates:{member:1850,nonmember:2050,pensioner:1850,student:1850,child:925,childNonmember:1025},questions:[]});
const member={id:'123',email:'booker@example.invalid',membershipStatus:'Active',paymentStatus:'Not required',membershipDate:'2026-01-01',membershipExpiry:'2027-01-01'};
const quote=(records,children=1,quantity=3)=>prepareBookingPrice(event,'booker@example.invalid',quantity,async()=>({records,hasMore:false}),false,on,children);
test('active booking contact, including free membership, sets adult and child member prices',async()=>{for(const paymentStatus of ['Completed','Not required']){const {quote:q}=await quote([{...member,paymentStatus}]);assert.equal(q.discountEligible,true);assert.deepEqual([q.unitAmount,q.childUnitAmount,q.adultQuantity,q.childQuantity,q.total],[1850,925,2,1,4625]);}});
test('non-member, inactive and expired booking contacts use adult £20.50 and child £10.25',async()=>{for(const records of [[],[{...member,membershipStatus:'Inactive'}],[{...member,membershipExpiry:on}]]){const {quote:q}=await quote(records);assert.deepEqual([q.unitAmount,q.childUnitAmount,q.total],[2050,1025,5125]);}});
test('adult-child mix is bound to proof and final saved price; all attendees count towards capacity',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date(on+'T12:00:00Z')});
 const {quote:q,proof}=await quote([member]);
 assert.throws(()=>verifiedBookingPrice(event,'booker@example.invalid',3,false,proof,on,2),/RECHECK/);
 const input=bookingRegistrationSchema.parse({eventId:event.id,idempotencyKey:randomUUID(),firstName:'Synthetic',lastName:'Booker',email:'booker@example.invalid',mobile:'07700900123',quantity:3,childQuantity:1,attendees:[{firstName:'Synthetic',lastName:'Booker'},{firstName:'Adult',lastName:'Guest'},{firstName:'Child',lastName:'Guest'}],terms:true,expectedQuote:{configurationVersion:4,unitAmount:1850,total:4625}});
 const record=registerBooking({events:[event],registrations:[]},input,'synthetic',proof);
 assert.equal(record.total,4625);assert.deepEqual(record.attendees.map(a=>a.name),['Synthetic Booker','Adult Guest','Child Guest']);assert.equal(record.attendees[2].firstName,'Child');assert.deepEqual(record.attendees.map(a=>a.unitAmount),[1850,1850,925]);assert.deepEqual(record.attendees.map(a=>a.ticket),['member','member','child']);
 const occupied={events:[event],registrations:[{eventId:event.id,mode:'live',status:'confirmed_paid',attendees:Array(58).fill({})}]};
 assert.throws(()=>registerBooking(occupied,input,'synthetic',proof),/not enough places/);
 assert.throws(()=>registerBooking({events:[event],registrations:[]},{...input,childQuantity:2},'synthetic',proof),/checked again/);
});
test('child-only quantities price correctly; impossible mixes and unavailable child rates are rejected',async()=>{
 assert.equal((await quote([],2,2)).quote.total,2050);
 await assert.rejects(()=>quote([],4,3),/CHILD_QUANTITY/);
 const {childNonmember,...rates}=event.rates;
 await assert.rejects(()=>prepareBookingPrice({...event,rates},'booker@example.invalid',2,async()=>({records:[],hasMore:false}),false,on,1),/CHILD_QUANTITY/);
});
