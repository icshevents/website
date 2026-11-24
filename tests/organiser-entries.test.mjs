import test from 'node:test';
import assert from 'node:assert/strict';
import {bookingEntryView,entryPages,entryValues,eventEntryAmounts} from '../lib/organiser-entries.ts';
test('entry lists continue past the first database page and fail closed on a later error',async()=>{
 const calls=[];const rows=await entryPages(async(from,to)=>{calls.push([from,to]);return {data:Array.from({length:from===0?500:1},(_,i)=>({id:from+i})),error:null};});
 assert.equal(rows.length,501);assert.equal(rows[500].id,500);assert.deepEqual(calls,[[0,499],[500,999]]);
 await assert.rejects(entryPages(async from=>from?{data:null,error:{message:'unavailable'}}:{data:Array(500).fill({id:1}),error:null}),/temporarily unavailable/);
});
test('search and spreadsheet values preserve nested answers, zero and false',()=>{
 assert.deepEqual(entryValues({contact:{email:'test@example.invalid'},answers:{Diet:['Vegetarian','Nut allergy'],Consent:false,Tickets:0,Note:'Line one\nLine two'},unused:null}),{'contact · email':'test@example.invalid','answers · Diet':'Vegetarian | Nut allergy','answers · Consent':'No','answers · Tickets':0,'answers · Note':'Line one\nLine two'});
});

test('older booking rows format pence and distinguish known names from unnamed tickets', () => {
 const booking = bookingEntryView('tickets', {
  total:11100,contact:{name:'Aisha Khan',email:'aisha@example.invalid'},answers:{Diet:'Halal'},
  attendees:[{name:'Aisha Khan',ticket:'member',unitAmount:1850},...Array.from({length:5},(_,i)=>({
   name:`Guest ${i+2} (name not collected)`,ticket:'member',unitAmount:1850,
  }))],
 });
 assert.equal(booking.total,'£111.00');
 assert.equal(booking.booker,'Aisha Khan');
 assert.deepEqual([booking.adults,booking.children,booking.unnamed],[6,0,5]);
 assert.deepEqual(booking.names,['Aisha Khan']);
 assert.deepEqual(booking.details,{contact:{name:'Aisha Khan',email:'aisha@example.invalid'},answers:{Diet:'Halal'}});
});

test('current ticket and Iftari bookings count children and only display names in the attendee list', () => {
 const attendees=[{firstName:'Aisha',lastName:'Khan',ticket:'nonmember',unitAmount:2050},
  {firstName:'Sami',lastName:'Khan',ticket:'child',unitAmount:1025}];
 const tickets=bookingEntryView('tickets',{total:3075,attendees});
 assert.deepEqual([tickets.adults,tickets.children,tickets.unnamed],[1,1,0]);
 assert.deepEqual(tickets.names,['Aisha Khan','Sami Khan']);
 assert.equal(tickets.total,'£30.75');
 const iftari=bookingEntryView('iftari',{contact:{firstName:'Aisha',lastName:'Khan',attendees},
  quantities:{member:0,nonmember:1,child:1,under5:1},quote:{total:4100}});
 assert.deepEqual([iftari.adults,iftari.children,iftari.unnamed],[1,2,1]);
 assert.deepEqual(iftari.names,['Aisha Khan','Sami Khan']);
 assert.equal(iftari.booker,'Aisha Khan');
 assert.equal(iftari.total,'£41.00');
 assert.equal(bookingEntryView('tickets',{total:0,attendees:[]}).total,'£0.00');
 assert.equal(bookingEntryView('stall',{total:6500,attendees:[]}),null);
});

test('event form details format saved money in pounds without converting counts or custom answers', () => {
 const details = {
  total:3075, fee:6500, discountPence:200, grossTicketPence:3275, netTotalPence:3075,
  donation:{type:'money',amountPence:575},
  package:{label:'Standard',fee:6500},
  attendees:[{name:'Aisha Khan',ticket:'member',unitAmount:2500}],
  quantities:{member:1,child:0},
  answers:{amountPence:1234,fee:26},
  quote:{tickets:2700,donation:575,total:3075,guests:1,
   lines:[{key:'donation',quantity:1,unitAmount:575,amount:575}],
   promotion:{grossPence:3275,discountPence:200,payablePence:3075,units:1}},
 };
 const display = eventEntryAmounts(details);
 assert.equal(display.Total,'£30.75');
 assert.equal(display['Stall fee'],'£65.00');
 assert.equal(display.Discount,'£2.00');
 assert.equal(display['Original ticket total'],'£32.75');
 assert.equal(display['Final booking total'],'£30.75');
 assert.deepEqual(display.donation,{type:'money','Pledge amount':'£5.75'});
 assert.deepEqual(display.package,{label:'Standard','Stall fee':'£65.00'});
 assert.deepEqual(display.attendees,[{name:'Aisha Khan',ticket:'member','Ticket price':'£25.00'}]);
 assert.deepEqual(display.quote,{ 'Ticket subtotal':'£27.00',Donation:'£5.75',Total:'£30.75',guests:1,
  lines:[{key:'donation',quantity:1,'Unit price':'£5.75','Line total':'£5.75'}],
  promotion:{'Original total':'£32.75',Discount:'£2.00','Total payable':'£30.75',units:1} });
 assert.deepEqual(display.answers,details.answers);
 assert.deepEqual(display.quantities,details.quantities);
 assert.equal(details.donation.amountPence,575);
 assert.deepEqual(eventEntryAmounts({donation:{type:'food',amountPence:0,description:'Cakes'}}).donation,
  {type:'food',description:'Cakes'});
 assert.equal(eventEntryAmounts({total:0}).Total,'£0.00');
});
