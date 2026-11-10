// Legacy draft contract retained for compatibility; it is not the saved test-application shape.
// Current record/status types live in membership-applications/model.ts. Submission and
// organiser-controlled Bigin delivery are implemented in membership-applications/ and zoho/.
import type {MembershipAnswers} from './membership-validation.ts';
import type {Category} from './membership.ts';
/** @deprecated Use the membership-applications model for current test submissions. */
export type MembershipRegistrationDraft={
 applicant:Pick<MembershipAnswers,'kind'|'firstName'|'lastName'|'dob'|'mobile'|'email'|'education'>;
 category:Category;annualFee:number;currency:'GBP';durationMonths:12;
 declarations:{studentEligibility:boolean;membershipTerms:boolean;informationAccuracy:boolean};
 activationDate:null;expiryDate:null;paymentStatus:'not_started';
};
// Reserved for later live activation after identity, duplicate, mapping and payment rules are approved.
// The current test flow saves pending applications with null dates and never invokes this interface.
/** @deprecated No live register/renew implementation is enabled. */
export interface FutureMembershipIntegration {registerOrRenew(draft:MembershipRegistrationDraft):Promise<{status:'pending';reference:string}>}
