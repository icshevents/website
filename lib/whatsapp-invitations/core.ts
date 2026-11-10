import {validStripeChargeId} from '../stripe-charge.ts';
import {z} from 'zod';
import {londonDate} from '../membership.ts';
import {membershipMobileKey} from '../membership-eligibility.ts';
import {MEMBERSHIP_PRICING} from '../membership-pricing.ts';
import {eligibleFreeMembership} from '../membership-activation/free.ts';
import {MEMBERSHIP_COMMUNICATIONS_NOTICE_VERSION} from '../membership-communications.ts';
import {savedOwnerTestRate,ownerTestEmail} from '../membership-test-pricing.ts';
import type {MembershipApplication} from '../membership-applications/model.ts';
import type {PaymentRow} from '../membership-payments/core.ts';

// Pure policy/processor; production callers enter through server.ts and explicit release gates.
export type InvitationConfiguration = {
 membershipKind?:'free';
 enabled:boolean;
 approved:boolean;
 accountId:string;
 sender:string;
 templateName:string;
 category:'utility'|'marketing';
 // Required release boundary; applications created earlier must never be backfilled.
 applicationsFrom:string;
 // The direct delivery test recipient is independent of the form's mobile number.
 ownerTestOnly?:boolean;
};
export type InvitationActivation = {
 application_id:string;account_id:string;payment_intent_id:string|null;paid_at:string|null;
 activation_kind:'paid'|'free';status:string;contact_id:string|null;
 start_date:string;expiry_date:string;
};
export type InvitationSnapshot = {
 application:MembershipApplication;
 payment:PaymentRow|null;
 activation:InvitationActivation|null;
};
export type InvitationRequest = {
 applicationId:string;contactId:string;recipient:string;paymentIntentId:string|null;
 startDate:string;expiryDate:string;templateName:string;category:'utility'|'marketing';
 sender:string;accountId:string;
};
export type InvitationDecision = {eligible:true;request:InvitationRequest}|{eligible:false;reason:string};
const uuid=(s:unknown)=>z.string().uuid().safeParse(s).success;
const instant=(s:unknown):s is string=>z.iso.datetime({offset:true}).safeParse(s).success;
const date=(s:unknown):s is string=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const contactId=(s:unknown):s is string=>typeof s==='string'&&/^[1-9][0-9]{0,29}$/.test(s);

export function invitationConfigurationReady(config:InvitationConfiguration){
 return config.enabled===true&&config.approved===true&&(config.membershipKind==='free'?config.accountId==='free':/^acct_[A-Za-z0-9]+$/.test(config.accountId))&&
  /^icsh_[a-z0-9_]{1,100}$/.test(config.templateName)&&['utility','marketing'].includes(config.category)&&
  instant(config.applicationsFrom)&&typeof config.sender==='string'&&membershipMobileKey(config.sender)===config.sender;
}

/** Evaluate verified saved records only. A checkout redirect or Contact edit is not payment evidence. */
export function invitationDecision(snapshot:InvitationSnapshot|null,config:InvitationConfiguration,today=londonDate()):InvitationDecision{
 const no=(reason:string):InvitationDecision=>({eligible:false,reason});
 if(!invitationConfigurationReady(config))return no('INVITATIONS_NOT_READY');
 if(!snapshot)return no('APPLICATION_NOT_FOUND');
 const {application:a,payment:p,activation:x}=snapshot;
 if(!uuid(a.id)||a.mode!=='live'||a.testData!==false||a.deletedAt||a.applicationStatus!=='received')return no('APPLICATION_INELIGIBLE');
 if(!instant(a.createdAt)||Date.parse(a.createdAt)<Date.parse(config.applicationsFrom))return no('APPLICATION_BEFORE_RELEASE');
 if(a.answers.whatsappInvitation!==true)return no('INVITATION_NOT_REQUESTED');
 if(config.membershipKind==='free'){
  if(a.answers.communicationsNotice!==MEMBERSHIP_COMMUNICATIONS_NOTICE_VERSION||!eligibleFreeMembership(a)||
   !['new','renewal'].includes(a.answers.kind)||a.currency!=='GBP'||p!==null)return no('VERIFIED_FREE_MEMBERSHIP_REQUIRED');
  if(config.ownerTestOnly===true&&!ownerTestEmail(a.answers.email))return no('OWNER_TEST_ONLY');
  const recipient=membershipMobileKey(a.answers.mobile);
  if(!recipient||recipient===config.sender)return no('INVITATION_RECIPIENT_INVALID');
  if(!x||x.application_id!==a.id||x.account_id!=='free'||x.activation_kind!=='free'||x.status!=='active'||
   x.payment_intent_id!==null||x.paid_at!==null||!contactId(x.contact_id)||a.biginRecordId!==x.contact_id||a.biginSyncStatus!=='synced')return no('MATCHED_ACTIVATION_REQUIRED');
  if(!date(today)||!date(x.start_date)||!date(x.expiry_date)||x.start_date>today||x.expiry_date<=today||x.expiry_date<=x.start_date)return no('CURRENT_MEMBERSHIP_REQUIRED');
  return {eligible:true,request:{applicationId:a.id,contactId:x.contact_id,recipient,paymentIntentId:null,
   startDate:x.start_date,expiryDate:x.expiry_date,templateName:config.templateName,category:config.category,sender:config.sender,accountId:'free'}};
 }

 const requiredFee=savedOwnerTestRate(a)?100:a.category==='standard'?MEMBERSHIP_PRICING.standardFee*100:a.category==='pensioner'?MEMBERSHIP_PRICING.pensionerFee*100:0;
 if(!['new','renewal'].includes(a.answers.kind)||!Number.isSafeInteger(a.feePence)||requiredFee<=0||a.feePence!==requiredFee||a.currency!=='GBP')return no('PAID_APPLICATION_REQUIRED');
 const recipient=typeof a.answers.mobile==='string'?membershipMobileKey(a.answers.mobile):null;
 if(!recipient||recipient===config.sender)return no('INVITATION_RECIPIENT_INVALID');
 if(config.ownerTestOnly===true&&!savedOwnerTestRate(a))return no('OWNER_TEST_ONLY');
 if(!p||p.application_id!==a.id||p.account_id!==config.accountId||p.mode!=='live'||p.status!=='paid'||
  p.amount!==a.feePence||p.currency!=='gbp'||p.refunded_amount!==0||!instant(p.paid_at)||
  !/^pi_[A-Za-z0-9]+$/.test(p.payment_intent_id||'')||!validStripeChargeId(p.charge_id))return no('VERIFIED_PAYMENT_REQUIRED');
 if(!x||x.application_id!==a.id||x.account_id!==p.account_id||x.activation_kind!=='paid'||x.status!=='active'||
  x.payment_intent_id!==p.payment_intent_id||!instant(x.paid_at)||Date.parse(x.paid_at)!==Date.parse(p.paid_at)||
  !contactId(x.contact_id)||a.biginRecordId!==x.contact_id||a.biginSyncStatus!=='synced')return no('MATCHED_ACTIVATION_REQUIRED');
 if(!date(today)||!date(x.start_date)||!date(x.expiry_date)||x.start_date>today||x.expiry_date<=today||
  x.expiry_date<=x.start_date||londonDate(new Date(p.paid_at))!==x.start_date)return no('CURRENT_MEMBERSHIP_REQUIRED');
 return {eligible:true,request:{applicationId:a.id,contactId:x.contact_id,recipient,paymentIntentId:p.payment_intent_id!,
  startDate:x.start_date,expiryDate:x.expiry_date,templateName:config.templateName,category:config.category,sender:config.sender,accountId:config.accountId}};
}

export type InvitationOutcome='request_accepted'|'rejected'|'review_required'|'cancelled';
export type InvitationDependencies = {
 read:(applicationId:string)=>Promise<InvitationSnapshot|null>;
 // MUST persist atomically with a unique application_id, including the target and template.
 // Return null after any prior claim, including accepted, uncertain or abandoned claims.
 // No automatic lease expiry/reclaim: a provider may have accepted an unacknowledged request.
 claim:(request:InvitationRequest)=>Promise<{token:string}|null>;
 // This requests a workflow; acceptance is not proof of WhatsApp delivery.
 request:(request:InvitationRequest)=>Promise<'accepted'|'rejected'|'unknown'>;
 // Persist the outcome under the same claim token. Store delivery receipts separately later.
 finish:(applicationId:string,token:string,outcome:InvitationOutcome)=>Promise<void>;
};
export type InvitationProcessingResult = {status:InvitationOutcome|'skipped';reason?:string};

/** Permanent claim, fresh eligibility and conservative handling of uncertain external requests. */
export async function processInvitation(applicationId:string,config:InvitationConfiguration,deps:InvitationDependencies,today=londonDate()):Promise<InvitationProcessingResult>{
 if(!uuid(applicationId)||!invitationConfigurationReady(config))return {status:'skipped',reason:'INVITATIONS_NOT_READY'};
 const first=invitationDecision(await deps.read(applicationId),config,today);
 if(!first.eligible)return {status:'skipped',reason:first.reason};
 if(first.request.applicationId!==applicationId)return {status:'skipped',reason:'APPLICATION_ID_MISMATCH'};
 const claim=await deps.claim(first.request);
 if(!claim)return {status:'skipped',reason:'INVITATION_ALREADY_CLAIMED'};
 if(!uuid(claim.token))return {status:'review_required',reason:'INVALID_INVITATION_CLAIM'};
 let outcome:InvitationOutcome='review_required';
 try{
  // Refresh payment/permission/activation after the claim, immediately before the outbound action.
  const latest=invitationDecision(await deps.read(applicationId),config,today);
  if(!latest.eligible||JSON.stringify(latest.request)!==JSON.stringify(first.request))outcome='cancelled';
  else{
   const result=await deps.request(latest.request);
   outcome=result==='accepted'?'request_accepted':result==='rejected'?'rejected':'review_required';
  }
 }catch{
  // Network/provider/storage uncertainty is not evidence that no message was requested.
  // The durable claim stays reserved and prevents a blind automatic resend.
  outcome='review_required';
 }
 try{await deps.finish(applicationId,claim.token,outcome);}
 catch{return {status:'review_required',reason:'INVITATION_RECORD_UNCERTAIN'};}
 return {status:outcome};
}
