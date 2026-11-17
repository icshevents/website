import test from 'node:test';import assert from 'node:assert/strict';
import {requestContext} from '../lib/event-forms/context.js';import {readState,changedRows} from '../lib/event-forms/store.js';import {FESTIVAL_FORM_ID} from '../lib/event-forms/migration.js';
const copy='00000000-0000-4000-8000-000000000091';
test('annual participation config selection is deterministic and submission writes stay with the selected copy',async()=>{
 const original={eventName:'Original year',version:1},cloned={eventName:'New year',version:1};const rows=[{id:FESTIVAL_FORM_ID,kind:'participation',configuration:original},{id:copy,kind:'participation',configuration:cloned}];
 const db={from:()=>({select:async()=>({data:rows,error:null})})};
 const selected=await requestContext.run({db,path:'festival/config',body:{},festivalFormId:copy},()=>readState());assert.equal(selected.state.festivalConfig.eventName,'New year');
 const legacy=await requestContext.run({db,path:'festival/config',body:{}},()=>readState());assert.equal(legacy.state.festivalConfig.eventName,'Original year');
 const before=selected.state,after=structuredClone(before);after.festivalRegistrations.push({id:'00000000-0000-4000-8000-000000000092',createdAt:'2035-01-01T12:00:00Z',mode:'live',idempotencyKey:'test-request'});
 const changes=requestContext.run({festivalFormId:copy},()=>changedRows(before,after));assert.equal(changes.length,1);assert.equal(changes[0].data.form_id,copy);assert.equal(changes[0].form_version,1);
});
