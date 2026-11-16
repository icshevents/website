import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {emptyContent,eventContentSchema} from '../lib/events-hub/core.ts';
const engine=process.env.ICSH_TEST_PGLITE_MODULE;
test('Events Hub isolated PostgreSQL migration and permission regression', {skip:!engine},async t=>{
 const {PGlite}=await import(engine);const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('test.jwt',true),''),'{}')::jsonb$$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table public.icsh_organisers(user_id uuid primary key references auth.users(id));alter table public.icsh_organisers enable row level security;grant select on public.icsh_organisers to authenticated;create policy organiser_self_read on public.icsh_organisers for select to authenticated using(user_id=(select auth.uid()));
 create table public.icsh_forms(id uuid primary key default gen_random_uuid(),slug text unique,title text,status text,kind text,configuration jsonb,mode text,created_at timestamptz default now());
 create table public.icsh_submissions(id uuid primary key default gen_random_uuid(),form_id uuid references public.icsh_forms(id),submitted_at timestamptz default now(),status text default 'new',answers jsonb,mode text,request_key text);
 alter table public.icsh_forms enable row level security;alter table public.icsh_submissions enable row level security;
 grant select,insert,update on public.icsh_forms,public.icsh_submissions to authenticated;
 create policy organisers_manage_forms on public.icsh_forms for all to authenticated using(true) with check(true);create policy organisers_manage_submissions on public.icsh_submissions for all to authenticated using(true) with check(true);
 create table public.icsh_audit_events(id uuid primary key default gen_random_uuid(),action text,record_id text,occurred_at timestamptz default now());
 create table public.icsh_iftari_settings(slug text primary key,configuration jsonb,updated_at timestamptz);
 create table public.icsh_iftari_bookings(id uuid primary key default gen_random_uuid(),event_slug text,contact jsonb,quantities jsonb,quote jsonb,total integer,guests integer,status text,mode text,created_at timestamptz default now(),needs_review boolean default false);
 grant usage on schema public,auth,storage to service_role,anon,authenticated;grant all on all tables in schema public to service_role;`);
 const configure=fs.readFileSync(new URL('../database/iftari-bookings.sql',import.meta.url),'utf8').split('create function public.icsh_iftari_configure')[1].split('revoke execute')[0];await db.exec('create function public.icsh_iftari_configure'+configure);
 await db.exec(fs.readFileSync(new URL('../database/events-hub.sql',import.meta.url),'utf8'));
 await db.exec(fs.readFileSync(new URL('../database/events-hub-enforce-membership-sessions.sql',import.meta.url),'utf8'));
 const eventUser='00000000-0000-4000-8000-000000000001',memberUser='00000000-0000-4000-8000-000000000002';
 await db.query('insert into auth.users(id) values ($1),($2)',[eventUser,memberUser]);await db.query("insert into public.icsh_portal_access values($1,'events'),($2,'membership')",[eventUser,memberUser]);
 const token='a'.repeat(64),membership='b'.repeat(64),hash=v=>createHash('sha256').update(v).digest('hex');
 const rpc=async(name,args=[])=>{const p=args.map((_,i)=>'$'+(i+1)).join(',');const r=await db.query(`select public.${name}(${p}) as result`,args);return r.rows[0].result;};
 await rpc('icsh_portal_start',[memberUser,'membership',hash(membership),'',null]);
 const credential=await rpc('icsh_admin_save_events_access',[membership,null,0,'Fictional organiser','scrypt-v1$'+'a'.repeat(64)+'$'+'b'.repeat(128),'a'.repeat(64),true]);
 await rpc('icsh_events_session_start',[credential.id,credential.version,hash(token)]);
 let event,other,entryId;
 const c={...emptyContent(),title:'Fictional lunch',description:'Public event description',venue:'Fictional hall',startsAt:'2035-06-01T12:00:00Z',endsAt:'2035-06-01T15:00:00Z',bookingType:'paid',bookingEnabled:true,capacity:10,prices:{member:1850,nonmember:2050,child:925,childNonmember:1025,under5:0},childTickets:true};
 await t.test('all migration statements compile; anonymous and authenticated identities cannot read Hub tables or call Hub RPCs',async()=>{
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from public.icsh_events'),/permission denied/);await assert.rejects(rpc('icsh_hub_dashboard',[token]),/permission denied/);await db.exec('reset role');}
 });
 await t.test('membership tokens, forged tokens, expired sessions and revoked sessions cannot open Events Hub',async()=>{
  for(const wrong of [membership,'f'.repeat(64)])await assert.rejects(rpc('icsh_hub_dashboard',[wrong]),/Sign in/);
  await db.query("update public.icsh_portal_sessions set expires_at=now()-interval '1 second' where token_hash=$1",[hash(token)]);await assert.rejects(rpc('icsh_hub_dashboard',[token]),/Sign in/);
  await db.query("update public.icsh_portal_sessions set expires_at=now()+interval '8 hours',revoked_at=now() where token_hash=$1",[hash(token)]);await assert.rejects(rpc('icsh_hub_dashboard',[token]),/Sign in/);
  await db.query('update public.icsh_portal_sessions set revoked_at=null where token_hash=$1',[hash(token)]);
 });
 await t.test('drafts, private planning, tasks and unsaved public content do not leak to the public projection',async()=>{
  event=await rpc('icsh_hub_save',[token,null,0,'fictional-lunch',c,'draft']);assert.equal(event.source_type,'tickets');
  assert.deepEqual(await rpc('icsh_events_public',[null]),[]);
  await rpc('icsh_hub_planning',[token,event.id,0,'PRIVATE NOTES','PRIVATE REQUIREMENTS']);await rpc('icsh_hub_task',[token,event.id,null,0,'PRIVATE TASK',[credential.id],'2035-05-01','not_started','Detailed private instructions','Initial task note']);
  event=await rpc('icsh_hub_publish',[token,event.id,event.version,'publish']);assert.equal((await rpc('icsh_events_public',[null]))[0].content.title,c.title);assert.doesNotMatch(JSON.stringify(await rpc('icsh_events_public',[null])),/PRIVATE/);
  event=await rpc('icsh_hub_save',[token,event.id,event.version,event.slug,{...c,title:'Edited privately'},'ready_for_review']);assert.equal((await rpc('icsh_events_public',[null]))[0].content.title,c.title);
 });
 await t.test('linked submissions include useful answers and exclude capabilities, Bigin IDs and membership proofs',async()=>{
  const r={reference:'EVT-FIXTURE',contact:{name:'Fictional booker',email:'fictional@example.invalid'},status:'confirmed_paid',attendees:[{name:'Fictional',ticket:'member',membership:{biginId:'SECRET BIGIN'},membershipId:'SECRET MEMBER',unitAmount:1850}],answers:{dietary:'Vegetarian'},capabilityHash:'SECRET CAPABILITY',idempotencyKey:'SECRET KEY',crm:{contactId:'SECRET CRM'},total:1850};
  const ins=await db.query("insert into public.icsh_submissions(form_id,answers,mode) values($1,$2,'live') returning id",[event.form_ids[0],{record:r}]);entryId=ins.rows[0].id;
  const entries=await rpc('icsh_hub_entries',[token,event.id,0,null]);assert.equal(entries.total,1);assert.equal(entries.entries[0].details.answers.dietary,'Vegetarian');assert.doesNotMatch(JSON.stringify(entries),/SECRET/);
  const overview=await rpc('icsh_hub_booking_overview',[token,event.id]);assert.equal(overview.sold,1);assert.equal(overview.remaining,9);
 });
 await t.test('unlinked form IDs and submission IDs cannot be used to read or edit another event',async()=>{
  other=await rpc('icsh_hub_save',[token,null,0,'another-event',{...c,title:'Other event'},'draft']);
  await assert.rejects(rpc('icsh_hub_entries',[token,event.id,0,other.form_ids[0]]),/access denied/);
  await assert.rejects(rpc('icsh_hub_entry_review',[token,other.id,entryId,0,'reviewed','Injected']),/unavailable/);
  await rpc('icsh_hub_entry_review',[token,event.id,entryId,0,'reviewed','Private follow-up']);
  const r=await db.query('select answers from public.icsh_submissions where id=$1',[entryId]);assert.equal(r.rows[0].answers.record.status,'confirmed_paid');assert.equal(r.rows[0].answers.hubNotes,'Private follow-up');
  await assert.rejects(rpc('icsh_hub_entry_review',[token,event.id,entryId,0,'archived','stale']),/changed/);
 });
 await t.test('publishing preserves booked prices and enforces occupied capacity and edit versions',async()=>{
  await assert.rejects(rpc('icsh_hub_save',[token,event.id,1,event.slug,c,'draft']),/changed elsewhere/);
  event=await rpc('icsh_hub_publish',[token,event.id,event.version,'publish']);
  event=await rpc('icsh_hub_save',[token,event.id,event.version,event.slug,{...c,prices:{...c.prices,member:2000}},'draft']);event=await rpc('icsh_hub_publish',[token,event.id,event.version,'publish']);
  const booked=await db.query('select answers from public.icsh_submissions where id=$1',[entryId]);assert.equal(booked.rows[0].answers.record.attendees[0].unitAmount,1850);
  await db.query("insert into public.icsh_submissions(form_id,answers,mode) values($1,$2,'live')",[event.form_ids[0],{record:{reference:'RESERVED',status:'pending',attendees:[{},{}]}}]);
  event=await rpc('icsh_hub_save',[token,event.id,event.version,event.slug,{...c,capacity:1},'draft']);await assert.rejects(rpc('icsh_hub_publish',[token,event.id,event.version,'publish']),/Capacity cannot/);
 });
 await t.test('booking windows reject direct database inserts, including bypassing the browser',async()=>{
  event=await rpc('icsh_hub_save',[token,event.id,event.version,event.slug,{...c,bookingOpens:'2035-05-01T00:00:00Z'},'draft']);event=await rpc('icsh_hub_publish',[token,event.id,event.version,'publish']);
  await assert.rejects(db.query("insert into public.icsh_submissions(form_id,answers,mode) values($1,'{}','live')",[event.form_ids[0]]),/Bookings are closed/);
  assert.equal((await rpc('icsh_events_booking_access',['tickets',event.slug])).canBook,false);
 });
 await t.test('cancelled status survives draft edits, unpublish hides all public content and archives retain entries',async()=>{
  event=await rpc('icsh_hub_publish',[token,event.id,event.version,'cancel']);event=await rpc('icsh_hub_save',[token,event.id,event.version,event.slug,c,'draft']);assert.equal((await rpc('icsh_events_public',[event.slug]))[0].status,'cancelled');
  event=await rpc('icsh_hub_publish',[token,event.id,event.version,'unpublish']);assert.deepEqual(await rpc('icsh_events_public',[event.slug]),[]);assert.equal((await rpc('icsh_events_booking_access',['tickets',event.slug])).visible,false);
  event=await rpc('icsh_hub_publish',[token,event.id,event.version,'archive']);assert.equal(event.archived,true);assert.equal((await rpc('icsh_hub_entries',[token,event.id,0,null])).total,2);
 });
 await t.test('image drafts are private until publication and public image disappears after unpublish',async()=>{
  const key=other.id+'/00000000-0000-4000-8000-000000000009.png';await rpc('icsh_hub_image',[token,other.id,other.version,key]);other=(await rpc('icsh_hub_event',[token,other.id])).event;assert.equal(await rpc('icsh_events_image',[other.id]),null);
  other=await rpc('icsh_hub_publish',[token,other.id,other.version,'publish']);assert.equal(await rpc('icsh_events_image',[other.id]),key);
  other=await rpc('icsh_hub_publish',[token,other.id,other.version,'unpublish']);assert.equal(await rpc('icsh_events_image',[other.id]),null);
 });
 await t.test('existing ticket and Iftari imports retain source IDs, public teaser status and run without duplicates',async()=>{
  await db.query("insert into public.icsh_iftari_settings(slug,configuration) values('ramadan-iftari-2027',$1)",[{version:1,title:'ICSH Iftari',venue:'Fictional venue',date:'2027-02-20',time:'16:45',status:'draft',prices:{member:2550,nonmember:2800,child:1300,under5:0},capacity:null,maxGuests:12,allowRepeatMemberDiscounts:false}]);
  const sql=fs.readFileSync(new URL('../database/events-hub-import.sql',import.meta.url),'utf8');await db.exec(sql);const before=(await db.query('select count(*)::int n from public.icsh_events')).rows[0].n;await db.exec(sql);assert.equal((await db.query('select count(*)::int n from public.icsh_events')).rows[0].n,before);
  const imported=(await rpc('icsh_events_public',['ramadan-iftari-2027']))[0];assert.equal(imported.content.bookingEnabled,false);assert.equal(imported.content.startsAt,'2027-02-20T16:45:00Z');assert.equal(eventContentSchema.safeParse(imported.content).success,true);
 });
 await t.test('Iftari publishing reuses the existing configure function and retains booking snapshots',async()=>{
  let e=(await db.query("select * from public.icsh_events where source_type='iftari'")).rows[0];const c={...e.draft,startsAt:'2035-02-20T16:45:00Z',endsAt:'2035-02-20T20:00:00Z',capacity:20,bookingEnabled:true};
  e=await rpc('icsh_hub_save',[token,e.id,e.version,e.slug,c,'draft']);e=await rpc('icsh_hub_publish',[token,e.id,e.version,'publish']);
  let config=(await db.query("select configuration from public.icsh_iftari_settings where slug=$1",[e.source_key])).rows[0].configuration;assert.equal(config.status,'published');assert.equal(config.capacity,20);assert.equal(config.date,'2035-02-20');assert.equal(config.time,'16:45');assert.equal(config.prices.member,2550);assert.equal(config.prices.childNonmember,undefined);
  await db.query("insert into public.icsh_iftari_bookings(event_slug,contact,quantities,quote,total,guests,status,mode) values($1,$2,$3,$4,2550,1,'paid','live')",[e.source_key,{firstName:'Fictional',email:'fictional@example.invalid'},{member:1},{originalTotal:2550}]);
  const overview=await rpc('icsh_hub_booking_overview',[token,e.id]);assert.equal(overview.sold,1);assert.equal(overview.remaining,19);
  e=await rpc('icsh_hub_save',[token,e.id,e.version,e.slug,{...c,prices:{...c.prices,member:2600}},'draft']);e=await rpc('icsh_hub_publish',[token,e.id,e.version,'publish']);
  assert.equal((await db.query('select quote from public.icsh_iftari_bookings')).rows[0].quote.originalTotal,2550);
  e=await rpc('icsh_hub_publish',[token,e.id,e.version,'cancel']);await assert.rejects(db.query("insert into public.icsh_iftari_bookings(event_slug,guests,status,mode) values($1,1,'pending','live')",[e.source_key]),/Bookings are closed/);
 });
 await t.test('membership database policies require a matching live portal session and auth session ID',async()=>{
  const sid='00000000-0000-4000-8000-000000000055',mToken='c'.repeat(64);
  await db.query('insert into public.icsh_organisers values($1)',[memberUser]);await rpc('icsh_portal_start',[memberUser,'membership',hash(mToken),'',sid]);
  await db.query("select set_config('test.uid',$1,false),set_config('test.jwt',$2,false)",[memberUser,JSON.stringify({session_id:sid})]);await db.exec('set role authenticated');
  assert.ok((await db.query('select id from public.icsh_forms')).rows.length>0);await db.exec('reset role');
  await rpc('icsh_portal_end',[mToken,'membership']);await db.exec('set role authenticated');assert.equal((await db.query('select id from public.icsh_forms')).rows.length,0);await db.exec('reset role');
 });
 await t.test('Admin-only named password management, safe team listing and assigned tasks',async()=>{
  await assert.rejects(rpc('icsh_admin_events_access',[token]),/Admin Hub/);
  await assert.rejects(rpc('icsh_admin_save_events_access',[token,null,0,'Intruder','scrypt-v1$'+'1'.repeat(64)+'$'+'2'.repeat(128),'b'.repeat(64),true]),/Admin Hub/);
  const second=await rpc('icsh_admin_save_events_access',[membership,null,0,'Second','scrypt-v1$'+'1'.repeat(64)+'$'+'2'.repeat(128),'b'.repeat(64),true]);
  const secondToken='d'.repeat(64);await rpc('icsh_events_session_start',[second.id,second.version,hash(secondToken)]);
  assert.equal((await rpc('icsh_portal_check',[secondToken,'events'])).display_name,'Second');
  const task=await rpc('icsh_hub_task',[token,event.id,null,0,'Confirm venue',[second.id],'2035-05-01','not_started','Confirm the room and capacity','Contacted the venue']);assert.equal(task.assignee,'Second');assert.equal(task.assignee_ids[0],second.id);
  await assert.rejects(rpc('icsh_hub_task',[token,event.id,null,0,'Bad assignment',['00000000-0000-4000-8000-000000000099'],null,'not_started','','']),/active team/);
  const team=(await rpc('icsh_hub_dashboard',[token])).team;assert.equal(team.length,2);assert.doesNotMatch(JSON.stringify(team),/password_hash|lookup_key|scrypt/);
  await rpc('icsh_admin_save_events_access',[membership,second.id,second.version,'Second',null,null,false]);assert.equal(await rpc('icsh_portal_check',[secondToken,'events']),null);
 });
 await t.test('finished events disappear from public list and individual pages without deleting entries',async()=>{
  let e=await rpc('icsh_hub_save',[token,null,0,'finished-event',{...c,title:'Finished event'},'draft']);e=await rpc('icsh_hub_publish',[token,e.id,e.version,'publish']);
  assert.equal((await rpc('icsh_events_public',[e.slug])).length,1);e=await rpc('icsh_hub_publish',[token,e.id,e.version,'complete']);assert.equal(e.visible,false);assert.deepEqual(await rpc('icsh_events_public',[e.slug]),[]);assert.equal((await rpc('icsh_events_booking_access',['tickets',e.slug])).visible,false);assert.ok((await rpc('icsh_hub_dashboard',[token])).events.some(row=>row.id===e.id));
 });
 await t.test('custom forms reuse existing submissions, enforce event scope and preserve entries when finished',async()=>{
  let e=await rpc('icsh_hub_save',[token,null,0,'custom-form-event',{...c,title:'Custom form event',bookingType:'information',bookingEnabled:false},'draft']);e=await rpc('icsh_hub_publish',[token,e.id,e.version,'publish']);
  let f=await rpc('icsh_hub_form_save',[token,{id:null,eventId:e.id,version:0,title:'Volunteer form',description:'Fictional response test',slug:'fictional-volunteer',status:'draft',fields:[{id:'name',label:'Full name',type:'name',required:true,options:[]},{id:'email',label:'Email address',type:'email',required:true,options:[]},{id:'help',label:'How can you help?',type:'radio',required:true,options:['Setup','Cooking']},{id:'confirm',label:'Confirm details',type:'checkbox',required:true,options:[]}]}]);
  assert.equal(await rpc('icsh_custom_form_public',[f.slug]),null);f=await rpc('icsh_hub_form_save',[token,{...f,status:'published'}]);
  const pub=await rpc('icsh_custom_form_public',[f.slug]);assert.equal(pub.open,true);assert.equal(pub.fields.length,4);assert.equal((await rpc('icsh_events_public',[e.slug]))[0].forms[0].url,'/event-forms/'+f.slug);
  await assert.rejects(rpc('icsh_hub_form_save',[token,{...f,eventId:event.id}]),/changed elsewhere/);
  const id='00000000-0000-4000-8000-000000000088',answers={name:'Fictional volunteer',email:'fictional@example.invalid',help:'Setup',confirm:true};
  await assert.rejects(rpc('icsh_custom_form_submit',[f.slug,id,f.version,{...answers,confirm:false},'9'.repeat(64)]),/required/);
  await assert.rejects(rpc('icsh_custom_form_submit',[f.slug,id,f.version,{...answers,help:'Unlisted'},'9'.repeat(64)]),/listed/);
  const receipt=await rpc('icsh_custom_form_submit',[f.slug,id,f.version,answers,'9'.repeat(64)]);assert.match(receipt.reference,/^FORM-/);assert.deepEqual(await rpc('icsh_custom_form_submit',[f.slug,id,f.version,answers,'9'.repeat(64)]),receipt);
  const entries=await rpc('icsh_hub_entries',[token,e.id,0,null]);assert.equal(entries.total,1);assert.equal(entries.entries[0].details.answers['Full name'],'Fictional volunteer');
  e=(await rpc('icsh_hub_event',[token,e.id])).event;e=await rpc('icsh_hub_publish',[token,e.id,e.version,'complete']);assert.equal(await rpc('icsh_custom_form_public',[f.slug]),null);assert.equal((await rpc('icsh_hub_entries',[token,e.id,0,null])).total,1);
 });
 await t.test('multiple assigned accounts and their update authors remain distinct even with identical first names',async()=>{
  const a=await rpc('icsh_admin_save_events_access',[membership,null,0,'Alex','scrypt-v1$'+'3'.repeat(64)+'$'+'4'.repeat(128),'3'.repeat(64),true]);
  const b=await rpc('icsh_admin_save_events_access',[membership,null,0,'Alex','scrypt-v1$'+'5'.repeat(64)+'$'+'6'.repeat(128),'5'.repeat(64),true]);
  const task=await rpc('icsh_hub_task',[token,event.id,null,0,'Joint task',[a.id,b.id],null,'in_progress','Detailed arrangements','Initial update']);assert.equal(task.assignee_ids.length,2);assert.notEqual(task.assignee_ids[0],task.assignee_ids[1]);assert.equal(task.description,'Detailed arrangements');assert.equal(task.updates[0].name,'Fictional organiser');assert.ok(task.updates[0].at);
 });
 await t.test('audits include timestamp and password-assigned actor; logout revokes Events access without revoking membership',async()=>{
  const history=(await rpc('icsh_hub_event',[token,event.id])).history;assert.ok(history.length>0);assert.equal(history[0].actor,'Fictional organiser');assert.ok(history[0].occurred_at);
  await rpc('icsh_portal_end',[token,'events']);await assert.rejects(rpc('icsh_hub_dashboard',[token]),/Sign in/);assert.ok(await rpc('icsh_portal_check',[membership,'membership']));
 });
 await db.close();
});
