import test from 'node:test';
import assert from 'node:assert/strict';
import {selectHomeEventForms} from '../lib/home-event-forms.ts';
const now=Date.parse('2026-10-26T00:00:00Z');
const base={status:'published',startsAt:'2026-12-13T12:00:00Z',endsAt:'2026-12-13T17:00:00Z',venue:'Harrow',eventName:'Community festival'};
const ticket=(id,created_at,changes={})=>({kind:'event',created_at,configuration:{...base,id,title:`Event ${id}`,slug:`event-${id}`,description:'A community gathering.',rates:{standard:2000},...changes}});
const stall=(changes={})=>({kind:'stall',created_at:'2026-10-25T00:00:00Z',configuration:{...base,slug:'festival-stalls',packages:[{fee:6500}],...changes}});
test('newest added forms come first even if their event date is earlier',()=>{
 const forms=selectHomeEventForms([ticket('old','2026-10-01T00:00:00Z'),ticket('new','2026-10-25T00:00:00Z',{startsAt:'2026-11-01T12:00:00Z',endsAt:'2026-11-01T17:00:00Z'})],now);
 assert.deepEqual(forms.map(f=>f.href),['/event-tickets/event-new','/event-tickets/event-old']);
});
test('only open public forms survive deadlines, status and prototype rules',()=>{
 const records=[ticket('public','2026-10-25T00:00:00Z'),ticket('draft','2026-10-25T00:00:00Z',{status:'draft'}),ticket('private','2026-10-25T00:00:00Z',{prototype:true}),ticket('past','2026-10-25T00:00:00Z',{startsAt:'2026-10-25T12:00:00Z'}),stall({deadline:'2026-10-26T00:00:00Z'})];
 assert.equal(selectHomeEventForms(records,now).length,1);
});
test('festival and stall cards remain distinct and contain only safe public details',()=>{
 const records=[stall(),{kind:'participation',created_at:'2026-10-24T00:00:00Z',configuration:{...base,privateNotes:'PRIVATE_SENTINEL'}}];
 const forms=selectHomeEventForms(records,now);
 assert.deepEqual(forms.map(f=>f.kind),['stall','participation']);
 assert.equal(forms[1].href,'/harrow-food-festival-2026/get-involved');
 assert.equal(forms[0].dateLabel,'13 December 2026');
 assert.doesNotMatch(JSON.stringify(forms),/PRIVATE_SENTINEL|privateNotes|configuration|created_at/);
});
test('bad configurations and unsafe URLs cannot hide valid forms or escape the public route list',()=>{
 const forms=selectHomeEventForms([ticket('unsafe','2026-10-25T00:00:00Z',{slug:'../../admin'}),ticket('good','2026-10-24T00:00:00Z'),{kind:'stall',configuration:null}, {kind:'private',configuration:base}],now);
 assert.deepEqual(forms.map(f=>f.href),['/event-tickets/event-good']);
});
test('all open forms remain available for navigation beyond the first four',()=>{
 const forms=selectHomeEventForms(Array.from({length:7},(_,i)=>ticket(String(i),`2026-10-${String(10+i).padStart(2,'0')}T00:00:00Z`)),now);
 assert.equal(forms.length,7);assert.equal(forms[0].title,'Event 6');assert.equal(forms[6].title,'Event 0');
});
test('duplicates collapse to a single destination and missing creation dates sort last',()=>{
 const forms=selectHomeEventForms([ticket('same','2026-10-01T00:00:00Z'),ticket('same','2026-10-25T00:00:00Z',{title:'Newest version'}),ticket('undated',undefined)],now);
 assert.equal(forms.length,2);assert.equal(forms[0].title,'Newest version');assert.equal(forms[1].title,'Event undated');
});
