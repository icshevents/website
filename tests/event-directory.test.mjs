import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEventDirectory, getEventDirectory } from '../lib/event-directory.ts';
const fixture=()=>({mode:'live',events:[{id:'harrow',title:'Harrow Food Festival',startsAt:'2026-12-13T12:00:00Z',endsAt:'2026-12-13T17:00:00Z',venue:'Harrow Central Mosque',description:'Community fundraising.',forms:[{label:'Apply for a stall',url:'https://icsh.org.uk/stall-hire/harrow-food-festival-2026-stall-hire',kind:'stall',feeFromPence:6500}],internal:'PRIVATE'}]});
test('public event parser keeps safe fields and rejects invalid origins, prices and timelines',()=>{const data=fixture();const parsed=parseEventDirectory(data);assert.equal(parsed[0].forms[0].feeFromPence,6500);assert.ok(!JSON.stringify(parsed).includes('PRIVATE'));for(const url of ['javascript:alert(1)','https://attacker.example/form','https://icsh.org.uk/admin','https://icsh.org.uk/stall-hire/example#secret']){const bad=fixture();bad.events[0].forms[0].url=url;assert.throws(()=>parseEventDirectory(bad));}const bad=fixture();bad.events[0].forms[0].feeFromPence=-1;assert.throws(()=>parseEventDirectory(bad));const times=fixture();times.events[0].endsAt='2020-01-01T00:00:00Z';assert.throws(()=>parseEventDirectory(times));});
test('directory reads the server database and fails closed if the connection is unavailable',async()=>{
 const original=globalThis.fetch,previousURL=process.env.NEXT_PUBLIC_SUPABASE_URL,previousKey=process.env.SUPABASE_SECRET_KEY;
 try{
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://xxtsbuvwvrvtvmdxwcpx.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_synthetic_test_only';
  let called;
  globalThis.fetch=async(url,options)=>{called={url:String(url),options};return new Response(JSON.stringify([{kind:'stall',configuration:{eventName:'Harrow Food Festival',startsAt:'2026-12-13T12:00:00Z',endsAt:'2026-12-13T17:00:00Z',venue:'Harrow Central Mosque',status:'published',slug:'harrow-food-festival-2026-stall-hire',packages:[{fee:6500}]}}]),{status:200,headers:{'content-type':'application/json'}});};
  assert.equal((await getEventDirectory()).events.length,1);assert.equal(called.options.cache,'no-store');assert.match(called.url,/rest\/v1\/icsh_forms/);
  delete process.env.SUPABASE_SECRET_KEY;
  assert.deepEqual(await getEventDirectory(),{available:false,mode:'live',events:[]});
 }finally{globalThis.fetch=original;for(const [name,value] of [['NEXT_PUBLIC_SUPABASE_URL',previousURL],['SUPABASE_SECRET_KEY',previousKey]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
});
