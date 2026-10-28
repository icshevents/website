import 'server-only';
import {createEventService} from '../event-forms/service.js';
import {checkMembershipEligibility,type MembershipIdentity} from '../membership-eligibility';
import {searchBiginMembershipRecords} from '../zoho/server';
import {getMembershipApplication} from './store';
import type {SaveMembershipApplicationInput} from './model';
import {sameRetryAnswers} from './retry';

export async function checkRetryMembershipEligibility(identity:MembershipIdentity){
 const decision=await checkMembershipEligibility(identity,searchBiginMembershipRecords);
 if(!['review_required','renewal_required'].includes(decision.status))return decision;
 const r=await createEventService().rpc('icsh_membership_retry_identity',{p_identity:identity});
 if(r.error)throw new Error('MEMBERSHIP_RETRY_UNAVAILABLE');
 return r.data===true?{status:'allowed' as const}:decision;
}
export async function resumeUnpaidApplication(input:SaveMembershipApplicationInput){
 const db=createEventService();
 const r=await db.rpc('icsh_membership_application_resume',{p_answers:input.answers,p_category:input.category,p_fee:input.feePence,p_capability_hash:input.capabilityHash});
 if(r.error)throw new Error('MEMBERSHIP_RETRY_UNAVAILABLE');if(!r.data)return null;
 const saved=await getMembershipApplication(String(r.data),db);
 if(!saved||saved.deletedAt||saved.mode!=='live'||saved.feePence!==input.feePence||saved.category!==input.category||!sameRetryAnswers(saved.answers,input.answers))throw new Error('MEMBERSHIP_RETRY_MISMATCH');
 return saved;
}
export async function retryReceiptAllowed(id:string,capabilityHash:string){
 const r=await createEventService().rpc('icsh_membership_retry_receipt',{p_id:id,p_hash:capabilityHash});
 if(r.error)throw new Error('MEMBERSHIP_RETRY_UNAVAILABLE');return r.data===true;
}
