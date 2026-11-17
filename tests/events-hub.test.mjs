import test from 'node:test';
import assert from 'node:assert/strict';
import {eventContentSchema,saveSchema,emptyContent,bookingState,londonISO,londonInput,entriesCsv,safeBookingUrl} from '../lib/events-hub/core.ts';
const content=()=>({...emptyContent(),title:'Community lunch',venue:'Community hall',description:'A gathering',startsAt:'2027-06-01T12:00:00Z',endsAt:'2027-06-01T15:00:00Z'});
test('event schema rejects price errors, backwards times, unsafe links and injected integration permissions',()=>{
 const c=content();assert.equal(eventContentSchema.safeParse(c).success,true);
 for(const bad of [{...c,endsAt:c.startsAt},{...c,bookingType:'paid',bookingEnabled:true},{...c,image:'https://attacker.test/tracker'},{...c,bookingType:'external',externalUrl:'javascript:alert(1)'},{...c,prices:{...c.prices,member:1}},{...c,bookingOpens:'2027-06-01T12:00:00Z',bookingCloses:'2027-05-01T12:00:00Z'}])assert.equal(eventContentSchema.safeParse(bad).success,false);
 assert.equal(saveSchema.safeParse({id:null,version:0,slug:'lunch',content:c,status:'draft',form_ids:['private-form-id']}).success,false);
});
test('booking windows distinguish closed, upcoming, open and sold out at their boundaries',()=>{
 const c={...content(),bookingType:'paid',bookingEnabled:true,capacity:10,bookingOpens:'2027-05-01T00:00:00Z',bookingCloses:'2027-05-31T00:00:00Z'};
 assert.equal(bookingState(c,0,Date.parse(c.bookingOpens)-1),'Not yet open');assert.equal(bookingState(c,0,Date.parse(c.bookingOpens)),'Open');assert.equal(bookingState(c,10,Date.parse(c.bookingOpens)),'Sold Out');assert.equal(bookingState(c,0,Date.parse(c.bookingCloses)),'Closed');
});
test('UK time conversion handles summer and winter independently of the computer timezone',()=>{
 assert.equal(londonISO('2027-07-01T13:00'),'2027-07-01T12:00:00.000Z');assert.equal(londonISO('2026-12-27T13:00'),'2026-12-27T13:00:00.000Z');assert.equal(londonInput('2027-07-01T12:00:00Z'),'2027-07-01T13:00');
 assert.throws(()=>londonISO('2027-03-28T01:30'));assert.throws(()=>londonISO('2027-10-31T01:30'));assert.throws(()=>londonISO('2027-02-31T13:00'));
});
test('CSV export escapes spreadsheet formulas, quotes and multiline private notes',()=>{
 const csv=entriesCsv([{reference:'=1+1',formTitle:'Test',submittedAt:'2026-11-17',status:'pending',reviewStatus:'new',details:{contact:'Fictional'},notes:'line1\n"line2"'}]);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\'=1+1"'));assert.ok(csv.includes('line1\n""line2""'));assert.equal(safeBookingUrl('https://evil:password@example.test'),false);
});
test('named password hashes are salted, verified server-side and cannot be used as login passwords',async()=>{
 const {hashPassword,verifyPassword,passwordLookup}=await import('../lib/events-hub/passwords.ts');const password='Fictional-only-example-579';const encoded=await hashPassword(password);assert.doesNotMatch(encoded,/Fictional/);assert.equal(await verifyPassword(password,encoded),true);assert.equal(await verifyPassword('Wrong-example-password',encoded),false);assert.equal(await verifyPassword(encoded,encoded),false);assert.notEqual(passwordLookup(password,'secret-a'),passwordLookup(password,'secret-b'));assert.equal(await verifyPassword(password,'malformed'),false);
});
test('planning paragraphs use recorded work, named assignments, descriptions and deadlines without inventing progress',async()=>{
 const {planningSummary}=await import('../lib/events-hub/core.ts');const team=[{id:'a',first_name:'Azra',enabled:true},{id:'b',first_name:'Roohi',enabled:true}];const tasks=[{id:'1',title:'Confirm venue',status:'completed',assignee:'Azra',assignee_ids:['a'],due_date:'2026-11-10'},{id:'2',title:'Arrange catering',status:'in_progress',assignee:'Roohi',assignee_ids:['b'],due_date:'2026-11-18',description:'Obtain supplier quotations',updates:[{name:'Roohi',at:'2026-11-16T12:00:00Z',note:'Two quotations received'}]},{id:'3',title:'Prepare poster',status:'not_started',assignee:'Azra',assignee_ids:['a'],due_date:'2026-11-15'}];const result=planningSummary('Festival',tasks,team,Date.parse('2026-11-17T12:00:00Z'));assert.equal(result.percentage,33);for(const text of ['Confirm venue','Roohi','Obtain supplier quotations','Two quotations received','overdue','due soon'])assert.ok(result.paragraph.includes(text));assert.doesNotMatch(result.paragraph,/progressing well|on track/);assert.match(planningSummary('Festival',[],team).paragraph,/No planning tasks/);
});

test('task dates use explicit British format and reject impossible calendar dates',async()=>{const {parseUKDay}=await import('../lib/events-hub/core.ts');assert.equal(parseUKDay('25/11/2026'),'2026-11-25');assert.equal(parseUKDay('29/02/2028'),'2028-02-29');assert.equal(parseUKDay(''),null);for(const value of ['11/25/2026','31/02/2026','29/02/2027','2026-11-25'])assert.throws(()=>parseUKDay(value),/DD\/MM\/YYYY/);});
