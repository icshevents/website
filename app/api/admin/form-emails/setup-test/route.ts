import {randomUUID} from 'node:crypto';
import {createEventService} from '@/lib/event-forms/service';
import {sendConfirmation,type EmailKind} from '@/lib/form-emails/core';
import {authorisedSetupTest,setupConfirmation,setupKinds} from '@/lib/form-emails/setup-test';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex'};
export async function POST(request:Request){
  if(!authorisedSetupTest(request,process.env))return Response.json({error:'Not found'},{status:404,headers});
  let body;
  try{body=await request.json();}catch{return Response.json({error:'Invalid test'},{status:400,headers});}
  if(!body||Object.keys(body).length!==1||!setupKinds.includes(body.kind))return Response.json({error:'Invalid test'},{status:400,headers});
  const value=setupConfirmation(body.kind as EmailKind,process.env.FORM_EMAIL_SETUP_TEST_SECRET!);
  const db=createEventService(),claim=randomUUID();
  // A saved claim prevents a repeated request from sending the same test twice.
  const inserted=await db.from('icsh_form_emails').insert({id:value.id,source_table:'internal_setup_test',source_id:value.id,kind:value.kind,recipient:value.recipient,reference:value.reference,event_title:value.event_title,status:'sending',claim_id:claim,claimed_at:new Date().toISOString(),attempts:1});
  if(inserted.error)return Response.json({error:inserted.error.code==='23505'?'Test already attempted':'Test unavailable'},{status:inserted.error.code==='23505'?409:503,headers});
  let outcome;
  try{outcome=await sendConfirmation(value,{...process.env,ZOHO_TRANSACTIONAL_EMAIL_ENABLED:'true'});}catch(error){
    const safeCodes=['EMAIL_KEY_MISSING','EMAIL_KEY_FORMAT_INVALID','EMAIL_ORIGIN_INVALID','EMAIL_SENDER_INVALID','EMAIL_INPUT_INVALID','MEMBERSHIP_DETAILS_INVALID'];
    outcome={status:'failed' as const,code:error instanceof Error&&safeCodes.includes(error.message)?error.message:'EMAIL_TEST_CONFIGURATION_INVALID'};
  }
  const saved=await db.rpc('icsh_form_email_finish',{p_id:value.id,p_claim:claim,p_status:outcome.status,p_provider_id:outcome.providerId||null,p_error:outcome.code||null});
  if(saved.error||saved.data!==true)return Response.json({error:'Test outcome requires review'},{status:503,headers});
  return Response.json({status:outcome.status,code:outcome.code||null},{headers});
}
