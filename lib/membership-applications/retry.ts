import {membershipMobileKey} from '../membership-eligibility.ts';
import type {MembershipAnswers} from '../membership-validation.ts';
/** A retry can pay the same application, never replace its personal answers. */
export function sameRetryAnswers(saved:MembershipAnswers,input:MembershipAnswers){
 return Object.keys(input).every(key=>{
  const k=key as keyof MembershipAnswers;
  return k==='mobile'?membershipMobileKey(saved.mobile)===membershipMobileKey(input.mobile):saved[k]===input[k];
 });
}
