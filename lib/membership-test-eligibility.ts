// Server-owned test policy. Never import into a browser component.
import {checkMembershipEligibility,parseMembershipIdentity,type MembershipIdentity,type MembershipIdentityLookup} from './membership-eligibility.ts';
import {membershipTestPricingEnabled,ownerTestEmail,isOwnerSharedPhoneTestContact} from './membership-test-pricing.ts';
import {londonDate} from './membership.ts';

export function sharedPhoneTestAllowed(identity:MembershipIdentity,env:Record<string,string|undefined>){
 return membershipTestPricingEnabled(env)&&env.ZOHO_BIGIN_WHATSAPP_RELEASE_MODE==='owner-test'&&
  env.ICSH_MEMBERSHIP_SHARED_PHONE_TEST_ENABLED==='true'&&identity.kind==='new'&&
  identity.mobile===env.ICSH_MEMBERSHIP_SHARED_PHONE_TEST_MOBILE&&
  isOwnerSharedPhoneTestContact({email:identity.email,fullName:identity.firstName+' '+identity.lastName});
}

export async function checkMembershipEligibilityWithOwnerTest(value:MembershipIdentity,search:MembershipIdentityLookup,env:Record<string,string|undefined>,on=londonDate()){
 const identity=parseMembershipIdentity(value);
 if(!sharedPhoneTestAllowed(identity,env))return checkMembershipEligibility(identity,search,on);
 // The one authorised test profile may share the real member's phone. It must
 // still have a unique email and its own matching Contact. Never select, bind,
 // or update the real member's Contact through this exception.
 const emailResult=await search({method:'email',email:identity.email});
 if(emailResult.records.some(r=>ownerTestEmail(r.email)&&!isOwnerSharedPhoneTestContact(r)))return {status:'identity_conflict' as const};
 return checkMembershipEligibility(identity,async()=>emailResult,on);
}
