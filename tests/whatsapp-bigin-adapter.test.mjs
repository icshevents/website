import test from 'node:test';
import assert from 'node:assert/strict';
import {createZohoClient} from '../lib/zoho/client.ts';
import {invitationConfiguration} from '../lib/whatsapp-invitations/configuration.ts';
import {invitationStore} from '../lib/whatsapp-invitations/store.ts';

const request={applicationId:'09f1db18-6b76-48bb-94f0-29ad9403b0e0',contactId:'123',recipient:'+447700900993',paymentIntentId:'pi_fixture',startDate:'2026-11-05',expiryDate:'2027-11-05',templateName:'icsh_paid_member_group_invitation',category:'utility',sender:'+447700900992',accountId:'acct_fixture'};
const identity={firstName:'Alex',lastName:'Taylor',email:'alex@example.invalid',membershipType:'Standard'};
const env={ZOHO_BIGIN_WHATSAPP_RELEASE_MODE:'live',ZOHO_BIGIN_ACCOUNTS_URL:'https://accounts.zoho.eu',ZOHO_BIGIN_API_DOMAIN:'https://www.zohoapis.eu',ZOHO_BIGIN_CLIENT_ID:'fixture',ZOHO_BIGIN_CLIENT_SECRET:'fixture-secret',ZOHO_BIGIN_REFRESH_TOKEN:'fixture-refresh',ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED:'true',ZOHO_BIGIN_MEMBERSHIP_ACTIVATION_ENABLED:'true',ZOHO_BIGIN_WHATSAPP_INVITATIONS_ENABLED:'true',ZOHO_BIGIN_WHATSAPP_TEMPLATE_APPROVED:'true',ZOHO_BIGIN_WHATSAPP_WORKFLOW_VERIFIED:'true',ZOHO_BIGIN_WHATSAPP_TEMPLATE_NAME:request.templateName,ZOHO_BIGIN_WHATSAPP_TEMPLATE_CATEGORY:'utility',ZOHO_BIGIN_WHATSAPP_SENDER:request.sender,ZOHO_BIGIN_WHATSAPP_INVITATIONS_FROM:'2026-11-05T00:00:00Z',STRIPE_ACCOUNT_ID:'acct_fixture',VERCEL_ENV:'production'};
const fields=()=>[{api_name:'WhatsApp_Invitation_Consent',data_type:'boolean',read_only:false,field_read_only:false},{api_name:'WhatsApp_Invitation_Request',data_type:'text',length:255,read_only:false,field_read_only:false},{api_name:'Membership_Type',data_type:'picklist',read_only:false,field_read_only:false,pick_list_values:['Standard','Pensioner','Student'].map(actual_value=>({actual_value}))}];
const contact=()=>({id:'123',First_Name:'Alex',Last_Name:'Taylor',Email:identity.email,Mobile:request.recipient,Membership_Status:'Active',Membership_Type:'Standard',Payment_Status:'Completed',Membership_Date:request.startDate,Expiry_Date:request.expiryDate});
function fixture({metadata=fields(),member=contact(),marker=null,result='success'}={}){
 const calls=[];const fetch=async(url,init)=>{
  const u=new URL(url);calls.push({url:u.href,init});
  if(u.pathname==='/oauth/v2/token')return Response.json({access_token:'fixture-access',expires_in:3600});
  if(u.pathname==='/bigin/v2/settings/fields')return Response.json({fields:metadata});
  if(init.method==='GET'&&u.searchParams.get('fields')==='WhatsApp_Invitation_Consent,WhatsApp_Invitation_Request')return Response.json({data:[{id:'123',WhatsApp_Invitation_Consent:false,WhatsApp_Invitation_Request:marker}]});
  if(init.method==='GET')return Response.json({data:[member]});
  if(result==='timeout')throw new Error('timeout after provider acceptance');
  if(result==='wrong-id')return Response.json({data:[{code:'SUCCESS',status:'success',details:{id:'456'}}]});
  if(result==='rejected')return Response.json({code:'NO_PERMISSION'},403);
  return Response.json({data:[{code:'SUCCESS',status:'success',details:{id:'123'}}]});
 };
 return {calls,client:createZohoClient(env,fetch),fetch,puts:()=>calls.filter(c=>c.init.method==='PUT')};
}

test('release configuration requires independent approval/workflow switches and production',()=>{
 assert.ok(invitationConfiguration(env));assert.equal(invitationConfiguration({}),null);
 for(const key of ['ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED','ZOHO_BIGIN_MEMBERSHIP_ACTIVATION_ENABLED','ZOHO_BIGIN_WHATSAPP_INVITATIONS_ENABLED','ZOHO_BIGIN_WHATSAPP_TEMPLATE_APPROVED','ZOHO_BIGIN_WHATSAPP_WORKFLOW_VERIFIED','ZOHO_BIGIN_WHATSAPP_RELEASE_MODE','ZOHO_BIGIN_WHATSAPP_INVITATIONS_FROM','ZOHO_BIGIN_WHATSAPP_TEMPLATE_CATEGORY','STRIPE_ACCOUNT_ID'])assert.equal(invitationConfiguration({...env,[key]:undefined}),null,key);
 assert.equal(invitationConfiguration({...env,VERCEL_ENV:'preview'}),null);
 assert.equal(invitationConfiguration({...env,ZOHO_BIGIN_WHATSAPP_TEMPLATE_CATEGORY:'marketing'}).category,'marketing');
});

test('native invitation adapter verifies metadata and identity then changes only the invitation signal',async()=>{
 const f=fixture();assert.equal(await f.client.requestBiginInvitation(request,identity),'accepted');
 assert.equal(f.puts().length,1);const put=f.puts()[0];assert.equal(put.url,'https://www.zohoapis.eu/bigin/v2/Contacts/123');
 assert.deepEqual(JSON.parse(put.init.body),{data:[{WhatsApp_Invitation_Consent:true,WhatsApp_Invitation_Request:'ready:'+request.applicationId}],trigger:['workflow']});
 assert.equal(f.calls[1].url,'https://www.zohoapis.eu/bigin/v2/settings/fields?module=Contacts');
});

test('missing flags and mismatched template/sender never make a provider call',async()=>{
 for(const key of ['ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED','ZOHO_BIGIN_WHATSAPP_INVITATIONS_ENABLED','ZOHO_BIGIN_WHATSAPP_TEMPLATE_APPROVED','ZOHO_BIGIN_WHATSAPP_WORKFLOW_VERIFIED']){
  const client=createZohoClient({...env,[key]:'false'},()=>{throw new Error('unexpected network');});
  await assert.rejects(client.requestBiginInvitation(request,identity),e=>e.code==='ZOHO_MEMBERSHIP_WRITES_DISABLED');
 }
 for(const change of [{templateName:'icsh_wrong'},{category:'marketing'},{sender:'+447700900994'}]){
  const f=fixture();await assert.rejects(f.client.requestBiginInvitation({...request,...change},identity),e=>e.code==='ZOHO_REQUEST_NOT_ALLOWED');assert.equal(f.calls.length,0);
 }
});

test('metadata permissions, missing fields, wrong types and insufficient field length prevent writes',async()=>{
 for(const mutate of [f=>f.pop(),f=>f.push({...f[0]}),f=>f[0].data_type='text',f=>f[1].length=10,f=>delete f[1].length,f=>f[1].read_only=true,f=>f[2].data_type='text',f=>f[2].field_read_only=true,f=>f[2].pick_list_values.pop()]){
  const metadata=fields();mutate(metadata);const f=fixture({metadata});await assert.rejects(f.client.requestBiginInvitation(request,identity));assert.equal(f.puts().length,0);
 }
});

test('changed contact identity, phone, payment, type or membership term prevents a workflow request',async()=>{
 for(const change of [{Email:'other@example.invalid'},{First_Name:'Other'},{Mobile:'+447700900994'},{Payment_Status:'Awaiting payment'},{Membership_Status:'Inactive'},{Expiry_Date:'2028-11-05'},{Membership_Type:'Student'},{Membership_Type:null},{Membership_Type:'Pensioner'}]){
  const f=fixture({member:{...contact(),...change}});assert.equal(await f.client.requestBiginInvitation(request,identity),'rejected');assert.equal(f.puts().length,0);
 }
});

test('Pensioner uses the existing paid template while Student cannot enter that route',async()=>{
 const f=fixture({member:{...contact(),Membership_Type:'Pensioner'}});
 assert.equal(await f.client.requestBiginInvitation(request,{...identity,membershipType:'Pensioner'}),'accepted');
 assert.equal(f.puts().length,1);
 for(const membershipType of ['Student','minor',null,undefined]){
  const blocked=fixture();await assert.rejects(blocked.client.requestBiginInvitation(request,{...identity,membershipType}),e=>e.code==='ZOHO_REQUEST_NOT_ALLOWED');assert.equal(blocked.calls.length,0);
 }
});

test('an existing invitation marker is never written again; consumed signals permit the next distinct claim',async()=>{
 for(const marker of ['ready:'+request.applicationId,'ready:another-application','unexpected']){const f=fixture({marker});assert.equal(await f.client.requestBiginInvitation(request,identity),'unknown');assert.equal(f.puts().length,0);}
 const f=fixture({marker:'consumed'});assert.equal(await f.client.requestBiginInvitation(request,identity),'accepted');assert.equal(f.puts().length,1);
});

test('provider errors and uncertain acknowledgements stay unknown rather than claiming delivery',async()=>{
 for(const result of ['timeout','wrong-id','rejected']){const f=fixture({result});assert.equal(await f.client.requestBiginInvitation(request,identity),'unknown');assert.equal(f.puts().length,1);}
});

test('storage claim uses one generated token, exact request and the configured release boundary',async()=>{
 const calls=[];const config=invitationConfiguration(env);
 const db={rpc:async(name,args)=>{calls.push({name,args});return {data:name.endsWith('_claim')?{token:args.p_token}:true,error:null};}};
 const store=invitationStore(db,config,async()=>null);
 const claim=await store.claim(request);assert.match(claim.token,/^[a-f0-9-]{36}$/);
 assert.deepEqual(calls[0],{name:'icsh_whatsapp_invitation_claim',args:{p_id:request.applicationId,p_token:claim.token,p_request:request,p_applications_from:config.applicationsFrom}});
 await store.finish(request.applicationId,claim.token,'request_accepted');assert.equal(calls[1].name,'icsh_whatsapp_invitation_finish');
});

test('ambiguous storage acknowledgements and provider errors do not return a reusable claim',async()=>{
 const config=invitationConfiguration(env);
 for(const response of [{data:{token:'invalid'},error:null},{data:{token:'09f1db18-6b76-48bb-94f0-29ad9403b0e0'},error:null},{data:null,error:{code:'40001'}}]){
  const store=invitationStore({rpc:async()=>response},config,async()=>null);await assert.rejects(store.claim(request));
 }
 const store=invitationStore({rpc:async()=>({data:null,error:null})},config,async()=>null);assert.equal(await store.claim(request),null);await assert.rejects(store.finish(request.applicationId,request.applicationId,'cancelled'));
});

test('owner test uses the form mobile independently of the direct delivery-test recipient',async()=>{
 const restricted={...env,ZOHO_BIGIN_WHATSAPP_RELEASE_MODE:'owner-test',ZOHO_BIGIN_WHATSAPP_WORKFLOW_VERIFIED:'false',ZOHO_BIGIN_WHATSAPP_WORKFLOW_CONFIGURED:'true'};
 assert.equal(invitationConfiguration(restricted).ownerTestOnly,true);
 assert.equal(invitationConfiguration({...restricted,ZOHO_BIGIN_WHATSAPP_WORKFLOW_CONFIGURED:'false'}),null);
 assert.equal(invitationConfiguration({...restricted,ZOHO_BIGIN_WHATSAPP_RELEASE_MODE:'live'}),null);
 const rejected=fixture();const client=createZohoClient(restricted,rejected.fetch);
 await assert.rejects(client.requestBiginInvitation(request,identity),e=>e.code==='ZOHO_REQUEST_NOT_ALLOWED');assert.equal(rejected.calls.length,0);
 const email='events.icsh@gmail.com',mobile='+447700900994';
 const f=fixture({member:{...contact(),Email:email,Mobile:mobile}});
 assert.equal(await createZohoClient(restricted,f.fetch).requestBiginInvitation({...request,recipient:mobile},{...identity,email}),'accepted');assert.equal(f.puts().length,1);
});

test('read-only invitation field preflight validates metadata without writing a contact',async()=>{
 const f=fixture();assert.deepEqual(await f.client.inspectBiginInvitationFields(),{consent:{apiName:'WhatsApp_Invitation_Consent',type:'boolean'},request:{apiName:'WhatsApp_Invitation_Request',type:'text',length:255},membershipType:{apiName:'Membership_Type',type:'picklist',options:['Standard','Pensioner','Student']}});assert.equal(f.puts().length,0);assert.equal(f.calls.length,2);
});

test('a matched local UK mobile is formatted atomically with its first eligible invitation request',async()=>{
 for(const mobile of ['07700900993','07700 900993','7700900993','447700900993','0044 7700 900993']){
  const f=fixture({member:{...contact(),Mobile:mobile}});assert.equal(await f.client.requestBiginInvitation(request,identity),'accepted');
  assert.equal(f.puts().length,1);assert.deepEqual(JSON.parse(f.puts()[0].init.body),{data:[{Mobile:request.recipient,WhatsApp_Invitation_Consent:true,WhatsApp_Invitation_Request:'ready:'+request.applicationId}],trigger:['workflow']});
 }
 const existing=fixture({member:{...contact(),Mobile:'07700900993'},marker:'ready:'+request.applicationId});
 assert.equal(await existing.client.requestBiginInvitation(request,identity),'unknown');assert.equal(existing.puts().length,0);
});

test('read-only preflight distinguishes an empty Mobile uniqueness configuration from an enabled one',async()=>{
 for(const [unique,expected] of [[{},false],[{casesensitive:false},true],[null,false]]){
  const metadata=[...fields(),{api_name:'Mobile',data_type:'phone',read_only:false,field_read_only:false,unique}];
  const f=fixture({metadata});assert.deepEqual((await f.client.inspectBiginInvitationFields()).mobile,{type:'phone',readOnly:false,uniqueConfigured:expected});assert.equal(f.puts().length,0);
 }
});

test('free workflow has a separate marker/template and requires Not required rather than Completed',async()=>{
 const freeEnv={...env,ZOHO_BIGIN_WHATSAPP_FREE_INVITATIONS_ENABLED:'true',ZOHO_BIGIN_WHATSAPP_FREE_TEMPLATE_APPROVED:'true',ZOHO_BIGIN_WHATSAPP_FREE_WORKFLOW_VERIFIED:'true',ZOHO_BIGIN_WHATSAPP_FREE_RELEASE_MODE:'live',ZOHO_BIGIN_WHATSAPP_FREE_TEMPLATE_NAME:'icsh_free_member_group_invitation',ZOHO_BIGIN_WHATSAPP_FREE_TEMPLATE_CATEGORY:'utility'};
 const freeRequest={...request,accountId:'free',paymentIntentId:null,templateName:freeEnv.ZOHO_BIGIN_WHATSAPP_FREE_TEMPLATE_NAME};
 const f=fixture({member:{...contact(),Membership_Type:'Student',Payment_Status:'Not required'}});
 assert.equal(await createZohoClient(freeEnv,f.fetch).requestBiginInvitation(freeRequest,{...identity,membershipType:'Student'}),'accepted');
 assert.deepEqual(JSON.parse(f.puts()[0].init.body),{data:[{WhatsApp_Invitation_Consent:true,WhatsApp_Invitation_Request:'ready-free:'+request.applicationId}],trigger:['workflow']});
 for(const member of [contact(),{...contact(),Payment_Status:'Awaiting payment'}]){
 const f=fixture({member});assert.equal(await createZohoClient(freeEnv,f.fetch).requestBiginInvitation(freeRequest,{...identity,membershipType:'Student'}),'rejected');assert.equal(f.puts().length,0);
 }
 for(const change of [{templateName:request.templateName},{paymentIntentId:'pi_fixture'}]){
 const f=fixture();await assert.rejects(createZohoClient(freeEnv,f.fetch).requestBiginInvitation({...freeRequest,...change},{...identity,membershipType:'Student'}));assert.equal(f.calls.length,0);
 }
 const blocked=createZohoClient(env,()=>{throw Error('No provider call allowed');});
 await assert.rejects(blocked.requestBiginInvitation(freeRequest,{...identity,membershipType:'Student'}),e=>e.code==='ZOHO_MEMBERSHIP_WRITES_DISABLED');
});

import {createMembershipZohoClient} from '../lib/zoho/membership-client.ts';
test('production membership factory forwards both Student and paid settings using only the lookup grant',async()=>{
 const lookup={ZOHO_BIGIN_LOOKUP_ACCOUNTS_URL:'https://accounts.zoho.eu',ZOHO_BIGIN_LOOKUP_API_DOMAIN:'https://www.zohoapis.eu',ZOHO_BIGIN_LOOKUP_CLIENT_ID:'lookup-fixture',ZOHO_BIGIN_LOOKUP_CLIENT_SECRET:'lookup-secret',ZOHO_BIGIN_LOOKUP_REFRESH_TOKEN:'lookup-refresh'};
 const free={ZOHO_BIGIN_WHATSAPP_FREE_INVITATIONS_ENABLED:'true',ZOHO_BIGIN_WHATSAPP_FREE_TEMPLATE_APPROVED:'true',ZOHO_BIGIN_WHATSAPP_FREE_WORKFLOW_VERIFIED:'true',ZOHO_BIGIN_WHATSAPP_FREE_TEMPLATE_NAME:'icsh_free_member_group_invitation',ZOHO_BIGIN_WHATSAPP_FREE_TEMPLATE_CATEGORY:'utility',ZOHO_BIGIN_WHATSAPP_FREE_RELEASE_MODE:'live',ZOHO_BIGIN_WHATSAPP_FREE_WORKFLOW_CONFIGURED:'true'};
 for(const student of [true,false]){
  const f=fixture({member:{...contact(),Payment_Status:student?'Not required':'Completed',Membership_Type:student?'Student':'Standard'}});
  const client=createMembershipZohoClient({...env,...lookup,...free},f.fetch);
  const r=student?{...request,accountId:'free',paymentIntentId:null,templateName:free.ZOHO_BIGIN_WHATSAPP_FREE_TEMPLATE_NAME}:request;
  assert.equal(await client.requestBiginInvitation(r,{...identity,membershipType:r.accountId==='free'?'Student':'Standard'}),'accepted');assert.equal(f.puts().length,1);
  assert.equal(new URLSearchParams(f.calls[0].init.body).get('client_id'),'lookup-fixture');
  assert.equal(JSON.parse(f.puts()[0].init.body).data[0].WhatsApp_Invitation_Request,(student?'ready-free:':'ready:')+request.applicationId);
 }
 // This is the original failure: missing projected flags stop before ANY Bigin request.
 const f=fixture(),r={...request,accountId:'free',paymentIntentId:null,templateName:free.ZOHO_BIGIN_WHATSAPP_FREE_TEMPLATE_NAME};
 await assert.rejects(createMembershipZohoClient({...env,...lookup},f.fetch).requestBiginInvitation(r,{...identity,membershipType:r.accountId==='free'?'Student':'Standard'}),e=>e.code==='ZOHO_MEMBERSHIP_WRITES_DISABLED');assert.equal(f.calls.length,0);
 // An incomplete lookup grant must not fall back to registration credentials.
 const incomplete=fixture();await assert.rejects(createMembershipZohoClient({...env,...free},incomplete.fetch).requestBiginInvitation(r,{...identity,membershipType:r.accountId==='free'?'Student':'Standard'}),e=>e.code==='ZOHO_NOT_CONFIGURED');assert.equal(incomplete.calls.length,0);
});
