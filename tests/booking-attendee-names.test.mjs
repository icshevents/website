import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {bookingRegistrationSchema} from '../lib/event-forms/booking.js';
import {bookingInputSchema} from '../lib/iftari/core.ts';
const people=[{firstName:' Main ',lastName:' Booker '},{firstName:'Adult',lastName:'Guest'},{firstName:'Child',lastName:'Guest'}];
const booking={eventId:randomUUID(),idempotencyKey:randomUUID(),firstName:'Contact',lastName:'Person',email:'synthetic@example.invalid',mobile:'07700900123',quantity:3,childQuantity:1,attendees:people,terms:true,expectedQuote:{configurationVersion:1,unitAmount:100,total:250}};
test('group booking requires exactly one complete first and last name per selected ticket',()=>{
 const parsed=bookingRegistrationSchema.parse(booking);assert.deepEqual(parsed.attendees[0],{firstName:'Main',lastName:'Booker'});
 for(const attendees of [undefined,[],people.slice(0,2),[...people,people[0]],[people[0],people[1],{firstName:'Child',lastName:' '}]])assert.equal(bookingRegistrationSchema.safeParse({...booking,attendees}).success,false);
 assert.equal(bookingRegistrationSchema.safeParse({...booking,quantity:4}).success,false);
});
const iftari={id:randomUUID(),capability:'a'.repeat(64),firstName:'Contact',lastName:'Person',email:'synthetic@example.invalid',mobile:'07700900123',quantities:{member:1,nonmember:0,child:1,under5:1},attendees:people.map((p,i)=>({...p,ticket:['member','child','under5'][i]})),donation:'0',expectedVersion:1,expectedTotal:3850,website:''};
test('Iftari requires all paid and free guests and matches every ticket category',()=>{
 assert.equal(bookingInputSchema.parse(iftari).attendees.length,3);
 for(const attendees of [undefined,iftari.attendees.slice(0,2),iftari.attendees.map(a=>({...a,ticket:'member'})),[...iftari.attendees,{firstName:'Extra',lastName:'Guest',ticket:'child'}]])assert.equal(bookingInputSchema.safeParse({...iftari,attendees}).success,false);
 assert.equal(bookingInputSchema.safeParse({...iftari,attendees:iftari.attendees.map(a=>({...a,lastName:'<invalid>'}))}).success,false);
});
test('booker is a separate contact and is not silently substituted for an attendee',()=>{
 assert.equal(bookingRegistrationSchema.parse({...booking,quantity:1,childQuantity:1,attendees:[people[2]]}).attendees[0].firstName,'Child');
});
