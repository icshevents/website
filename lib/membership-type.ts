import {londonDate} from './membership.ts';
import {getQuote,validateApplication} from './membership-validation.ts';
import {savedOwnerTestRate} from './membership-test-pricing.ts';
import type {MembershipApplication} from './membership-applications/model.ts';

export const BIGIN_MEMBERSHIP_TYPES=['Standard','Pensioner','Student'] as const;
export type BiginMembershipType=typeof BIGIN_MEMBERSHIP_TYPES[number];
export function biginMembershipType(category:unknown):BiginMembershipType {
 switch(category){case 'standard':return 'Standard';case 'pensioner':return 'Pensioner';case 'student':return 'Student';default:throw new Error('MEMBERSHIP_CATEGORY_INVALID');}
}
/** Use the validated category for this application/term, not today's age or payment amount alone. */
export function membershipTypeForApplication(app:MembershipApplication):BiginMembershipType {
 const created=new Date(app.createdAt);
 if(app.deletedAt||!Number.isFinite(created.getTime())||app.currency!=='GBP')throw new Error('MEMBERSHIP_CATEGORY_INVALID');
 const on=londonDate(created),quote=getQuote(app.answers,on);
 if(!quote||Object.keys(validateApplication(app.answers,on)).length||quote.category!==app.category||
  (app.feePence!==quote.fee*100&&!savedOwnerTestRate(app)))throw new Error('MEMBERSHIP_CATEGORY_INVALID');
 return biginMembershipType(app.category);
}
