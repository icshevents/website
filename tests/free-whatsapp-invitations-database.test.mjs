import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const runtime=process.env.ICSH_SQL_TEST_RUNTIME;
test('free invitation SQL checks saved Student eligibility and activation without a payment; claims stay private and permanent',{skip:!runtime},async()=>{
 const {PGlite}=await import(pathToFileURL(runtime).href),db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table public.icsh_membership_applications(id uuid primary key,answers jsonb,category text,fee_pence integer,currency text,mode text,test_data boolean,created_at timestamptz,deleted_at timestamptz,bigin_sync_status text,bigin_record_id text,payment_status text,last_error_code text);
 create table public.icsh_membership_payments(application_id uuid primary key,account_id text,mode text,status text,refunded_amount integer,amount integer,currency text,paid_at timestamptz,payment_intent_id text,charge_id text);
 create table public.icsh_membership_activations(application_id uuid primary key,account_id text,status text,activation_kind text,payment_intent_id text,paid_at timestamptz,contact_id text,start_date date,expiry_date date);
 create function public.icsh_membership_mobile_key(value text) returns text language sql immutable strict as $$select case when value like '07%' then '44'||substr(value,2) else regexp_replace(value,'[^0-9]','','g') end$$;
 grant select,update on public.icsh_membership_applications,public.icsh_membership_payments,public.icsh_membership_activations to service_role;`);
 await db.exec(await readFile(new URL('../database/whatsapp-invitations.sql',import.meta.url),'utf8'));
 // Use the actual retired-test-policy function deployed in production, not a fixture approximation.
 const retired=await readFile(new URL('../database/retire-membership-test-pricing.sql',import.meta.url),'utf8');
 const eligible=retired.match(/CREATE OR REPLACE FUNCTION public\.icsh_free_membership_eligible\(p_id uuid\)[\s\S]*?end \$function\$\s*;/);
 assert.ok(eligible);await db.exec(eligible[0]);
 await db.exec(`revoke execute on function public.icsh_free_membership_eligible(uuid) from public,anon,authenticated;grant execute on function public.icsh_free_membership_eligible(uuid) to service_role;`);
 await db.exec(await readFile(new URL('../database/free-whatsapp-invitations.sql',import.meta.url),'utf8'));
 const dates=(await db.query(`select (now() at time zone 'Europe/London')::date::text starts,((now() at time zone 'Europe/London')::date+interval '1 year')::date::text expires,to_char((now() at time zone 'Europe/London')::date-interval '20 years','DD/MM/YYYY') dob`)).rows[0];
 const cutoff='2000-01-01T00:00:00Z';
 async function fixture(){
 const id=randomUUID(),answers={kind:'new',firstName:'Free',lastName:'Student',dob:dates.dob,education:'yes',studentDeclaration:true,terms:true,accuracy:true,email:'fictional@example.invalid',mobile:'07700900993',whatsappInvitation:true,communicationsNotice:'2026-11-06-all-tiers-v2'};
 await db.query(`insert into public.icsh_membership_applications values($1,$2,'student',0,'GBP','live',false,now(),null,'synced','123','not_required',null)`,[id,answers]);
 await db.query(`insert into public.icsh_membership_activations values($1,'free','active','free',null,null,'123',$2,$3)`,[id,dates.starts,dates.expires]);
 return {id,token:randomUUID(),request:{applicationId:id,contactId:'123',recipient:'+447700900993',paymentIntentId:null,startDate:dates.starts,expiryDate:dates.expires,templateName:'icsh_free_member_group_invitation',category:'utility',sender:'+447700900992',accountId:'free'}};
 }
 const claim=async(f,from=cutoff)=>(await db.query(`select public.icsh_free_whatsapp_invitation_claim($1,$2,$3::jsonb,$4) value`,[f.id,f.token,JSON.stringify(f.request),from])).rows[0].value;
 const first=await fixture();assert.deepEqual(await claim(first),{token:first.token});assert.equal(await claim({...first,token:randomUUID()}),null);
 await db.query(`select public.icsh_whatsapp_invitation_finish($1,$2,'request_accepted')`,[first.id,first.token]);
 assert.equal(await claim({...first,token:randomUUID()}),null);
 assert.equal((await db.query(`select count(*)::int n from public.icsh_membership_payments`)).rows[0].n,0);
 const abandoned=await fixture();await claim(abandoned);await db.query(`update public.icsh_whatsapp_invitations set created_at=now()-interval '10 days' where application_id=$1`,[abandoned.id]);assert.equal(await claim({...abandoned,token:randomUUID()}),null);
 for(const sql of [
 `update public.icsh_membership_applications set answers=answers-'whatsappInvitation' where id=$1`,
 `update public.icsh_membership_applications set answers=answers||'{"communicationsNotice":"2026-11-06-membership-service-v1"}' where id=$1`,
 `update public.icsh_membership_applications set answers=answers||'{"studentDeclaration":false}' where id=$1`,
 `update public.icsh_membership_applications set answers=answers||'{"dob":"01/01/1990"}' where id=$1`,
 `update public.icsh_membership_applications set payment_status='awaiting_payment' where id=$1`,
 `update public.icsh_membership_applications set mode='test',test_data=true where id=$1`,
 `update public.icsh_membership_applications set category='standard',fee_pence=2000 where id=$1`,
 `update public.icsh_membership_applications set deleted_at=now() where id=$1`,
 `update public.icsh_membership_activations set status='review_required' where application_id=$1`,
 `update public.icsh_membership_activations set contact_id='456' where application_id=$1`,
 `update public.icsh_membership_activations set paid_at=now(),payment_intent_id='pi_fake' where application_id=$1`,
 `update public.icsh_membership_activations set expiry_date=(now() at time zone 'Europe/London')::date where application_id=$1`
 ]){const f=await fixture();await db.query(sql,[f.id]);assert.equal(await claim(f),null,sql);}
 const old=await fixture();assert.equal(await claim(old,'2999-01-01T00:00:00Z'),null);
 const paid=await fixture();await db.query(`insert into public.icsh_membership_payments(application_id,status) values($1,'pending')`,[paid.id]);assert.equal(await claim(paid),null);
 const mismatch=await fixture();assert.equal(await claim({...mismatch,request:{...mismatch.request,recipient:'+447700900994'}}),null);
 await assert.rejects(claim({...mismatch,request:{...mismatch.request,paymentIntentId:'pi_fake'}}),/Invalid invitation request/);
 await assert.rejects(claim({...mismatch,request:{...mismatch.request,extra:true}}),/Invalid invitation request/);
 const safe=await fixture();await db.exec('set role service_role');assert.deepEqual(await claim(safe),{token:safe.token});await db.exec('reset role');
 for(const role of ['anon','authenticated']){
 await db.exec('set role '+role);await assert.rejects(claim(safe),/permission denied/);
 await assert.rejects(db.query(`select * from public.icsh_free_whatsapp_invitation_candidates($1)`,[cutoff]),/permission denied/);
 await assert.rejects(db.query(`select * from public.icsh_whatsapp_invitations`),/permission denied/);await db.exec('reset role');
 }
 const newMember=await fixture();
 // Remove other eligible but deliberately unclaimed test fixtures, keeping claimed history intact.
 await db.query(`update public.icsh_membership_applications set deleted_at=now() where id<>$1 and id not in(select application_id from public.icsh_whatsapp_invitations)`,[newMember.id]);
 const candidates=(await db.query(`select * from public.icsh_free_whatsapp_invitation_candidates($1)`,[cutoff])).rows;
 assert.deepEqual(candidates,[{application_id:newMember.id}]);
 }finally{await db.close();}
});
