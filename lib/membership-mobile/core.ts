import {createHash,createHmac} from 'node:crypto';
import {membershipMobileKey} from '../membership-eligibility.ts';
import {normaliseMemberName} from '../member-search.ts';
import type {BiginContact,BiginRenewalContactUpdate} from '../zoho/client.ts';
import type {MembershipApplication} from '../membership-applications/model.ts';
export type MobileVerification={id:string;contact_id:string;email:string;old_mobile:string|null;new_mobile:string;application_id:string|null;verified_at:string|null;proof_until:string|null;mobile_status:'pending'|'writing'|'confirmed'|'review_required';claim_id:string|null;old_first_name?:string|null;old_last_name?:string|null;new_first_name?:string|null;new_last_name?:string|null};
export const proofHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export function mobileCodeHash(id:string,code:string,secret:string){if(!/^[a-f0-9-]{36}$/i.test(id)||!/^\d{6}$/.test(code)||secret.length<32)throw Error('INVALID_MOBILE_CODE');return createHmac('sha256',secret).update('icsh-mobile-code|'+id+'|'+code).digest('hex');}
export function verifiedMobileIdentity(app:MembershipApplication,c:BiginContact,v:MobileVerification|null){
 const {answers}=app;
 if(!v||answers.kind!=='renewal'||answers.mobileVerificationId!==v.id||v.application_id!==app.id||!v.verified_at||
   v.contact_id!==c.id||v.email!==c.email||v.email!==answers.email.trim().toLowerCase()||v.new_mobile!==membershipMobileKey(answers.mobile))return false;
 const mobile=membershipMobileKey(c.mobile||'');
 if(mobile!==v.old_mobile&&mobile!==v.new_mobile)return false;
 if(v.new_first_name==null||v.new_last_name==null){
  return normaliseMemberName((c.firstName||'')+' '+(c.lastName||''))===normaliseMemberName(answers.firstName+' '+answers.lastName);
 }
 if(v.new_first_name!==answers.firstName.trim()||v.new_last_name!==answers.lastName.trim())return false;
 const firstName=c.firstName?.trim()??null,lastName=c.lastName?.trim()??null;
 return (firstName===v.old_first_name&&lastName===v.old_last_name)||(firstName===v.new_first_name&&lastName===v.new_last_name);
}
export function renewalContactChanges(contact:BiginContact,verification:MobileVerification):BiginRenewalContactUpdate{
 return {
  ...(verification.new_first_name!=null&&contact.firstName?.trim()!==verification.new_first_name?{firstName:verification.new_first_name}:{}),
  ...(verification.new_last_name!=null&&contact.lastName?.trim()!==verification.new_last_name?{lastName:verification.new_last_name}:{}),
  ...(membershipMobileKey(contact.mobile||'')!==verification.new_mobile?{mobile:verification.new_mobile}:{}),
 };
}
export function mobileVerificationContent(code:string){
 if(!/^\d{6}$/.test(code))throw Error('INVALID_MOBILE_CODE');
 const textbody=`Hello,\n\nYour code to confirm your updated details for your ICSH membership renewal is:\n\n${code}\n\nThis code expires in 10 minutes. Do not share it with anyone. Your details will be updated once your renewal is confirmed.\n\nIf you did not request this change, ignore this email. No change has been made.\n\nICSH\nevents@icsh.org.uk`;
 return{subject:'ICSH – Verify your renewal details',textbody,htmlbody:`<!doctype html><html lang="en"><body style="margin:0;background:#F8F7F2;color:#263B32;font:15px/1.7 Arial,sans-serif"><table role="presentation" width="100%" style="max-width:600px;margin:auto;border-top:5px solid #AD925A"><tr><td style="padding:28px"><p style="color:#4C6259">ICSH MEMBERSHIP</p><h1 style="font:24px/1.25 Georgia,serif;color:#4C6259;white-space:nowrap">Verify renewal details</h1><p>Hello,</p><p>Use this code to confirm your updated details for your membership renewal:</p><p style="font:700 30px/1.5 Arial,sans-serif;letter-spacing:6px">${code}</p><p>This code expires in 10 minutes. Do not share it with anyone. Your details will be updated once your renewal is confirmed.</p><p>If you did not request this change, ignore this email. No change has been made.</p><p>ICSH<br>events@icsh.org.uk</p></td></tr></table></body></html>`};
}
