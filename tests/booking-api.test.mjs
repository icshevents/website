import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID}from'node:crypto';
import handler from '../lib/event-forms/handler.js';import{requestContext}from'../lib/event-forms/context.js';import{defaultFestivalConfig}from'../lib/event-forms/festival-config.js';import{formRow}from'../lib/event-forms/migration.js';import{eventDirectory}from'../lib/event-forms/directory.js';
const event={id:'11111111-1111-4111-8111-111111111111',version:1,title:'Christmas Party prototype',slug:'christmas-party-prototype',status:'published',pricingStrategy:'booking_email',prototype:true,mode:'test',startsAt:'2026-12-19T18:00:00Z',endsAt:'2026-12-19T22:00:00Z',capacity:100,questions:[],membershipCheckRequired:false,rates:{member:1500,nonmember:2500,pensioner:1500,student:1500}};
const contact={id:'10001',email:'member@example.com',membershipStatus:'Active',paymentStatus:'Completed',membershipDate:'2026-01-19',membershipExpiry:'2027-01-19'};
function fixture(){const tables={icsh_forms:[formRow('tickets',structuredClone(event)),formRow('participation',defaultFestivalConfig())],icsh_submissions:[],icsh_audit_events:[],icsh_event_discounts:[],icsh_event_discount_redemptions:[]};let writes=0;
 const db={from(table){let rows=structuredClone(tables[table]||[]);const q={select(){return q;},maybeSingle(){return Promise.resolve({data:rows[0]??null,error:null});},in(k,v){rows=rows.filter(r=>v.includes(r[k]));return q;},eq(k,v){rows=rows.filter(r=>r[k]===v);return q;},order(){return q;},limit(n){rows=rows.slice(0,n);return q;},range(a,b){return Promise.resolve({data:rows.slice(a,b+1),count:rows.length,error:null});},insert(row){tables[table].push(row);return Promise.resolve({data:null,error:null});},then(a,b){return Promise.resolve({data:rows,error:null}).then(a,b);}};return q;},async rpc(name,args){if(name==='icsh_discount_release_stale')return{data:0,error:null};assert.equal(name,'icsh_event_write');writes++;for(const c of args.p_changes){const t=c.table==='forms'?'icsh_forms':'icsh_submissions',i=tables[t].findIndex(r=>r.id===c.data.id);if(i<0)tables[t].push(c.data);else tables[t][i]=c.data;}return{data:true,error:null};}};return{db,tables,get writes(){return writes;}};}
async function call(f,path,body,lookupMembership=async()=>({records:[contact],hasMore:false}),admin=false){const req={url:'https://icsh.test/api/event-forms/'+path,query:{path},method:'POST',headers:{origin:'https://icsh.test','content-type':'application/json','x-csrf-token':'csrf','x-registration-token':'a'.repeat(64)},body};let status=200,raw;await requestContext.run({db:f.db,path,body,method:'POST',url:new URL(req.url),req,secret:'fixture-secret',lookupMembership,session:{admin,csrf:'csrf',issuedAt:Date.now()-3000,save:async()=>{}}},()=>handler(req,{get statusCode(){return status;},set statusCode(v){status=v;},setHeader(){},end(v){raw=v;}}));return{status,body:JSON.parse(raw)};}
const query=()=>({eventId:event.id,email:'member@example.com',quantity:2,continueAsNonMember:false});
const booking=q=>({eventId:event.id,idempotencyKey:randomUUID(),firstName:'Fictional',lastName:'Booker',email:'member@example.com',mobile:'07700900123',quantity:2,attendees:[{firstName:'Fictional',lastName:'Booker'},{firstName:'Test',lastName:'Guest'}],dietaryRequirements:'Vegetarian',additionalNotes:'Test',terms:true,continueAsNonMember:false,website:'',expectedQuote:{configurationVersion:q.configurationVersion,unitAmount:q.unitAmount,total:q.total}});
const freeze=t=>t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-22T12:00:00Z')});
test('public quote is minimal; final registration checks Bigin again and saves authoritative group pricing',async t=>{freeze(t);const f=fixture();let reads=0;const read=async()=>{reads++;return{records:[contact],hasMore:false};};const q=await call(f,'booking/quote',query(),read);assert.equal(q.status,200);assert.equal(q.body.quote.total,3000);assert.doesNotMatch(JSON.stringify(q.body),/10001|member@example|membershipExpiry|diagnostics/);const body=booking(q.body.quote),r=await call(f,'booking/registrations',body,read);assert.equal(r.status,201);assert.equal(r.body.registration.total,3000);assert.equal(reads,2);assert.equal(f.writes,1);const replay=await call(f,'booking/registrations',body,async()=>{throw Error('must not read on replay');});assert.equal(replay.status,200);assert.equal(replay.body.registration.id,r.body.registration.id);assert.equal(f.writes,1);});
test('email alone verifies membership and rates without making a bookable quote',async t=>{
 freeze(t);
 const f=fixture();
 const result=await call(f,'booking/quote',{...query(),quantity:0});
 assert.equal(result.status,200);
 assert.equal(result.body.quote.memberStatus,'active');
 assert.equal(result.body.quote.unitAmount,1500);
 assert.equal(result.body.quote.total,null);
 assert.equal(result.body.quote.canRegister,false);
 assert.equal(result.body.message,undefined);
 const attempt=await call(f,'booking/registrations',{...booking({configurationVersion:1,unitAmount:1500,total:0}),quantity:0,attendees:[]});
 assert.ok(attempt.status>=400);
 assert.equal(f.writes,0);
});
test('discount audiences include active free members and distinguish inactive members from non-members',async t=>{
 freeze(t);
 const f=fixture();
 f.tables.icsh_forms[0].configuration.membershipPricingRule='active';
 f.tables.icsh_event_discounts.push({
  id:randomUUID(),scope_kind:'tickets',scope_id:event.id,code:'MEMBERS',name:'Early Bird Discount',
  active:true,audience:'active',basis:'fixed',value:500,categories:'all',application:'per_booking',
  redemption_basis:'booking',maximum:10,per_customer_maximum:null,starts_at:null,expires_at:null,version:1
 });
 const read=async()=>({records:[{...contact,paymentStatus:'Not required'}],hasMore:false});
 const request={...query(),discountCode:'MEMBERS'};
 const active=await call(f,'booking/quote',request,read);
 assert.equal(active.body.quote.memberStatus,'active');
 assert.equal(active.body.quote.promotion.payablePence,2500);
 assert.equal(active.body.quote.promotion.membershipProof,undefined);
 f.tables.icsh_event_discounts[0].audience='inactive';
 const refused=await call(f,'booking/quote',request,read);
 assert.equal(refused.body.quote.total,3000);
 assert.equal(refused.body.quote.promotion,undefined);
 assert.match(refused.body.discountError,/inactive or expired/);
 const noRecord=await call(f,'booking/quote',request,async()=>({records:[],hasMore:false}));
 assert.equal(noRecord.body.quote.promotion,undefined);
 const expired=await call(f,'booking/quote',request,async()=>({records:[{...contact,membershipExpiry:'2026-10-21'}],hasMore:false}));
 assert.equal(expired.body.quote.promotion.payablePence,4500);
 const attempt=await call(f,'booking/registrations',{...booking(refused.body.quote),discountCode:'MEMBERS'},read);
 assert.equal(attempt.status,409);
 assert.equal(f.writes,0);
});
test('a membership expiring or a price changing after review needs a new confirmation',async t=>{freeze(t);for(const change of ['membership','price']){const f=fixture(),q=await call(f,'booking/quote',query());if(change==='price'){f.tables.icsh_forms[0].configuration.rates.member=2000;f.tables.icsh_forms[0].configuration.version=2;}const r=await call(f,'booking/registrations',booking(q.body.quote),async()=>({records:[{...contact,...(change==='membership'?{membershipStatus:'Inactive'}:{})}],hasMore:false}));assert.equal(r.status,409);assert.equal(r.body.quote.total,change==='membership'?5000:4000);assert.equal(f.writes,0);}});
test('provider failures require retry or explicit non-member pricing; fallback cannot claim a discount',async t=>{freeze(t);const f=fixture(),fail=async()=>{throw Error('secret-token');};const unverified=await call(f,'booking/quote',query(),fail);assert.equal(unverified.body.quote.canRegister,false);assert.doesNotMatch(JSON.stringify(unverified.body),/secret-token/);const fallback=await call(f,'booking/quote',{...query(),continueAsNonMember:true},fail);assert.equal(fallback.body.quote.total,5000);const body={...booking(fallback.body.quote),continueAsNonMember:true};const saved=await call(f,'booking/registrations',body,fail);assert.equal(saved.status,201);assert.equal(saved.body.registration.total,5000);});
test('duplicates log a private keyed issue and never expose Contact IDs to anonymous visitors',async t=>{freeze(t);const f=fixture(),read=async()=>({records:[contact,{...contact,id:'20002'}],hasMore:false});const r=await call(f,'booking/quote',query(),read);assert.equal(r.body.quote.memberStatus,'ambiguous');assert.equal(r.body.quote.unitAmount,null);assert.doesNotMatch(JSON.stringify(r.body),/10001|20002|member@example/);assert.equal(f.tables.icsh_audit_events[0].action,'event.membership.duplicate_email');assert.doesNotMatch(JSON.stringify(f.tables.icsh_audit_events),/member@example/);});
test('organiser-only diagnostic view returns raw membership evidence and applied rules, without credentials',async t=>{freeze(t);const f=fixture();const blocked=await call(f,'admin/booking-pricing',query());assert.equal(blocked.status,401);const allowed=await call(f,'admin/booking-pricing',query(),undefined,true);assert.equal(allowed.status,200);assert.equal(allowed.body.diagnostics.emailSearched,'member@example.com');assert.equal(allowed.body.diagnostics.records[0].contactId,'10001');assert.equal(allowed.body.diagnostics.records[0].membershipExpiry,'2027-01-19');assert.equal(allowed.body.diagnostics.finalEventPrice,1500);assert.doesNotMatch(JSON.stringify(allowed.body),/access_token|refresh_token|client_secret|fixture-secret/);});
test('prototype forms are shareable but excluded from real event announcements',()=>{const d=eventDirectory({events:[event],festivalConfig:null,stallForms:[]});assert.equal(d.events.length,0);});

test('ICSH10 uses Winter Lunch group rates and an exclusive 23:59 UK cutoff',async t=>{
 const cutoff='2026-12-08T23:59:00Z';
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-12-08T23:58:59.999Z')});
 const f=fixture();
 Object.assign(f.tables.icsh_forms[0].configuration,{
  title:'ICSH Winter Lunch 2026',slug:'icsh-winter-lunch-2026',prototype:false,
  startsAt:'2026-12-27T13:00:00Z',endsAt:'2026-12-27T16:00:00Z',membershipPricingRule:'active',
  rates:{member:1850,pensioner:1850,student:1850,nonmember:2050,child:925,childNonmember:1025}
 });
 f.tables.icsh_event_discounts.push({
  id:randomUUID(),scope_kind:'tickets',scope_id:event.id,code:'ICSH10',name:'Promotional Discount',
  active:true,audience:'active',basis:'percentage',value:10,categories:'all',application:'per_booking',
  redemption_basis:'booking',maximum:100,per_customer_maximum:null,starts_at:'2026-11-24T00:00:00Z',expires_at:cutoff,version:1
 });
 const q={...query(),childQuantity:1,discountCode:'icsh10'};
 const active=async()=>({records:[{...contact,paymentStatus:'Not required'}],hasMore:false});
 const quoted=await call(f,'booking/quote',q,active);
 assert.equal(quoted.body.quote.total,2775);
 const p=quoted.body.quote.promotion;
 assert.deepEqual([p.grossPence,p.discountPence,p.payablePence],[2775,278,2497]);

 const submission={...booking(quoted.body.quote),childQuantity:1,discountCode:'ICSH10'};
 Object.assign(submission.expectedQuote,{discountPence:p.discountPence,payablePence:p.payablePence});
 const saved=await call(f,'booking/registrations',submission,active);
 assert.equal(saved.status,201);
 const record=f.tables.icsh_submissions[0].answers.record;
 assert.deepEqual([record.total,...record.attendees.map(a=>a.unitAmount)],[2497,1850,925]);

 const {WebsiteStripeClient}=await import('../lib/payments/core.ts');
 const {paidTicketEmailContent}=await import('../lib/ticket-emails/core.ts');
 const {sendTransactionalContent}=await import('../lib/form-emails/core.ts');
 const config={key:'rk_test_fixture',account:'acct_fixture',mode:'test',origin:'https://website-fixture-icsh.vercel.app'};
 const source={kind:'event',id:record.id,mode:'test',amount:record.total,currency:'gbp',reference:record.reference,description:record.eventTitle,email:'audit-fixture@icsh.org.uk',capabilityHash:record.capabilityHash,eligible:true};
 const client=new WebsiteStripeClient(config,async(url,options)=>{
  if(url.endsWith('/account'))return Response.json({id:config.account,charges_enabled:true});
  assert.equal(options.body.get('line_items[0][price_data][unit_amount]'),'2497');
  return Response.json({id:'cs_test_winter_fixture',livemode:false,mode:'payment',currency:'gbp',amount_total:2497,client_reference_id:record.id,metadata:{purpose:'icsh_website_payment_v1',source_kind:'event',source_id:record.id,account_id:config.account}});
 });
 await client.create(source);
 const id=randomUUID();
 const content=paidTicketEmailContent({id,recipient:source.email,reference:record.reference,name:record.contact.name,title:record.eventTitle,venue:'Lahore, Eastcote',startsAt:record.eventStartsAt,endsAt:'2026-12-27T16:00:00Z',total:source.amount,discountPence:p.discountPence,discountCode:p.code,discountName:p.name,attendees:record.attendees});
 const inbox=[];
 const mail=await sendTransactionalContent(id,source.email,content,
  {ZOHO_TRANSACTIONAL_EMAIL_ENABLED:'true',ZOHO_TRANSACTIONAL_API_ORIGIN:'https://cpaas.zoho.eu',ZOHO_TRANSACTIONAL_SEND_KEY:'fake',ZOHO_TRANSACTIONAL_FROM:source.email},
  async(url,options)=>{inbox.push(JSON.parse(options.body));return Response.json({message:'OK',data:[{code:'EM_104'}],request_id:'winter-fixture'});});
 assert.equal(mail.status,'accepted');
 assert.equal(inbox[0].to[0].email_address.address,source.email);
 for(const expected of ['£27.75','-£2.78','Total paid: £24.97'])assert.ok(inbox[0].textbody.includes(expected));

 for(const records of [[{...contact,membershipExpiry:'2026-12-07'}],[]]){
  const rejected=await call(f,'booking/quote',q,async()=>({records,hasMore:false}));
  assert.equal(rejected.body.quote.total,3075);
  assert.equal(rejected.body.quote.promotion,undefined);
  assert.match(rejected.body.discountError,/active ICSH members only/);
 }
 const invalid=await call(f,'booking/quote',{...q,discountCode:'WRONG'},active);
 assert.match(invalid.body.discountError,/Invalid discount/);
 t.mock.timers.setTime(Date.parse(cutoff));
 for(const offset of [0,1]){
  t.mock.timers.setTime(Date.parse(cutoff)+offset);
  const rejected=await call(f,'booking/quote',q,active);
  assert.match(rejected.body.discountError,/expired/);
  assert.equal(rejected.body.quote.total,2775);
  assert.equal(rejected.body.quote.promotion,undefined);
 }
 const expired=await call(f,'booking/registrations',{...submission,idempotencyKey:randomUUID()},active);
 assert.equal(expired.status,409);
 assert.match(expired.body.error,/expired/);
 assert.equal(expired.body.quote.total,2775);
 assert.equal(f.writes,1);
});
