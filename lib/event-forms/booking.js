import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError, occupied } from './domain.js';
import { membershipMobileKey } from '../membership-eligibility.ts';
import { verifiedBookingPrice } from './booking-membership.ts';

const email=z.email().max(254).transform(s=>s.toLowerCase());
const name=z.string().trim().min(1).max(80).refine(s=>!/[<>\u0000-\u001f]/.test(s),'Enter a valid name.');
export const bookingQuoteSchema=z.object({eventId:z.uuid(),email,quantity:z.number().int().min(1).max(12),continueAsNonMember:z.boolean().default(false)}).strict();
export const bookingRegistrationSchema=z.object({
 eventId:z.uuid(),idempotencyKey:z.uuid(),firstName:name,lastName:name,email,
 mobile:z.string().trim().max(25).refine(v=>Boolean(membershipMobileKey(v)),'Enter a valid mobile number.'),
 quantity:z.number().int().min(1).max(12),dietaryRequirements:z.string().trim().max(2000).default(''),additionalNotes:z.string().trim().max(2000).default(''),
 terms:z.literal(true),continueAsNonMember:z.boolean().default(false),website:z.string().max(0).default(''),
 expectedQuote:z.object({configurationVersion:z.number().int().nonnegative(),unitAmount:z.number().int().min(0).max(1000000),total:z.number().int().min(0).max(12000000)}).strict(),
}).strict();
export function bookingEvent(state,id){const e=state.events.find(e=>e.id===id&&e.status==='published'&&e.pricingStrategy==='booking_email');if(!e||Date.parse(e.startsAt)<=Date.now())throw new AppError('This registration form is not open.',409);return e;}
const requestHash=input=>createHash('sha256').update(JSON.stringify(input)).digest('hex');
export function bookingReplay(state,input,capabilityHash){
 const old=state.registrations.find(r=>r.eventId===input.eventId&&r.idempotencyKey===input.idempotencyKey);
 if(!old)return null;
 if(old.capabilityHash!==capabilityHash||old.requestHash!==requestHash(input))throw new AppError('This booking was already saved. Use your private confirmation link.',409);
 return old;
}
export function registerBooking(state,input,capabilityHash,proof){
 const old=bookingReplay(state,input,capabilityHash);if(old)return old;
 const event=bookingEvent(state,input.eventId);let quote;
 try{quote=verifiedBookingPrice(event,input.email,input.quantity,input.continueAsNonMember,proof);}catch{throw new AppError('Pricing needs to be checked again. Review the current price before submitting.',409);}
 if(quote.configurationVersion!==input.expectedQuote.configurationVersion||quote.unitAmount!==input.expectedQuote.unitAmount||quote.total!==input.expectedQuote.total)throw new AppError('Your price has changed. Check the updated price and submit again.',409);
 if(occupied(state,event.id)+input.quantity>event.capacity)throw new AppError('There are not enough places remaining for this group.',409);
 const id=randomUUID(),now=new Date().toISOString(),memberTicket=quote.discountEligible===true;
 const ticket=memberTicket?'member':'nonmember';
 const record={id,idempotencyKey:input.idempotencyKey,requestHash:requestHash(input),reference:(event.prototype?'TEST-':'EVT-')+id.slice(0,8).toUpperCase(),
  eventId:event.id,eventTitle:event.title,eventStartsAt:event.startsAt,contact:{name:input.firstName+' '+input.lastName,email:input.email,phone:membershipMobileKey(input.mobile)},
  attendees:Array.from({length:input.quantity},(_,i)=>({name:i===0?input.firstName+' '+input.lastName:'Guest '+(i+1)+' (name not collected)',ticket,unitAmount:quote.unitAmount,membershipId:'',membership:null})),
  booking:{pricingStrategy:'booking_email',quantity:input.quantity,membership:quote,terms:event.eventTerms,termsAgreed:true,prototype:Boolean(event.prototype)},
  answers:{dietary:input.dietaryRequirements,additional:input.additionalNotes},questionSnapshot:[{id:'dietary',label:'Dietary requirements'},{id:'additional',label:'Additional notes'}],
  total:quote.total,currency:'gbp',mode:event.mode||'live',status:quote.total?'pending':'confirmed_free',paymentProvider:'not_connected',createdAt:now,updatedAt:now,capabilityHash,notes:''};
 state.registrations.push(record);return record;
}
