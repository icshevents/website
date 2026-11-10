import test from 'node:test';
import assert from 'node:assert/strict';
import {handleInvitationReadiness} from '../lib/whatsapp-invitations/readiness.ts';
const now=Date.parse('2026-11-06T00:00:00Z');
const env={ZOHO_BIGIN_WHATSAPP_RELEASE_MODE:'owner-test',ICSH_WHATSAPP_READINESS_TOKEN:'a'.repeat(64),ICSH_WHATSAPP_READINESS_UNTIL:'2026-11-07T00:00:00Z'};
const req=(authorization='Bearer '+'a'.repeat(64),method='POST')=>new Request('https://icsh.test/api/internal/whatsapp-readiness',{method,headers:{authorization}});
test('readiness check authenticates, expires, and stays unavailable outside the owner test before reading Bigin',async()=>{
 let calls=0;const inspect=async()=>{calls++;return {request:{length:255}};};
 for(const [request,settings,time] of [[req(''),env,now],[req('Bearer '+'b'.repeat(64)),env,now],[req(),{...env,ZOHO_BIGIN_WHATSAPP_RELEASE_MODE:'live'},now],[req(),{...env,ICSH_WHATSAPP_READINESS_TOKEN:''},now],[req(),{...env,ICSH_WHATSAPP_READINESS_UNTIL:''},now],[req(),env,Date.parse(env.ICSH_WHATSAPP_READINESS_UNTIL)]])assert.equal((await handleInvitationReadiness(request,settings,inspect,time)).status,404);
 assert.equal(calls,0);assert.equal((await handleInvitationReadiness(req(undefined,'GET'),env,inspect,now)).status,405);assert.equal(calls,0);
 const response=await handleInvitationReadiness(req(),env,inspect,now);assert.equal(response.status,200);assert.equal(calls,1);assert.equal(response.headers.get('Cache-Control'),'private, no-store, max-age=0');assert.deepEqual(await response.json(),{ok:true,fields:{request:{length:255}}});
});
test('readiness responses omit raw provider and credential errors',async()=>{
 for(const error of [new Error('secret provider body'),Object.assign(new Error('raw token'),{code:'ZOHO_PERMISSION_DENIED'}),{code:'https://private.example/token'}]){
  const response=await handleInvitationReadiness(req(),env,async()=>{throw error;},now);const body=await response.text();assert.equal(response.status,503);assert.doesNotMatch(body,/secret|raw token|https:/);
 }
});
