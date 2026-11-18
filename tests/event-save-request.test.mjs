import test from 'node:test';
import assert from 'node:assert/strict';
import {readEventSaveRequest,posterLimit} from '../lib/events-hub/event-save-request.ts';
import {emptyContent} from '../lib/events-hub/core.ts';
const input=()=>({id:null,version:0,slug:'test-direct-save',visibility:'published',content:{...emptyContent(),title:'Example event',venue:'Example hall',description:'Example description'}});
const request=(data)=>new Request('https://example.test/api/events-hub/save-live',{method:'POST',body:data});
test('one save accepts validated event details and a poster together, including the first event save',async()=>{
 const form=new FormData();form.set('payload',JSON.stringify(input()));form.set('poster',new File([new Uint8Array([137,80,78,71,13,10,26,10])],'poster.png',{type:'image/png'}));
 const result=await readEventSaveRequest(request(form));assert.equal(result.input.slug,'test-direct-save');assert.equal(result.poster.ext,'png');assert.equal(result.poster.mime,'image/png');
 const noImage=new FormData();noImage.set('payload',JSON.stringify(input()));assert.equal((await readEventSaveRequest(request(noImage))).poster,null);
 const removed=input();removed.content.image='';const r=await readEventSaveRequest(new Request('https://example.test/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(removed)}));assert.equal(r.input.content.image,'');
});
test('editing a menu keeps the existing website poster without uploading it again',async()=>{
 const body=input();
 body.id='00000000-0000-4000-8000-000000000031';
 body.version=1;
 body.content.image='/event-posters/icsh-winter-lunch-2026.webp';
 body.content.menu={enabled:true,title:'Winter Lunch menu',courses:[{title:'Main',items:['Vegetarian meal']}]};
 const form=new FormData();form.set('payload',JSON.stringify(body));
 const result=await readEventSaveRequest(request(form));
 assert.equal(result.input.content.image,body.content.image);
 assert.deepEqual(result.input.content.menu,body.content.menu);
 assert.equal(result.poster,null);
});
test('poster save rejects approval fields, invalid images, duplicate files and oversized requests',async()=>{
 for(const body of [{...input(),status:'draft'}, {...input(),content:{...input().content,externalUrl:'javascript:bad'}}])await assert.rejects(readEventSaveRequest(new Request('https://example.test/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})));
 for(const data of ['<svg onload="bad()"/>',new Uint8Array(posterLimit+1)]){const form=new FormData();form.set('payload',JSON.stringify(input()));form.set('poster',new File([data],'fake.png',{type:'image/png'}));await assert.rejects(readEventSaveRequest(request(form)));}
 const form=new FormData();form.set('payload',JSON.stringify(input()));form.append('poster',new File(['bad'],'one.png'));form.append('poster',new File(['bad'],'two.png'));await assert.rejects(readEventSaveRequest(request(form)));
});
