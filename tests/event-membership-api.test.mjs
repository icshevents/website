import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import handler from '../lib/event-forms/handler.js';
import { requestContext } from '../lib/event-forms/context.js';
import { defaultFestivalConfig } from '../lib/event-forms/festival-config.js';
import { formRow } from '../lib/event-forms/migration.js';
const event={id:'11111111-1111-4111-8111-111111111111',version:1,title:'Event verification test',slug:'event-verification-test',status:'published',startsAt:'2028-12-01T12:00:00Z',endsAt:'2028-12-01T15:00:00Z',capacity:12,questions:[],membershipCheckRequired:true,rates:{member:500,nonmember:1000,pensioner:400,student:0}};
const contact={id:'10001',fullName:'Fictional Member',email:'member@example.invalid',mobile:'+447700900123',membershipStatus:'Active',paymentStatus:'Completed',membershipDate:'2026-01-19',membershipExpiry:'2027-01-19'};
const attendee={name:'Fictional Member',ticket:'member',membershipIdentity:{method:'email',value:'member@example.invalid'}};
function fixture(e=event){
 const tables={icsh_forms:[formRow('tickets',e),formRow('participation',defaultFestivalConfig())],icsh_submissions:[]};let writes=0;
 const db={from(table){let rows=structuredClone(tables[table]||[]);const q={select(){return q;},in(key,values){rows=rows.filter(r=>values.includes(r[key]));return q;},eq(key,value){rows=rows.filter(r=>r[key]===value);return q;},order(){return q;},limit(n){rows=rows.slice(0,n);return q;},range(a,b){return Promise.resolve({data:rows.slice(a,b+1),count:rows.length,error:null});},then(resolve,reject){return Promise.resolve({data:rows,error:null}).then(resolve,reject);}};return q;},async rpc(name,args){assert.equal(name,'icsh_event_write');writes++;for(const c of args.p_changes){const table=c.table==='forms'?'icsh_forms':'icsh_submissions';const old=tables[table].findIndex(r=>r.id===c.data.id);if(old<0)tables[table].push(c.data);else tables[table][old]=c.data;}return {data:true,error:null};}};
 return {db,tables,get writes(){return writes;}};
}
function input(){return {eventId:event.id,idempotencyKey:randomUUID(),contact:{name:'Fictional group',email:'group@example.invalid',phone:''},attendees:[structuredClone(attendee)],answers:{},consent:true,testData:true,website:''};}
async function call(context,path,body,lookupMembership){
 const req={url:'https://icsh.test/api/event-forms/'+path,query:{path},method:'POST',headers:{origin:'https://icsh.test','content-type':'application/json','x-csrf-token':'fixture-csrf','x-registration-token':'a'.repeat(64)},body};let status=200,raw;
 await requestContext.run({db:context.db,path,body,method:'POST',url:new URL(req.url),req,secret:'fixture-secret',lookupMembership,session:{csrf:'fixture-csrf',issuedAt:Date.now()-2000,save:async()=>{}}},()=>handler(req,{get statusCode(){return status;},set statusCode(n){status=n;},setHeader(){},end(v){raw=v;}}));return {status,body:JSON.parse(raw)};
}
function freezeDate(t){t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-22T12:00:00Z')});}

test('quote and final booking each read Bigin; a membership becoming inactive cannot save a booking',async t=>{
 freezeDate(t);const f=fixture();let calls=0;const body=input();const read=async()=>({records:[{...contact,membershipStatus:++calls===1?'Active':'Inactive'}],hasMore:false});
 const quote=await call(f,'quote',body,read);assert.equal(quote.status,200);assert.equal(quote.body.attendees[0].membership.verified,true);
 body.membership={verified:true};body.attendees[0].membership={verified:true};
 const final=await call(f,'registrations',body,read);assert.equal(final.status,409);assert.equal(final.body.membership.status,'inactive');assert.equal(final.body.attendeeIndex,0);assert.equal(calls,2);assert.equal(f.writes,0);
});

test('a valid member booking saves only the public membership result and server-calculated price',async t=>{
 freezeDate(t);const f=fixture();const result=await call(f,'registrations',input(),async()=>({records:[contact],hasMore:false}));assert.equal(result.status,201);assert.equal(result.body.registration.total,500);assert.equal(f.writes,1);
 const saved=f.tables.icsh_submissions[0].answers.record;
 assert.equal(saved.attendees[0].membership.verified,true);
 assert.doesNotMatch(JSON.stringify(saved.attendees),/member@example.invalid|447700|membershipIdentity|10001/);
 assert.equal(result.body.registration.paymentProvider,'simulated');
});

test('forms with membership checks disabled never contact Bigin or require attendee contact fields',async t=>{
 freezeDate(t);const f=fixture({...event,membershipCheckRequired:false});let calls=0;const read=async()=>{calls++;throw new Error('must not call');};
 assert.deepEqual((await call(f,'membership',{eventId:event.id},read)).body,{required:false,membership:null});
 const body=input();delete body.attendees[0].membershipIdentity;body.attendees[0].membershipId='';
 assert.equal((await call(f,'quote',body,read)).status,200);assert.equal((await call(f,'registrations',body,read)).status,201);assert.equal(calls,0);
});

test('membership-only checks project active/inactive/no-match results without exposing CRM identifiers',async t=>{
 freezeDate(t);const f=fixture();for(const [records,expected] of [[[contact],'active'],[[{...contact,membershipExpiry:'2026-07-30'}],'inactive'],[[],'not_found']]){
 const result=await call(f,'membership',{eventId:event.id,attendee:{name:attendee.name,membershipIdentity:attendee.membershipIdentity}},async()=>({records,hasMore:false}));assert.equal(result.status,200);assert.equal(result.body.membership.status,expected);assert.doesNotMatch(JSON.stringify(result.body),/10001|member@example.invalid|447700|fullName/);
 }assert.equal(f.writes,0);
});

test('provider failures and direct requests without identity cannot claim the member rate',async t=>{
 freezeDate(t);const f=fixture();const result=await call(f,'registrations',input(),async()=>{throw new Error('private OAuth token');});assert.equal(result.status,503);assert.doesNotMatch(JSON.stringify(result.body),/OAuth|token/);assert.equal(f.writes,0);
 const body=input();body.attendees[0]={name:'Fictional Member',ticket:'member',membershipId:'TEST-MEMBER-001',verified:true};
 assert.equal((await call(f,'registrations',body,async()=>({records:[contact],hasMore:false}))).status,400);assert.equal(f.writes,0);
});

test('a form changed during verification requires a new review before saving',async t=>{
 freezeDate(t);const f=fixture();const result=await call(f,'registrations',input(),async()=>{f.tables.icsh_forms.find(r=>r.id===event.id).configuration.version=2;return {records:[contact],hasMore:false};});assert.equal(result.status,409);assert.match(result.body.error,/checked again/);assert.equal(f.writes,0);
});
