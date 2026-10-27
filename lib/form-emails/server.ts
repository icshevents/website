import 'server-only';
import {after} from 'next/server';
import {randomUUID} from 'node:crypto';
import {createEventService} from '../event-forms/service.js';
import {emailConfiguration,sendConfirmation,type Confirmation} from './core';

export async function processFormEmails(maximum=1) {
  if(!emailConfiguration(process.env))return {enabled:false,processed:0};
  const db=createEventService();let processed=0;
  for(let i=0;i<Math.min(10,maximum);i++){
    const claim=randomUUID();const result=await db.rpc('icsh_form_email_claim',{p_claim:claim});
    if(result.error)throw new Error('EMAIL_QUEUE_UNAVAILABLE');if(!result.data)break;
    const value=result.data as Confirmation;let outcome;
    try{
      if(value.kind==='membership_active'||value.kind==='membership_reminder'){
        const ready=await db.rpc('icsh_membership_email_eligible',{p_id:value.id});
        if(ready.error)throw new Error('EMAIL_STATE_UNAVAILABLE');
        if(ready.data!==true)outcome={status:'failed',code:'MEMBERSHIP_STATE_CHANGED'};
        else if(value.kind==='membership_active'){
          const details=await db.rpc('icsh_membership_email_details',{p_id:value.id,p_claim:claim});
          outcome=details.error||!details.data?{status:'review_required',code:'MEMBERSHIP_DETAILS_UNAVAILABLE'}:await sendConfirmation({...value,...details.data},process.env);
        }else outcome=await sendConfirmation(value,process.env);
      }else outcome=await sendConfirmation(value,process.env);
    }catch{outcome={status:'failed',code:'EMAIL_INPUT_OR_CONFIGURATION_INVALID'};}
    const saved=await db.rpc('icsh_form_email_finish',{p_id:value.id,p_claim:claim,p_status:outcome.status,p_provider_id:outcome.providerId||null,p_error:outcome.code||null});
    if(saved.error||saved.data!==true)throw new Error('EMAIL_RESULT_UNAVAILABLE');processed++;
  }
  return {enabled:true,processed};
}
export function scheduleFormEmails(request:Request,response:Response){
  if(request.method==='POST'&&response.ok&&process.env.ZOHO_TRANSACTIONAL_EMAIL_ENABLED==='true')after(async()=>{try{await processFormEmails();}catch{console.error('ICSH_FORM_EMAIL_PROCESSING_PENDING');}});
  return response;
}
