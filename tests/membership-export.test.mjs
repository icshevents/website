import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMembershipExport,membershipExportRow} from '../lib/membership-applications/export.ts';
import {membershipExportPage} from '../lib/membership-applications/store.ts';
const now=()=>new Date('2026-11-09T12:00:00Z');
const request=(headers={},method='GET')=>new Request('https://icsh.org.uk/admin/memberships/export',{method,headers});
function entry(i=0,overrides={}){return {application:{id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,reference:`MEM-${i}`,createdAt:'2026-11-09T08:00:00Z',answers:{kind:'new',firstName:'Alex',lastName:'Example',email:'example@example.com',mobile:'+447700900000',dob:'01/01/1990',education:'no',studentDeclaration:false,terms:true,accuracy:true},category:'standard',feePence:2000,paymentStatus:'awaiting_payment',biginSyncStatus:'synced',biginRecordId:'839981000000000001',mode:'live',requestHash:'private-request-hash',capabilityHash:'private-capability-hash',...overrides}};}
test('signed-out, unapproved and cross-site requests cannot read any membership entries',async()=>{
 let reads=0;
 for(const [status,code] of [['signed-out',401],['forbidden',403],['configuration',403]]){
  const r=await handleMembershipExport(request(),{session:async()=>({status}),load:async()=>{reads++;return[];},now});assert.equal(r.status,code);assert.match(r.headers.get('cache-control'),/no-store/);
 }
 for(const headers of [{'sec-fetch-site':'cross-site'},{origin:'https://example.com'}]){
  const r=await handleMembershipExport(request(headers),{session:async()=>({status:'organiser'}),load:async()=>{reads++;return[];},now});assert.equal(r.status,403);
 }
 assert.equal(reads,0);
});
test('export continues past 100 rows with a fixed cutoff and same-timestamp cursor',async()=>{
 const entries=Array.from({length:205},(_,i)=>entry(i)),calls=[];
 const r=await handleMembershipExport(request(),{session:async()=>({status:'organiser'}),now,load:async(cutoff,cursor)=>{calls.push({cutoff,cursor});const start=cursor?Number(cursor.id.slice(-12))+1:0;return entries.slice(start,start+100);}});
 assert.equal(r.status,200);const csv=await r.text();assert.equal(csv.split('\r\n').length,207);assert.match(csv,/"MEM-204"/);assert.equal(calls.length,3);assert.equal(calls[1].cursor.id,entries[99].application.id);assert.equal(calls[2].cursor.id,entries[199].application.id);assert.ok(calls.every(c=>c.cutoff===now().toISOString()));
 assert.match(r.headers.get('content-disposition'),/icsh-membership-applications-2026-11-09.csv/);assert.match(r.headers.get('cache-control'),/no-store/);assert.doesNotMatch(csv,/private-request-hash|private-capability-hash|requestHash|capabilityHash/);
});
test('empty export has headers, and a later read failure never returns a partial CSV',async()=>{
 const empty=await handleMembershipExport(request(),{session:async()=>({status:'organiser'}),load:async()=>[],now});assert.equal(empty.status,200);assert.match(await empty.text(),/Application reference/);
 let calls=0;const failed=await handleMembershipExport(request(),{session:async()=>({status:'organiser'}),now,load:async()=>{if(calls++)throw Error('secret database credentials');return Array.from({length:100},(_,i)=>entry(i));}});
 assert.equal(failed.status,503);assert.match(failed.headers.get('content-type'),/application\/json/);assert.doesNotMatch(await failed.text(),/MEM-0|secret database credentials/);
});
test('CSV preserves quotes, commas, newlines and protects spreadsheet formulas, phones and long IDs',()=>{
 const row=entry();row.application.answers.firstName='=HYPERLINK("https://example.com")';row.application.answers.lastName='Example, "Family"\nMember';
 const csv=membershipExportRow(row);assert.ok(csv.includes('"\'=HYPERLINK(""https://example.com"")"'));assert.ok(csv.includes('"Example, ""Family""\nMember"'));assert.ok(csv.includes('"\'+447700900000"'));assert.ok(csv.includes('"\'839981000000000001"'));
});
test('free activation, renewal and refunded payments remain distinct in the exported report',()=>{
 const free=entry(1,{category:'student',feePence:0,paymentStatus:'not_required'});free.activation={status:'active',start_date:'2026-11-09',expiry_date:'2027-11-09'};free.memberId='ICSH-1001';
 assert.match(membershipExportRow(free),/"Student","0.00","No payment required"/);assert.match(membershipExportRow(free),/"active","2026-11-09","2027-11-09","ICSH-1001"/);
 const renewal=entry(2);renewal.application.answers.kind='renewal';renewal.payment={status:'refunded',paid_at:'2026-11-09T08:05:00Z'};assert.match(membershipExportRow(renewal),/"Renewal"/);assert.match(membershipExportRow(renewal),/Refunded - review required/);
});
test('storage export excludes removed records, uses stable paging and rejects unsafe cursor input before a query',async()=>{
 const calls=[];const query={select(){return this;},is(...a){calls.push(['is',...a]);return this;},lte(...a){calls.push(['lte',...a]);return this;},order(...a){calls.push(['order',...a]);return this;},or(...a){calls.push(['or',...a]);return this;},limit(...a){calls.push(['limit',...a]);return Promise.resolve({data:[],error:null});}};const db={from(){calls.push(['from']);return query;}};
 await membershipExportPage(now().toISOString(),{createdAt:'2026-11-09T08:00:00Z',id:entry().application.id},db);
 assert.ok(calls.some(c=>c[0]==='is'&&c[1]==='deleted_at'&&c[2]===null));assert.ok(calls.some(c=>c[0]==='lte'&&c[2]===now().toISOString()));assert.ok(calls.some(c=>c[0]==='or'&&c[1].includes('and(created_at.eq.')));
 calls.length=0;await assert.rejects(()=>membershipExportPage('bad',null,db));await assert.rejects(()=>membershipExportPage(now().toISOString(),{createdAt:'2026-11-09T08:00:00Z',id:'bad,id.gt.x'},db));assert.equal(calls.length,0);
});
