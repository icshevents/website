import {MEMBERSHIP_PRICING} from './membership-pricing.ts';
import {britishToIso,quoteMembership,type Education,type MembershipQuote} from './membership.ts';
export type MembershipAnswers={kind:''|'new'|'renewal';firstName:string;lastName:string;dob:string;mobile:string;email:string;education:Education;studentDeclaration:boolean;terms:boolean;accuracy:boolean};
export type FieldErrors=Partial<Record<keyof MembershipAnswers,string>>;
export const EMPTY_ANSWERS:MembershipAnswers={kind:'',firstName:'',lastName:'',dob:'',mobile:'',email:'',education:'',studentDeclaration:false,terms:false,accuracy:false};
export function getQuote(values:MembershipAnswers,on:string):MembershipQuote|null {
 const dob=britishToIso(values.dob);if(!dob)return null;try{return quoteMembership(dob,values.education,on)}catch{return null}
}
export function validateStep(values:MembershipAnswers,step:number,on:string):FieldErrors {
 const errors:FieldErrors={};const quote=getQuote(values,on);
 if(step===1){
  if(!['new','renewal'].includes(values.kind))errors.kind='Choose New Member or Membership Renewal.';
  for(const key of ['firstName','lastName'] as const)if(!values[key].trim()||values[key].trim().length>80||/[<>\u0000-\u001f]/.test(values[key]))errors[key]=`Enter your ${key==='firstName'?'first':'last'} name (up to 80 characters).`;
  if(!britishToIso(values.dob))errors.dob='Enter a real date in DD/MM/YYYY format.';else if(!quote)errors.dob='Your date of birth must be from 1900 through today; future dates are not allowed.';
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(values.email.trim())||values.email.length>254)errors.email='Enter a valid email address.';
  if(!/^[\d() .+-]+$/.test(values.mobile)||values.mobile.replace(/\D/g,'').length<7||values.mobile.replace(/\D/g,'').length>15)errors.mobile='Enter a valid mobile number with 7–15 digits.';
 }
 if(step===2){
  if(!quote)errors.dob='Enter a valid date of birth in Personal details first.';
  if(quote&&quote.age<MEMBERSHIP_PRICING.studentMaximumAgeExclusive&&!['yes','no'].includes(values.education))errors.education='Choose Yes or No for full-time education.';
  if(quote?.declarationRequired&&values.studentDeclaration!==true)errors.studentDeclaration='Confirm the full-time education declaration to continue with free membership.';
 }
 if(step===3&&values.terms!==true)errors.terms='Please confirm that you understand and agree to the membership terms.';
 if(step===4&&values.accuracy!==true)errors.accuracy='Confirm that your application information is true, accurate and complete.';
 return errors;
}
export function validateApplication(values:MembershipAnswers,on:string):FieldErrors {return Object.assign({},...[1,2,3,4].map(step=>validateStep(values,step,on)));}
export function updateAnswer<K extends keyof MembershipAnswers>(values:MembershipAnswers,key:K,value:MembershipAnswers[K],on:string):MembershipAnswers {
 const next={...values,[key]:value,...(key!=='accuracy'?{accuracy:false}:{})};
 if(key==='dob'||key==='education'){next.studentDeclaration=false;const quote=getQuote(next,on);if(key==='dob'&&(!quote||quote.age>=MEMBERSHIP_PRICING.studentMaximumAgeExclusive))next.education='';}
 return next;
}
export function errorStep(key:keyof MembershipAnswers):number {return key==='education'||key==='studentDeclaration'?2:key==='terms'?3:key==='accuracy'?4:1;}
