import {membershipMobileKey} from '../membership-eligibility.ts';
import type {MembershipAnswers} from '../membership-validation.ts';
/** A retry can pay the same application, never replace its personal answers. */
export function sameRetryAnswers(saved:MembershipAnswers,input:MembershipAnswers){
 return Object.keys(input).every(key=>{
  const k=key as keyof MembershipAnswers;if(k==='mobileVerificationId')return true;
  return k==='mobile'?membershipMobileKey(saved.mobile)===membershipMobileKey(input.mobile):k==='whatsappInvitation'?Boolean(saved[k])===Boolean(input[k]):saved[k]===input[k];
 });
}
