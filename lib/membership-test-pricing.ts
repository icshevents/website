import type {MembershipQuote} from './membership.ts';

// Server-side pricing rule. Never import this module into a browser component.
const ownerEmail='events.icsh@gmail.com';
export function ownerTestEmail(value:unknown){return typeof value==='string'&&value.trim().toLowerCase()===ownerEmail;}
/** Distinct test identity, so its shared phone cannot shadow a real member. */
export function isOwnerSharedPhoneTestContact(value:{email?:string|null;fullName?:string|null}){
 return ownerTestEmail(value.email)&&typeof value.fullName==='string'&&value.fullName.trim().replace(/\s+/g,' ').toLowerCase()==='icsh whatsapp test';
}
export function membershipTestPricingEnabled(env:Record<string,string|undefined>){
 return env.VERCEL_ENV==='production'&&env.ICSH_MEMBERSHIP_TEST_PRICING_ENABLED==='true';
}
export function testMembershipQuote(quote:MembershipQuote|null,email:string,enabled=false):MembershipQuote|null{
 if(!quote||!enabled||!ownerTestEmail(email)||quote.fee<=0||!['standard','pensioner'].includes(quote.category))return quote;
 return {...quote,fee:1,explanation:'ICSH end-to-end test payment: £1. Normal membership eligibility and payment verification still apply.'};
}
/** Verify saved £1 evidence even after the temporary offer is switched off. */
export function savedOwnerTestRate(a:{mode:string;currency:string;category:string;feePence:number;answers:{email:string}}){
 return a.mode==='live'&&a.currency==='GBP'&&['standard','pensioner'].includes(a.category)&&a.feePence===100&&ownerTestEmail(a.answers.email);
}
