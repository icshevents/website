// Future integration boundary: types only, deliberately no implementation, endpoint or network transport.
import type {MembershipAnswers} from './membership-validation.ts';
import type {Category} from './membership.ts';
export type MembershipRegistrationDraft={
 applicant:Pick<MembershipAnswers,'kind'|'firstName'|'lastName'|'dob'|'mobile'|'email'|'education'>;
 category:Category;annualFee:number;currency:'GBP';durationMonths:12;
 declarations:{studentEligibility:boolean;membershipTerms:boolean;informationAccuracy:boolean};
 activationDate:null;expiryDate:null;paymentStatus:'not_started';
};
// A later implementation must verify member identity, prevent duplicates, map approved CRM fields,
// verify payment server-side and obtain launch approval. Nothing in the current form invokes it.
export interface FutureMembershipIntegration {registerOrRenew(draft:MembershipRegistrationDraft):Promise<{status:'pending';reference:string}>}
