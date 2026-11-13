import 'server-only';
import {randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {createEventService} from '../event-forms/service.js';
import {membershipActivationClient as client} from '../zoho/server';
import {emailConfiguration,sendTransactionalContent} from '../form-emails/core';
import {londonDate} from '../membership';
import {processRenewalNotice,renewalContent,renewalStage,stageDays,type NoticeOutcome,type RenewalStage} from './core';
import type {BiginContact} from '../zoho/client';

function store(){
 const db=createEventService();
 return{
  db,
  state:async(c:BiginContact)=>{const r=await db.rpc('icsh_renewal_notice_state',{p_contact:c.id,p_email:c.email,p_expiry:c.membershipExpiry});if(r.error||!r.data)throw new Error('RENEWAL_STATE_UNAVAILABLE');return{permission:r.data.enabled===true&&(r.data.service_permission===true||c.emailOptOut===false),held:r.data.held!==false};},
  claim:async(c:BiginContact,s:RenewalStage,test=false)=>{const r=await db.rpc('icsh_renewal_notice_claim',{p_contact:c.id,p_expiry:c.membershipExpiry,p_stage:s,p_email:c.email,p_claim:randomUUID(),p_test:test});if(r.error)throw new Error('RENEWAL_CLAIM_UNAVAILABLE');return r.data as {id:string;token:string}|null;},
  finish:async(id:string,token:string,o:NoticeOutcome)=>{const r=await db.rpc('icsh_renewal_notice_finish',{p_id:id,p_claim:token,p_status:o.status,p_provider:o.providerId||null,p_error:o.code||null});if(r.error||r.data!==true)throw new Error('RENEWAL_SAVE_UNAVAILABLE');},
 };
}
export async function runRenewalReminders(dryRun=false){
 if(!emailConfiguration(process.env))return{enabled:false,scanned:0,due:0};
 const s=store(),settings=await s.db.from('icsh_renewal_notice_settings').select('enabled,enabled_from').eq('id',true).single();
 if(settings.error)throw new Error('RENEWAL_SETTINGS_UNAVAILABLE');
 if(!dryRun&&(!settings.data.enabled||Date.now()<Date.parse(settings.data.enabled_from)))return{enabled:false,scanned:0,due:0};
 const started=Date.now();
 const records:BiginContact[]=[],seen=new Set<string>();let complete=false;
 for(let page=1;page<=50;page++){
  const r=await client.listBiginRenewalContacts(page);
  for(const c of r.records){if(seen.has(c.id))throw new Error('RENEWAL_SCAN_CHANGED');seen.add(c.id);records.push(c);}
  if(!r.hasMore){complete=true;break;}
 }
 if(!complete)throw new Error('RENEWAL_SCAN_INCOMPLETE');
 const counts=new Map<string,number>();for(const c of records)counts.set(c.email,(counts.get(c.email)||0)+1);
 const on=londonDate(),due=records.filter(c=>renewalStage(c,on)&&counts.get(c.email)===1);
 const result={enabled:true,scanned:records.length,due:due.length,accepted:0,skipped:0,review:0,retry:0,deferred:0,dryRun};
 if(dryRun)return result;
 // Skip terminal send records before repeating CRM calls during the afternoon catch-up.
 const terminal=new Set<string>();
 for(let offset=0;offset<50000;offset+=1000){
  const r=await s.db.from('icsh_renewal_notices').select('contact_id,expiry_date,stage,status').eq('is_test',false).gte('expiry_date',new Date(Date.parse(on+'T12:00:00Z')-7*86400000).toISOString().slice(0,10)).lte('expiry_date',new Date(Date.parse(on+'T12:00:00Z')+30*86400000).toISOString().slice(0,10)).order('id').range(offset,offset+999);
  if(r.error)throw new Error('NOTICE_HISTORY_UNAVAILABLE');
  for(const x of r.data)if(x.status!=='retry'&&x.status!=='sending')terminal.add(x.contact_id+'|'+x.expiry_date+'|'+x.stage);
  if(r.data.length<1000)break;if(offset===49000)throw new Error('NOTICE_HISTORY_INCOMPLETE');
 }
 const pending=due.filter(c=>!terminal.has(c.id+'|'+c.membershipExpiry+'|'+renewalStage(c,on)));
 let cursor=0,halt=false;
 const worker=async()=>{while(cursor<pending.length&&!halt){
  if(londonDate()!==on||Date.now()-started>230000)break;
  const c=pending[cursor++];
  try{
   const status=await processRenewalNotice(c,renewalStage(c,on)!,{...s,read:client.getBiginContact,unique:async(email,id)=>{const r=await client.searchBiginContactsByEmail(email);return!r.hasMore&&r.matches.length===1&&r.matches[0].id===id;},send:async(id,current,stage)=>sendTransactionalContent(id,current.email,renewalContent(current,stage),process.env)},on);
   if(status==='accepted')result.accepted++;else if(status==='review_required')result.review++;else if(status==='retry')result.retry++;else result.skipped++;
   if(status==='retry')halt=true;
  }catch{result.review++;}
 }};
 // Two bounded workers keep large shared expiry dates within the existing function limit.
 await Promise.all([worker(),worker()]);result.deferred=pending.length-cursor;
 return result;
}
export async function sendRenewalTest(stage:RenewalStage){
 const s=store(),now=new Date(),on=londonDate(now);const expiry=new Date(on+'T12:00:00Z');expiry.setUTCDate(expiry.getUTCDate()+stageDays[stage]);
 const c:BiginContact={id:'test-admin',email:'admin@icsh.org.uk',firstName:'Example',lastName:'Member',mobile:null,membershipStatus:'Active',membershipType:'Standard',paymentStatus:'Completed',emailOptOut:false,membershipDate:'2025-12-01',membershipExpiry:expiry.toISOString().slice(0,10),memberId:'DEMO0001'};
 const claim=await s.claim(c,stage,true);if(!claim)return{status:'not_sent',code:'TEST_DISABLED_OR_ALREADY_ATTEMPTED'};
 let outcome:NoticeOutcome;
 try{outcome=await sendTransactionalContent(claim.id,c.email,renewalContent(c,stage,true),process.env);}catch{outcome={status:'failed',code:'TEST_CONFIGURATION_INVALID'};}
 await s.finish(claim.id,claim.token,outcome);return outcome;
}

/** Short-lived, one-purpose test authorisation. Never a general mail relay. */
export async function authorisedRenewalTest(request:Request){
 const token=request.headers.get('authorization')||'';
 if(!/^Bearer [a-f0-9]{64}$/.test(token))return false;
 const r=await createEventService().from('icsh_renewal_notice_settings').select('test_enabled,test_until,test_token_hash').eq('id',true).single();
 if(r.error||!r.data.test_enabled||!r.data.test_until||Date.parse(r.data.test_until)<=Date.now()||!r.data.test_token_hash)return false;
 const actual=Buffer.from(createHash('sha256').update(token.slice(7)).digest('hex')),expected=Buffer.from(r.data.test_token_hash);
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
