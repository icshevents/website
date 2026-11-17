import test from 'node:test';
import assert from 'node:assert/strict';
import {iftariMenuSchema,defaultIftariMenu,resolveEventMenu,defaultEventMenu} from '../lib/events-hub/iftari-menu.ts';
import {eventContentSchema,emptyContent} from '../lib/events-hub/core.ts';
test('existing Iftari menu remains the fallback and edited dishes round-trip through event content',()=>{
 assert.equal(defaultIftariMenu.courses.length,4);assert.equal(defaultIftariMenu.courses[0].items[0],'Peri peri tikka');
 const content={...emptyContent(),title:'Fictional Iftari',description:'Test',venue:'Fictional venue',startsAt:'2035-02-01T17:00:00Z',endsAt:'2035-02-01T20:00:00Z'};
 assert.equal(eventContentSchema.safeParse(content).success,true);
 const menu={...defaultIftariMenu,title:'Updated menu',courses:[{title:'Main courses',items:['New vegetarian dish']}]};assert.deepEqual(eventContentSchema.parse({...content,menu}).menu,menu);
 assert.equal(eventContentSchema.parse({...content,menu:{...menu,enabled:false}}).menu.enabled,false);
});
test('menu edits are bounded, reject unknown properties and cannot contain blank dishes',()=>{
 for(const menu of [{...defaultIftariMenu,title:''},{...defaultIftariMenu,courses:[]},{...defaultIftariMenu,courses:Array(9).fill(defaultIftariMenu.courses[0])},{...defaultIftariMenu,courses:[{title:'Main',items:['']}]},{...defaultIftariMenu,courses:[{title:'Main',items:['x'.repeat(81)]}]},{...defaultIftariMenu,html:'<script>'}])assert.equal(iftariMenuSchema.safeParse(menu).success,false);
});

test('blank lines between dishes and trailing newlines are ignored without discarding real dishes',()=>{
 const menu=iftariMenuSchema.parse({...defaultIftariMenu,courses:[{title:'Sides',items:['Jeera rice','  ','Raita / salad','','Mix breads','','TESTING','']}]});
 assert.deepEqual(menu.courses[0].items,['Jeera rice','Raita / salad','Mix breads','TESTING']);
 const empty=iftariMenuSchema.safeParse({...defaultIftariMenu,courses:[{title:'Sides',items:['',' ']}]});assert.equal(empty.success,false);assert.match(empty.error.issues[0].message,/Add at least one dish to Sides/);
});
test('every event supports a separate optional menu without inheriting another event’s dishes',()=>{
 assert.equal(resolveEventMenu(undefined,'tickets').enabled,false);assert.deepEqual(resolveEventMenu(undefined,'none'),defaultEventMenu);assert.deepEqual(resolveEventMenu(undefined,'iftari'),defaultIftariMenu);
 const custom={enabled:true,title:'Winter lunch menu',courses:[{title:'Lunch',items:['Vegetarian meal']}]};assert.deepEqual(resolveEventMenu(custom,'tickets'),custom);assert.equal(iftariMenuSchema.safeParse(defaultEventMenu).success,true);
 assert.equal(resolveEventMenu({...custom,enabled:false},'iftari').enabled,false);
});
