import {londonDate} from '../membership.ts';
import {processFormEmails} from '../form-emails/server';
import {ensureWebsiteMemberId} from '../member-ids/server';
import 'server-only';
import {eligibleFreeMembership} from './free';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {createEventService} from '../event-forms/service.js';
import {getMembershipApplication} from '../membership-applications/store';
import {paymentConfiguration} from '../membership-payments/core';
import {membershipActivationClient} from '../zoho/server';
import {activateMatchedMembership,ActivationReview} from '../zoho/membership-activation';
import {ZohoError} from '../zoho/client';
const activationSchema=z.object({application_id:z.uuid(),account_id:z.string(),payment_intent_id:z.string().nullable(),paid_at:z.string().nullable(),activation_kind:z.enum(['paid','free']).default('paid'),start_date:z.iso.date(),expiry_date:z.iso.date(),contact_id:z.string().nullable(),status:z.enum(['pending','syncing','active','failed','review_required']),activated_at:z.string().nullable(),error_code:z.string().nullable()});
export type MembershipActivation=z.infer<typeof activationSchema>;
export const activationEnabled=()=>process.env.ZOHO_BIGIN_MEMBERSHIP_ACTIVATION_ENABLED==='true';
export function publicActivation(value:MembershipActivation|null){return value?{status:value.status==='active'?'active':value.status==='review_required'?'review_required':'pending',startDate:value.status==='active'?value.start_date:null,expiryDate:value.status==='active'?value.expiry_date:null}:null;}
export async function membershipActivation(id:string):Promise<MembershipActivation|null>{const r=await createEventService().from('icsh_membership_activations').select('*').eq('application_id',id).maybeSingle();if(r.error)throw new Error('ACTIVATION_UNAVAILABLE');return r.data?activationSchema.parse(r.data):null;}
export async function membershipActivationsForOrganiser(ids:string[]){const map=new Map<string,MembershipActivation>();if(!ids.length)return map;const r=await createEventService().from('icsh_membership_activations').select('*').in('application_id',ids);if(r.error)throw new Error('ACTIVATION_UNAVAILABLE');for(const row of r.data||[]){const value=activationSchema.parse(row);map.set(value.application_id,value);}return map;}
export async function activatePaidMembership(id:string){return activateMembership(id,false);}
export async function activateFreeMembership(id:string){return activateMembership(id,true);}
async function activateMembership(id:string,free:boolean):Promise<'active'|'review_required'|'skipped'>{
 const config=free?null:paymentConfiguration(process.env,false);if(!activationEnabled()||(!free&&(!config||config.mode!=='live')))return'skipped';const db=createEventService(),claim=randomUUID();
 if(free){const app=await getMembershipApplication(id,db);if(!app||!eligibleFreeMembership(app))return'skipped';}
 const prepared=free?await db.rpc('icsh_free_membership_activation_claim',{p_id:id,p_claim:claim}):await db.rpc('icsh_membership_activation_claim',{p_id:id,p_account:config!.account,p_claim:claim});if(prepared.error)throw new Error('ACTIVATION_CLAIM_UNAVAILABLE');if(!prepared.data)return'skipped';
 const x=activationSchema.parse(prepared.data.activation);if(!prepared.data.claimed){if(x.status==='active')return'active';if(x.status==='review_required')return'review_required';throw new Error('ACTIVATION_RETRY');}
 const finish=async(status:'active'|'failed'|'review_required',code:string|null=null)=>{const saved=await db.rpc('icsh_membership_activation_finish',{p_id:id,p_claim:claim,p_status:status,p_error:code});if(saved.error)throw new Error('ACTIVATION_RECORD_UNAVAILABLE');return activationSchema.parse(saved.data);};
 try{
  const app=await getMembershipApplication(id,db);if(!app||app.deletedAt)throw new Error('APPLICATION_CHANGED');
  await activateMatchedMembership(membershipActivationClient,app.answers,x.contact_id||app.biginRecordId,{Membership_Status:'Active',Payment_Status:free?'Not required':'Completed',Membership_Date:x.start_date,Expiry_Date:x.expiry_date},async contact=>{await ensureWebsiteMemberId(app,contact);const bound=await db.rpc('icsh_membership_activation_bind',{p_id:id,p_claim:claim,p_contact:contact});if(bound.error)throw new Error('ACTIVATION_BIND_UNAVAILABLE');return bound.data===true;},londonDate());
  const saved=await finish('active');if(saved.status==='active')await processFormEmails().catch(()=>console.error('ICSH_FORM_EMAIL_PROCESSING_PENDING'));return saved.status==='active'?'active':'review_required';
 }catch(error){if(error instanceof ActivationReview){await finish('review_required',error.code);return'review_required';}await finish('failed',error instanceof ZohoError?error.code:'ACTIVATION_RETRY_REQUIRED');throw new Error('ACTIVATION_RETRY');}
}
export async function reconcilePaidMemberships(){
 const config=paymentConfiguration(process.env,false);if(!config||config.mode!=='live'||!activationEnabled())return{processed:0,active:0,review:0,retry:0};
 const db=createEventService(),result=await db.rpc('icsh_membership_activation_candidates',{p_account:config.account});if(result.error)throw new Error('ACTIVATION_LIST_UNAVAILABLE');
 let processed=0,active=0,review=0,retry=0;
 for(const row of result.data||[]){processed++;try{const state=await activatePaidMembership(row.application_id);if(state==='active')active++;if(state==='review_required')review++;}catch{retry++;}}
 return{processed,active,review,retry};
}
export function authorisedActivationJob(request:Request){const secret=process.env.CRON_SECRET||'',value=Buffer.from(request.headers.get('authorization')||''),expected=Buffer.from('Bearer '+secret);return secret.length>=32&&value.length===expected.length&&timingSafeEqual(value,expected);}

export async function reconcileFreeMemberships(){
 if(!activationEnabled())return{processed:0,active:0,review:0,retry:0};
 const result=await createEventService().rpc('icsh_free_membership_activation_candidates');if(result.error)throw new Error('FREE_ACTIVATION_LIST_UNAVAILABLE');
 let processed=0,active=0,review=0,retry=0;
 for(const row of result.data||[]){processed++;try{const status=await activateFreeMembership(row.application_id);if(status==='active')active++;if(status==='review_required')review++;}catch{retry++;}}
 return{processed,active,review,retry};
}
