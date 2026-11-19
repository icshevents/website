import {saveEvent} from '../lib/event-forms/domain.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {paidTicketEmailContent} from '../lib/ticket-emails/core.ts';
const value={id:'11111111-1111-4111-8111-111111111111',recipient:'booker@icsh.org.uk',reference:'EVT-12345678',name:'Booker <script>',title:'ICSH winter lunch',venue:'Lahore, Eastcote',startsAt:'2026-12-27T13:00:00Z',endsAt:'2026-12-27T16:00:00Z',total:4625,attendees:[{ticket:'member',unitAmount:1850},{ticket:'member',unitAmount:1850},{ticket:'child',unitAmount:925}]};
test('paid confirmation includes verified booking reference, date, venue, quantities and exact total',()=>{
 const mail=paidTicketEmailContent(value);assert.match(mail.subject,/booking confirmed/);assert.match(mail.textbody,/places are confirmed/);assert.match(mail.textbody,/Sunday, 27 December 2026/);assert.match(mail.textbody,/13:00–16:00/);assert.match(mail.textbody,/Lahore, Eastcote/);assert.match(mail.textbody,/2 × Adult \(12\+\) at £18.50: £37.00/);assert.match(mail.textbody,/1 × Child under 12 at £9.25: £9.25/);assert.match(mail.textbody,/Total paid: £46.25/);assert.match(mail.textbody,/EVT-12345678/);assert.doesNotMatch(mail.textbody,/three.course|capability|payment_intent/i);assert.doesNotMatch(mail.htmlbody,/<script>/);assert.match(mail.htmlbody,/&lt;script&gt;/);
});
test('non-member ticket amounts and child-only bookings retain their saved prices',()=>{
 const mail=paidTicketEmailContent({...value,total:3075,attendees:[{ticket:'nonmember',unitAmount:2050},{ticket:'child',unitAmount:1025}]});assert.match(mail.textbody,/£30.75/);assert.match(mail.textbody,/Child under 12 at £10.25/);
});
test('mismatched payment totals, impossible timestamps and fictional recipients cannot send',()=>{
 for(const extra of [{total:1},{recipient:'booker@example.invalid'},{recipient:'booker@example.com'},{endsAt:value.startsAt},{attendees:[]}])assert.throws(()=>paidTicketEmailContent({...value,...extra}));
});

test('organiser event edits preserve the enabled paid-confirmation workflow',()=>{
 const event={id:value.id,version:5,title:value.title,slug:'icsh-winter-lunch-2026',description:'Winter lunch',venue:value.venue,startsAt:value.startsAt,endsAt:value.endsAt,capacity:60,status:'published',rates:{member:1850,nonmember:2050,pensioner:1850,student:1850},questions:[],paidConfirmationEmail:true};
 const updated=saveEvent({events:[event],registrations:[]},{...event,title:'ICSH winter lunch'});assert.equal(updated.paidConfirmationEmail,true);
});
