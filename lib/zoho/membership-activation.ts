import {membershipMobileKey} from '../membership-eligibility.ts';
import {normaliseMemberName} from '../member-search.ts';
import {londonDate,parseDate} from '../membership.ts';
import type {BiginContact,BiginContactSearch,BiginPaidMembershipUpdate} from './client.ts';
export type ActivationIdentity={firstName:string;lastName:string;email:string;mobile:string};
export type ActivationClient={getBiginContact(id:string):Promise<BiginContact>;searchBiginContactsByEmail(email:string):Promise<BiginContactSearch>;updateBiginPaidMembership(id:string,value:BiginPaidMembershipUpdate):Promise<void>};
export class ActivationReview extends Error {readonly code:string;constructor(code:string){super(code);this.code=code;}}
export function activationIdentityMatches(contact:BiginContact,identity:ActivationIdentity){return contact.email===identity.email.trim().toLowerCase()&&normaliseMemberName((contact.firstName||'')+' '+(contact.lastName||''))===normaliseMemberName(identity.firstName+' '+identity.lastName)&&Boolean(membershipMobileKey(identity.mobile))&&membershipMobileKey(contact.mobile||'')===membershipMobileKey(identity.mobile);}
export function activationMatches(contact:BiginContact,value:BiginPaidMembershipUpdate){return contact.membershipStatus==='Active'&&contact.paymentStatus==='Completed'&&contact.membershipDate===value.Membership_Date&&contact.membershipExpiry===value.Expiry_Date;}
/** The caller owns the durable paid-payment claim. Only these four fields are written. */
export async function activateMatchedMembership(client:ActivationClient,identity:ActivationIdentity,knownId:string|null,value:BiginPaidMembershipUpdate,bind:(id:string)=>Promise<boolean>,on=londonDate()){
 let id=knownId;if(!id){const found=await client.searchBiginContactsByEmail(identity.email);if(found.hasMore||found.matches.length>1)throw new ActivationReview('CONTACT_MATCH_AMBIGUOUS');if(!found.matches.length)throw new Error('CONTACT_NOT_READY');id=found.matches[0].id;}
 let contact=await client.getBiginContact(id);if(contact.id!==id||!activationIdentityMatches(contact,identity))throw new ActivationReview('CONTACT_IDENTITY_MISMATCH');
 if(!await bind(id))throw new Error('ACTIVATION_CLAIM_CHANGED');
 if(activationMatches(contact,value))return id;
 // Preserve another current term, including one entered by an organiser.
 if(Boolean(contact.membershipDate)!==Boolean(contact.membershipExpiry)||(contact.membershipDate&&!parseDate(contact.membershipDate))||(contact.membershipExpiry&&!parseDate(contact.membershipExpiry)))throw new ActivationReview('EXISTING_MEMBERSHIP_DATES_INVALID');
 if(contact.membershipExpiry&&contact.membershipExpiry>value.Membership_Date&&(contact.membershipDate!==value.Membership_Date||contact.membershipExpiry!==value.Expiry_Date))throw new ActivationReview('EXISTING_MEMBERSHIP_TERM');
 if(value.Expiry_Date<=on)throw new ActivationReview('PAID_TERM_EXPIRED');
 await client.updateBiginPaidMembership(id,value);
 contact=await client.getBiginContact(id);if(contact.id!==id||!activationIdentityMatches(contact,identity)||!activationMatches(contact,value))throw new Error('ACTIVATION_READBACK_PENDING');return id;
}
