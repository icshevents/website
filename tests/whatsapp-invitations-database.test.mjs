import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

// Optional local Postgres-compatible runtime; never connects to a hosted database.
const runtime=process.env.ICSH_SQL_TEST_RUNTIME;
test('invitation SQL: durable claims, eligibility, terminal states and browser-role denial', {skip:!runtime},async()=>{
 const {PGlite}=await import(pathToFileURL(runtime).href);
 const db=new PGlite();
 try{
  await db.exec(`
   create role anon;create role authenticated;create role service_role bypassrls;
   create table public.icsh_membership_applications(id uuid primary key,answers jsonb,category text,fee_pence integer,currency text,mode text,test_data boolean,created_at timestamptz,deleted_at timestamptz,bigin_sync_status text,bigin_record_id text);
   create table public.icsh_membership_payments(application_id uuid primary key,account_id text,mode text,status text,refunded_amount integer,amount integer,currency text,paid_at timestamptz,payment_intent_id text,charge_id text);
   create table public.icsh_membership_activations(application_id uuid primary key,account_id text,status text,activation_kind text,payment_intent_id text,paid_at timestamptz,contact_id text,start_date date,expiry_date date);
   create function public.icsh_membership_mobile_key(value text) returns text language sql immutable strict as $$select case when value like '07%' then '44'||substr(value,2) else regexp_replace(value,'[^0-9]','','g') end$$;
   grant select,update on public.icsh_membership_applications,public.icsh_membership_payments,public.icsh_membership_activations to service_role;
   grant execute on function public.icsh_membership_mobile_key(text) to service_role;
  `);
  await db.exec(await readFile(new URL('../database/whatsapp-invitations.sql',import.meta.url),'utf8'));
  const dates=(await db.query(`select (now() at time zone 'Europe/London')::date::text starts,((now() at time zone 'Europe/London')::date+interval '1 year')::date::text expires`)).rows[0];
  async function fixture(){
   const id=randomUUID();
   await db.query(`insert into public.icsh_membership_applications values($1,'{"kind":"new","mobile":"07700900993","whatsappInvitation":true}', 'standard',2000,'GBP','live',false,now(),null,'synced','123')`,[id]);
   await db.query(`insert into public.icsh_membership_payments values($1,'acct_fixture','live','paid',0,2000,'gbp',now(),'pi_fixture','ch_fixture')`,[id]);
   await db.query(`insert into public.icsh_membership_activations values($1,'acct_fixture','active','paid','pi_fixture',now(),'123',$2,$3)`,[id,dates.starts,dates.expires]);
   // Match the exact payment timestamp rather than relying on two now() calls.
   await db.query(`update public.icsh_membership_activations x set paid_at=p.paid_at from public.icsh_membership_payments p where x.application_id=p.application_id and x.application_id=$1`,[id]);
   return {id,token:randomUUID(),request:{applicationId:id,contactId:'123',recipient:'+447700900993',paymentIntentId:'pi_fixture',startDate:dates.starts,expiryDate:dates.expires,templateName:'icsh_paid_member_group_invitation',category:'utility',sender:'+447700900992',accountId:'acct_fixture'}};
  }
  const claim=async f=>(await db.query(`select public.icsh_whatsapp_invitation_claim($1,$2,$3::jsonb,now()-interval '1 day') value`,[f.id,f.token,JSON.stringify(f.request)])).rows[0].value;
  const finish=async(f,status)=>(await db.query(`select public.icsh_whatsapp_invitation_finish($1,$2,$3) value`,[f.id,f.token,status])).rows[0].value;
  const first=await fixture();
  assert.deepEqual(await claim(first),{token:first.token});
  assert.equal(await claim({...first,token:randomUUID()}),null);
  assert.equal(await finish(first,'request_accepted'),true);
  assert.equal(await finish(first,'request_accepted'),true);
  await assert.rejects(finish(first,'cancelled'),/already finished/);
  assert.equal(await claim({...first,token:randomUUID()}),null);
  for(const outcome of ['review_required','rejected','cancelled']){
   const f=await fixture();assert.deepEqual(await claim(f),{token:f.token});assert.equal(await finish(f,outcome),true);assert.equal(await claim({...f,token:randomUUID()}),null);
  }
  const abandoned=await fixture();await claim(abandoned);
  await db.query(`update public.icsh_whatsapp_invitations set created_at=now()-interval '10 days' where application_id=$1`,[abandoned.id]);
  assert.equal(await claim({...abandoned,token:randomUUID()}),null);
  const changes=[
   `update public.icsh_membership_applications set answers=answers-'whatsappInvitation' where id=$1`,
   `update public.icsh_membership_applications set answers=jsonb_set(answers,'{whatsappInvitation}','false') where id=$1`,
   `update public.icsh_membership_applications set answers=jsonb_set(answers,'{whatsappInvitation}','"true"') where id=$1`,
   `update public.icsh_membership_applications set created_at=now()-interval '2 days' where id=$1`,
   `update public.icsh_membership_applications set deleted_at=now() where id=$1`,
   `update public.icsh_membership_applications set mode='test',test_data=true where id=$1`,
   `update public.icsh_membership_applications set fee_pence=0,category='student' where id=$1`,
   `update public.icsh_membership_payments set status='refunded',refunded_amount=2000 where application_id=$1`,
   `update public.icsh_membership_payments set status='disputed' where application_id=$1`,
   `update public.icsh_membership_payments set refunded_amount=1 where application_id=$1`,
   `update public.icsh_membership_payments set account_id='acct_other' where application_id=$1`,
   `update public.icsh_membership_activations set status='pending' where application_id=$1`,
   `update public.icsh_membership_activations set activation_kind='free' where application_id=$1`,
   `update public.icsh_membership_activations set contact_id='456' where application_id=$1`,
   `update public.icsh_membership_activations set expiry_date=(now() at time zone 'Europe/London')::date where application_id=$1`
  ];
  for(const sql of changes){const f=await fixture();await db.query(sql,[f.id]);assert.equal(await claim(f),null,sql);}
  const changed=await fixture();changed.request.recipient='+447700900994';assert.equal(await claim(changed),null);
  const tampered=await fixture();tampered.request.extra='injected';await assert.rejects(claim(tampered),/Invalid invitation request/);
  const safe=await fixture();
  await db.exec('set role service_role');assert.deepEqual(await claim(safe),{token:safe.token});await db.exec('reset role');
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(db.query('select * from public.icsh_whatsapp_invitations'),/permission denied/);
   await assert.rejects(claim(safe),/permission denied/);
   await assert.rejects(finish(safe,'request_accepted'),/permission denied/);
   await assert.rejects(db.query(`select * from public.icsh_whatsapp_invitation_candidates('acct_fixture',now()-interval '1 day')`),/permission denied/);
   await db.exec('reset role');
  }
  const unclaimed=await fixture();
  const candidates=(await db.query(`select * from public.icsh_whatsapp_invitation_candidates('acct_fixture',now()-interval '1 day')`)).rows.map(r=>r.application_id);
  assert.equal(candidates.includes(unclaimed.id),true);assert.equal(candidates.includes(abandoned.id),false);assert.equal(candidates.includes(first.id),false);
  // The £1 flow is limited to the exact owner profile and still requires payment/consent.
  for(const email of ['events.icsh@gmail.com',' EVENTS.ICSH@GMAIL.COM ','events.icsh+test@gmail.com','other@gmail.com',null]){
   const f=await fixture();
   await db.query(`update public.icsh_membership_applications set fee_pence=100,answers=answers||jsonb_build_object('email',$2::text) where id=$1`,[f.id,email]);
   await db.query(`update public.icsh_membership_payments set amount=100 where application_id=$1`,[f.id]);
   const allowed=email!==null&&email.trim().toLowerCase()==='events.icsh@gmail.com';
   assert.deepEqual(await claim(f),allowed?{token:f.token}:null);
  }
  // Apply the payment-prepare draft only in this isolated fixture database.
  await db.exec(`alter table public.icsh_membership_applications add column payment_status text default 'awaiting_payment'`);
  await db.exec(await readFile(new URL('../database/membership-owner-test-rate.sql',import.meta.url),'utf8'));
  for(const [email,fee,category,allowed] of [['events.icsh@gmail.com',100,'standard',true],['events.icsh@gmail.com',100,'pensioner',true],['other@gmail.com',100,'standard',false],['events.icsh+test@gmail.com',100,'standard',false],[null,100,'standard',false],['other@gmail.com',2000,'standard',true],['other@gmail.com',1500,'pensioner',true]]){
   // Reuse a nonclaimed record; payment rows are rebuilt without changing real data.
   const a=unclaimed.id;
   await db.query(`delete from public.icsh_membership_payments where application_id=$1`,[a]);
   await db.query(`update public.icsh_membership_applications set fee_pence=$2,category=$3,answers=answers||jsonb_build_object('email',$4::text) where id=$1`,[a,fee,category,email]);
   const prepare=()=>db.query(`select public.icsh_membership_payment_prepare($1,'acct_fixture','live') value`,[a]);
   if(allowed)assert.equal((await prepare()).rows[0].value.amount,fee);
   else await assert.rejects(prepare(),/Invalid payment application/);
  }
  assert.equal((await db.query(`select has_function_privilege('anon','public.icsh_membership_payment_prepare(uuid,text,text)','EXECUTE') allowed`)).rows[0].allowed,false);
 }finally{await db.close();}
});
