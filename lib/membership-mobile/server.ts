import 'server-only';
import {randomUUID,randomInt,randomBytes,createHmac} from 'node:crypto';
import {z} from 'zod';
import {createEventService} from '../event-forms/service.js';
import {membershipActivationClient as client,searchBiginMembershipRecords} from '../zoho/server';
import {checkMembershipEligibility,parseMembershipIdentity,membershipMobileKey,type MembershipIdentity} from '../membership-eligibility';
import {sendTransactionalContent} from '../form-emails/core';
import {getMembershipApplication} from '../membership-applications/store';
import {activationIdentityMatches} from '../zoho/membership-activation';
import {mobileCodeHash,proofHash,mobileVerificationContent,emailNameMatches,verifiedMobileIdentity,type MobileVerification} from './core';
import type {MembershipAnswers} from '../membership-validation';
const schema=z.object({id:z.uuid(),contact_id:z.string(),email:z.string(),old_mobile:z.string().nullable(),new_mobile:z.string(),application_id:z.uuid().nullable(),verified_at:z.string().nullable(),proof_until:z.string().nullable(),mobile_status:z.enum(['pending','writing','confirmed','review_required']),claim_id:z.uuid().nullable()});
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex'};
export async function mobileVerificationForApplication(appId:string):Promise<MobileVerification|null>{const r=await createEventService().from('icsh_membership_mobile_verifications').select('id,contact_id,email,old_mobile,new_mobile,application_id,verified_at,proof_until,mobile_status,claim_id').eq('application_id',appId).maybeSingle();if(r.error)throw Error('MOBILE_VERIFICATION_UNAVAILABLE');return r.data?schema.parse(r.data):null;}
export async function validMobileProof(answers:MembershipAnswers,token:string|undefined,applicationId:string){
 if(!answers.mobileVerificationId||!token||!/^[a-f0-9]{64}$/.test(token)||answers.kind!=='renewal')return false;
 const r=await createEventService().rpc('icsh_membership_mobile_proof',{p_id:answers.mobileVerificationId,p_hash:proofHash(token),p_email:answers.email.trim().toLowerCase(),p_mobile:membershipMobileKey(answers.mobile),p_application:applicationId});
 if(r.error)throw Error('MOBILE_VERIFICATION_UNAVAILABLE');return r.data===true;
}
export async function handleMobileVerification(request:Request){
 const reply=(data:unknown,status=200)=>Response.json(data,{status,headers});
 try{
  if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Open the membership form on the ICSH website.'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Invalid request.'},415);
  const secret=process.env.SUPABASE_SECRET_KEY||'';if(secret.length<32)throw Error('Unavailable');
  const db=createEventService(),ip=(request.headers.get('x-vercel-forwarded-for')??request.headers.get('x-forwarded-for')??'local').split(',')[0].trim();
  const key=createHmac('sha256',secret).update('mobile-verification:'+ip).digest('hex');
  for(const [k,max]of[['mobile-verification:'+key,20],['mobile-verification:global',200]] as const){const r=await db.rpc('icsh_event_rate_limit',{p_key:k,p_max:max});if(r.error)throw Error('Unavailable');if(r.data!==true)return reply({error:'Too many attempts. Please wait ten minutes.'},429);}
  // Cap the body before parsing; no secrets or verification codes are logged.
  const reader=request.body?.getReader();if(!reader)return reply({error:'Invalid request.'},400);const chunks:Uint8Array[]=[];let size=0;try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2000){await reader.cancel();return reply({error:'Invalid request.'},413);}chunks.push(part.value);}}finally{reader.releaseLock();}const raw=Buffer.concat(chunks).toString('utf8');
  let body;try{body=JSON.parse(raw);}catch{return reply({error:'Invalid request.'},400);}
  if(body?.action==='start'){
   const parsed=z.object({action:z.literal('start'),identity:z.unknown()}).strict().safeParse(body);if(!parsed.success)return reply({error:'Invalid request.'},400);
   let identity:MembershipIdentity;try{identity=parseMembershipIdentity(parsed.data.identity);}catch{return reply({error:'Review your membership details.'},400);}
   if(identity.kind!=='renewal')return reply({error:'This check is for membership renewals.'},400);
   const decision=await checkMembershipEligibility(identity,searchBiginMembershipRecords);if(decision.status!=='allowed'||!decision.mobileChanged)return reply({error:'Check your renewal details again before requesting a code.'},409);
   const found=await client.searchBiginContactsByEmail(identity.email);if(found.hasMore||found.matches.length!==1)return reply({error:'Your membership needs ICSH review.'},409);
   const contact=await client.getBiginContact(found.matches[0].id);if(!emailNameMatches(contact,identity))return reply({error:'Your membership needs ICSH review.'},409);
   const id=randomUUID(),code=String(randomInt(0,1000000)).padStart(6,'0');
   const created=await db.rpc('icsh_membership_mobile_start',{p_id:id,p_contact:contact.id,p_email:contact.email,p_old:membershipMobileKey(contact.mobile||''),p_new:identity.mobile,p_code_hash:mobileCodeHash(id,code,secret)});
   if(created.error)throw Error('Unavailable');if(created.data!==true)return reply({error:'Please wait before requesting another code. Up to five codes can be requested per day.'},429);
   const sent=await sendTransactionalContent(id,contact.email,mobileVerificationContent(code),process.env);
   const saved=await db.from('icsh_membership_mobile_verifications').update({delivery_status:sent.status==='accepted'?'accepted':sent.status==='retry'?'failed':sent.status}).eq('id',id);
   if(saved.error||sent.status!=='accepted')return reply({error:'We could not confirm that a code was sent. Please wait before trying again.'},503);
   return reply({challengeId:id});
  }
  const parsed=z.object({action:z.literal('verify'),challengeId:z.uuid(),code:z.string().regex(/^\d{6}$/)}).strict().safeParse(body);if(!parsed.success)return reply({error:'Enter the six-digit code from your membership email.'},400);
  const token=randomBytes(32).toString('hex');const r=await db.rpc('icsh_membership_mobile_verify',{p_id:parsed.data.challengeId,p_code_hash:mobileCodeHash(parsed.data.challengeId,parsed.data.code,secret),p_proof_hash:proofHash(token)});
  if(r.error)throw Error('Unavailable');if(r.data!==true)return reply({error:'That code is incorrect, expired or already used. Check the code or request a new one.'},400);
  return reply({verified:true,proofToken:token});
 }catch{return reply({error:'The mobile-number check is temporarily unavailable. Your form details are still here.'},503);}
}
/** Membership activation is separate from the subsequent, email-verified number change. */
export async function completeVerifiedMobileChange(appId:string){
 const app=await getMembershipApplication(appId);if(!app||app.deletedAt)return false;if(!app.answers.mobileVerificationId)return true;
 const db=createEventService(),claim=randomUUID();
 const r=await db.rpc('icsh_membership_mobile_claim',{p_application:appId,p_claim:claim});if(r.error)throw Error('MOBILE_CHANGE_UNAVAILABLE');if(!r.data)return false;
 const v=schema.parse(r.data.verification);if(v.mobile_status==='confirmed')return true;
 const finish=async(ok:boolean)=>{const result=await db.rpc('icsh_membership_mobile_finish',{p_id:v.id,p_claim:v.claim_id,p_confirmed:ok});if(result.error||result.data!==true)throw Error('MOBILE_CHANGE_SAVE_UNAVAILABLE');return ok;};
 try{
  let c=await client.getBiginContact(v.contact_id);
  if(!verifiedMobileIdentity(app,c,v)||c.membershipStatus!=='Active'||c.membershipDate!==r.data.start_date||c.membershipExpiry!==r.data.expiry_date)return await finish(false);
  if(membershipMobileKey(c.mobile||'')===v.new_mobile)return await finish(true);
  // A lost acknowledgement gets readback only; never overwrite a subsequently edited record.
  if(r.data.claimed!==true)return false;
  await client.updateBiginMobile(v.contact_id,v.new_mobile);
  c=await client.getBiginContact(v.contact_id);
  return await finish(activationIdentityMatches(c,app.answers)&&membershipMobileKey(c.mobile||'')===v.new_mobile);
 }catch{await finish(false);return false;}
}
export async function mobileReadyForInvitation(appId:string){const app=await getMembershipApplication(appId);if(!app||app.deletedAt)return false;if(!app.answers.mobileVerificationId)return true;const v=await mobileVerificationForApplication(appId);return v?.mobile_status==='confirmed';}
export async function reconcileMobileChanges(){const r=await createEventService().rpc('icsh_membership_mobile_candidates');if(r.error)throw Error('MOBILE_CHANGE_LIST_UNAVAILABLE');let confirmed=0;for(const row of r.data||[])if(await completeVerifiedMobileChange(row.application_id).catch(()=>false))confirmed++;return{processed:r.data?.length||0,confirmed};}
