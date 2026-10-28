import test from 'node:test';
import assert from 'node:assert/strict';
import {activeParticipationEvents} from '../lib/participation-links.ts';
const now=Date.parse('2026-10-23T12:00:00Z');
const base={eventName:'Community festival',startsAt:'2026-12-13T12:00:00Z',endsAt:'2026-12-13T17:00:00Z',venue:'Harrow',status:'published'};
const festival=changes=>({kind:'participation',configuration:{...base,...changes}});
const stall=changes=>({kind:'stall',configuration:{...base,slug:'community-festival-stalls',deadline:'2026-12-01T17:00:00Z',packages:[{fee:6500}],...changes}});
const ticket=changes=>({kind:'event',configuration:{...base,id:'event-1',title:'Community event',description:'A community gathering.',slug:'community-event',rates:{standard:2000},...changes}});
test('Published future festival and stall forms appear as public form links',()=>{
 const events=activeParticipationEvents([festival(),stall()],now);
 assert.equal(events.length,1);assert.equal(events[0].forms.length,2);
 assert.deepEqual(events[0].forms.map(f=>f.kind),['participation','stall']);
});
test('An earlier stall deadline removes its form without hiding the festival',()=>{
 const events=activeParticipationEvents([festival(),stall({deadline:'2026-10-22T12:00:00Z'})],now);
 assert.equal(events.length,1);assert.equal(events[0].forms.length,1);assert.equal(events[0].forms[0].kind,'participation');
});
test('Registration is excluded at the exact cutoff',()=>{
 assert.equal(activeParticipationEvents([stall({deadline:'2026-10-23T12:00:00Z'})],now).length,0);
 assert.equal(activeParticipationEvents([festival({startsAt:'2026-10-23T12:00:00Z'})],now).length,0);
});
test('Closed, draft and already-started forms are absent',()=>{
 assert.equal(activeParticipationEvents([festival({status:'closed'}),stall({status:'draft'}),ticket({startsAt:'2026-10-22T12:00:00Z'})],now).length,0);
});
test('Unlisted prototype ticket forms are never exposed',()=>{
 const events=activeParticipationEvents([ticket({prototype:true}),ticket({id:'public-event',slug:'public-event'})],now);
 assert.equal(events.length,1);assert.equal(events[0].id,'ticket-public-event');
});
test('A stall without a separate deadline uses the event start time',()=>{
 assert.equal(activeParticipationEvents([stall({deadline:''})],now).length,1);
 assert.equal(activeParticipationEvents([stall({deadline:'',startsAt:'2026-10-22T12:00:00Z'})],now).length,0);
});
test('Invalid or missing signup cutoff values do not produce active links',()=>{
 assert.equal(activeParticipationEvents([festival({startsAt:'invalid'}),stall({deadline:'invalid'}),{kind:'event',configuration:null}],now).length,0);
});
test('Unsafe form destinations fail closed',()=>{
 assert.throws(()=>activeParticipationEvents([ticket({slug:'../../admin'})],now));
});
