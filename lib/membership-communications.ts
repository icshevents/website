import {getQuote,type MembershipAnswers} from './membership-validation.ts';

/** Immutable service notice versions. Old saved choices must remain unchanged. */
export const LEGACY_MEMBERSHIP_COMMUNICATIONS_NOTICE_VERSION='2026-11-06-membership-service-v1' as const;
export const MEMBERSHIP_COMMUNICATIONS_NOTICE_VERSION='2026-11-06-all-tiers-v2' as const;
export const MEMBERSHIP_COMMUNICATIONS_NOTICE_VERSIONS=[LEGACY_MEMBERSHIP_COMMUNICATIONS_NOTICE_VERSION,MEMBERSHIP_COMMUNICATIONS_NOTICE_VERSION] as const;
export function acknowledgeMembershipSubmission(values:MembershipAnswers,on:string):MembershipAnswers{
 const quote=getQuote(values,on);
 return {...values,terms:true,accuracy:true,communicationsNotice:MEMBERSHIP_COMMUNICATIONS_NOTICE_VERSION,
  whatsappInvitation:quote!==null};
}
