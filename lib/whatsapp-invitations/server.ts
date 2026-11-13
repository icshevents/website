import 'server-only';
import {mobileReadyForInvitation} from '../membership-mobile/server';
import {z} from 'zod';
import {createEventService} from '../event-forms/service.js';
import {getMembershipApplication} from '../membership-applications/store';
import {membershipActivationClient} from '../zoho/server';
import {processInvitation,type InvitationConfiguration} from './core';
import {invitationStore} from './store';
import {invitationConfiguration} from './configuration';
import {membershipTypeForApplication} from '../membership-type';
function dependencies(config:InvitationConfiguration){
 const db=createEventService();
 return {...invitationStore(db,config,id=>getMembershipApplication(id,db)),async request(request:Parameters<typeof membershipActivationClient.requestBiginInvitation>[0]){
  const app=await getMembershipApplication(request.applicationId,db);
  if(!app||app.deletedAt||app.answers.whatsappInvitation!==true||app.biginRecordId!==request.contactId)return 'rejected' as const;
  return membershipActivationClient.requestBiginInvitation(request,{...app.answers,membershipType:membershipTypeForApplication(app)});
 }};
}
/** Called after successful activation; failures must never fail a verified membership. */
export async function requestMembershipInvitation(id:string){
 if(!await mobileReadyForInvitation(id))return {status:'skipped' as const};
 const app=await getMembershipApplication(id);if(!app)return {status:'skipped' as const};
 const config=invitationConfiguration(process.env,app.feePence===0?'free':'paid');if(!config)return {status:'skipped' as const};
 return processInvitation(id,config,dependencies(config));
}
/** Picks only eligible, unclaimed applications after the configured release boundary. */
export async function reconcileMembershipInvitations(){
 const counts={processed:0,requested:0,review:0,skipped:0};
 for(const kind of ['paid','free'] as const){
  const config=invitationConfiguration(process.env,kind);if(!config)continue;
  const result=await createEventService().rpc(kind==='free'?'icsh_free_whatsapp_invitation_candidates':'icsh_whatsapp_invitation_candidates',
   kind==='free'?{p_applications_from:config.applicationsFrom}:{p_account:config.accountId,p_applications_from:config.applicationsFrom});
  if(result.error)throw new Error('INVITATION_CANDIDATES_UNAVAILABLE');
  const parsed=z.array(z.object({application_id:z.uuid()}).strict()).max(5).safeParse(result.data);
  if(!parsed.success)throw new Error('INVITATION_CANDIDATES_INVALID');
  const deps=dependencies(config);
  for(const row of parsed.data.slice(0,2)){counts.processed++;try{if(!await mobileReadyForInvitation(row.application_id)){counts.skipped++;continue;}const r=await processInvitation(row.application_id,config,deps);if(r.status==='request_accepted')counts.requested++;else if(r.status==='skipped')counts.skipped++;else counts.review++;}catch{counts.review++;}}
 }
 return counts;
}
