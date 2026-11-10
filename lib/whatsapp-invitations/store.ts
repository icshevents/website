import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {MembershipApplication} from '../membership-applications/model.ts';
import type {MembershipStoreDatabase} from '../membership-applications/store.ts';
import type {PaymentRow} from '../membership-payments/core.ts';
import type {InvitationActivation,InvitationConfiguration,InvitationDependencies,InvitationSnapshot} from './core.ts';

/** Secret-role database only. No stored records are projected into public receipts. */
export function invitationStore(db:MembershipStoreDatabase,config:InvitationConfiguration,readApplication:(id:string)=>Promise<MembershipApplication|null>):Pick<InvitationDependencies,'read'|'claim'|'finish'>{
 return {
  async read(id):Promise<InvitationSnapshot|null>{
   const [application,payment,activation]=await Promise.all([readApplication(id),
    db.from('icsh_membership_payments').select('application_id,account_id,mode,amount,currency,status,paid_at,payment_intent_id,charge_id,refunded_amount').eq('application_id',id).maybeSingle(),
    db.from('icsh_membership_activations').select('application_id,account_id,activation_kind,status,contact_id,payment_intent_id,paid_at,start_date,expiry_date').eq('application_id',id).maybeSingle()]);
   if(payment.error||activation.error)throw new Error('INVITATION_SNAPSHOT_UNAVAILABLE');
   return application?{application,payment:payment.data as PaymentRow|null,activation:activation.data as InvitationActivation|null}:null;
  },
  async claim(request){
   const token=randomUUID();
   const result=await db.rpc(config.membershipKind==='free'?'icsh_free_whatsapp_invitation_claim':'icsh_whatsapp_invitation_claim',{p_id:request.applicationId,p_token:token,p_request:request,p_applications_from:config.applicationsFrom});
   if(result.error)throw new Error('INVITATION_CLAIM_UNAVAILABLE');
   if(result.data===null)return null;
   const parsed=z.object({token:z.uuid()}).strict().safeParse(result.data);
   if(!parsed.success||parsed.data.token!==token)throw new Error('INVITATION_CLAIM_UNCERTAIN');
   return parsed.data;
  },
  async finish(id,token,outcome){
   const result=await db.rpc('icsh_whatsapp_invitation_finish',{p_id:id,p_token:token,p_status:outcome});
   if(result.error||result.data!==true)throw new Error('INVITATION_RESULT_UNAVAILABLE');
  }
 };
}
