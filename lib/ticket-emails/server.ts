import 'server-only';
import {after} from 'next/server';
import {randomUUID} from 'node:crypto';
import {createEventService} from '../event-forms/service.js';
import {emailConfiguration,sendTransactionalContent} from '../form-emails/core';
import {paidTicketEmailSchema,paidTicketEmailContent} from './core';
export async function processTicketEmails(maximum=1){
 if(!emailConfiguration(process.env))return {enabled:false,processed:0};
 const db=createEventService();let processed=0;
 for(let i=0;i<Math.min(5,maximum);i++){
  const claim=randomUUID(),item=await db.rpc('icsh_ticket_email_claim',{p_claim:claim});
  if(item.error)throw new Error('TICKET_EMAIL_QUEUE_UNAVAILABLE');if(!item.data)break;
  const id=item.data.id;let outcome;
  try{
   const ready=await db.rpc('icsh_ticket_email_ready',{p_id:id,p_claim:claim});
   if(ready.error)throw new Error('TICKET_EMAIL_STATE_UNAVAILABLE');
   if(!ready.data)outcome={status:'failed',code:'TICKET_PAYMENT_STATE_CHANGED'};
   else {const v=paidTicketEmailSchema.parse(ready.data);outcome=await sendTransactionalContent(v.id,v.recipient,paidTicketEmailContent(v),process.env);}
  }catch{outcome={status:'review_required',code:'TICKET_EMAIL_INPUT_OR_CONFIG'};}
  const result=await db.rpc('icsh_ticket_email_finish',{p_id:id,p_claim:claim,p_status:outcome.status,p_provider_id:outcome.providerId||null,p_error:outcome.code||null});
  if(result.error||result.data!==true)throw new Error('TICKET_EMAIL_RESULT_UNAVAILABLE');processed++;
 }
 return {enabled:true,processed};
}
export function scheduleTicketEmails(request:Request,response:Response){
 if(request.method==='POST'&&response.ok&&process.env.ZOHO_TRANSACTIONAL_EMAIL_ENABLED==='true')after(async()=>{try{await processTicketEmails();}catch{console.error('ICSH_TICKET_EMAIL_PROCESSING_PENDING');}});
 return response;
}
