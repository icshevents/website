import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eventSchema,registrationSchema,quoteRegistration,register} from '../lib/event-forms/domain.js';
import {prepareEventMembershipChecks} from '../lib/event-forms/membership.ts';
const event=eventSchema.parse({id:randomUUID(),version:2,title:'Winter lunch',slug:'winter-lunch',description:'Three-course lunch',venue:'Lahore, Eastcote',startsAt:'2026-12-27T13:00:00Z',endsAt:'2026-12-27T16:00:00Z',capacity:60,status:'published',rates:{member:1850,nonmember:1850,pensioner:1850,student:1850,child:925},questions:[],mode:'live'});
const input=(tickets=['nonmember','nonmember','child'])=>registrationSchema.parse({eventId:event.id,idempotencyKey:randomUUID(),contact:{name:'Synthetic Booker',email:'booker@example.invalid'},attendees:tickets.map((ticket,i)=>({name:'Guest '+i,ticket})),answers:{},consent:true});
test('adult and under-12 child bookings use saved server prices without a membership lookup',async()=>{
 const data=input();assert.equal(await prepareEventMembershipChecks(event,data.attendees,()=>{throw Error('No membership check');}),null);
 const quote=quoteRegistration(event,data);assert.deepEqual(quote.attendees.map(a=>a.unitAmount),[1850,1850,925]);assert.equal(quote.total,4625);
 const record=register({events:[event],registrations:[]},data,'synthetic-capability');assert.equal(record.total,4625);assert.equal(record.attendees.length,3);assert.equal(record.status,'pending');
});
test('child tickets cannot be used on an event without a configured child price',()=>{const {child,...rates}=event.rates;assert.throws(()=>quoteRegistration({...event,rates},input(['child'])),/not available/);});
test('children and adults share the 60-place capacity',()=>{
 const state={events:[event],registrations:[{eventId:event.id,mode:'live',status:'paid',attendees:Array.from({length:59},()=>({ticket:'nonmember'}))}]};
 assert.throws(()=>register(state,input(['nonmember','child']),'capability'),/not enough places/);
 const last=register(state,input(['child']),'capability');assert.equal(last.total,925);assert.throws(()=>register(state,input(['nonmember']),'other-capability'),/not enough places/);
});
test('child tickets bypass membership discounts while adult member checks remain enforced',async()=>{
 const memberEvent={...event,membershipCheckRequired:true,rates:{...event.rates,member:1500}};
 assert.equal(await prepareEventMembershipChecks(memberEvent,input(['child']).attendees,()=>{throw Error('No child lookup');}),null);
 assert.equal(quoteRegistration(memberEvent,input(['child'])).total,925);
 assert.throws(()=>quoteRegistration(memberEvent,input(['member'])),/checked again/);
});
