import test from 'node:test';
import assert from 'node:assert/strict';
import {entryPages,entryValues} from '../lib/organiser-entries.ts';
test('entry lists continue past the first database page and fail closed on a later error',async()=>{
 const calls=[];const rows=await entryPages(async(from,to)=>{calls.push([from,to]);return {data:Array.from({length:from===0?500:1},(_,i)=>({id:from+i})),error:null};});
 assert.equal(rows.length,501);assert.equal(rows[500].id,500);assert.deepEqual(calls,[[0,499],[500,999]]);
 await assert.rejects(entryPages(async from=>from?{data:null,error:{message:'unavailable'}}:{data:Array(500).fill({id:1}),error:null}),/temporarily unavailable/);
});
test('search and spreadsheet values preserve nested answers, zero and false',()=>{
 assert.deepEqual(entryValues({contact:{email:'test@example.invalid'},answers:{Diet:['Vegetarian','Nut allergy'],Consent:false,Tickets:0,Note:'Line one\nLine two'},unused:null}),{'contact · email':'test@example.invalid','answers · Diet':'Vegetarian | Nut allergy','answers · Consent':'No','answers · Tickets':0,'answers · Note':'Line one\nLine two'});
});
