import 'server-only';
import {createEventService} from '../event-forms/service.js';
import {membershipActivationClient} from '../zoho/server';
import {activationIdentityMatches} from '../zoho/membership-activation';
import type {MembershipApplication} from '../membership-applications/model';
import {getMembershipApplication} from '../membership-applications/store';
import {ensureContactMemberId} from './core';
export async function ensureWebsiteMemberId(app:MembershipApplication,contactId:string){
 if(process.env.ZOHO_BIGIN_MEMBER_IDS_ENABLED!=='true'||app.mode!=='live'||app.deletedAt)return null;
 const db=createEventService();return ensureContactMemberId(membershipActivationClient,contactId,contact=>activationIdentityMatches(contact,app.answers),{
  reserve:async(candidate,rejected)=>{const r=await db.rpc('icsh_member_id_reserve',{p_application:app.id,p_contact:contactId,p_candidate:candidate,p_rejected:rejected||null});if(r.error)throw new Error('MEMBER_ID_RESERVATION_UNAVAILABLE');return r.data?{memberId:r.data.member_id,writeStarted:r.data.write_started,assigned:Boolean(r.data.confirmed_at)}:null;},
  start:async value=>{const r=await db.rpc('icsh_member_id_start',{p_contact:contactId,p_member_id:value});if(r.error)throw new Error('MEMBER_ID_RESERVATION_UNAVAILABLE');return r.data===true;},
  confirm:async value=>{const r=await db.rpc('icsh_member_id_confirm',{p_application:app.id,p_contact:contactId,p_member_id:value});if(r.error)throw new Error('MEMBER_ID_CONFIRMATION_UNAVAILABLE');},
 });
}
export async function reconcileMemberIds(){if(process.env.ZOHO_BIGIN_MEMBER_IDS_ENABLED!=='true')return{processed:0,assigned:0,retry:0};const db=createEventService(),r=await db.rpc('icsh_member_id_candidates');if(r.error)throw new Error('MEMBER_ID_LIST_UNAVAILABLE');let processed=0,assigned=0,retry=0;for(const row of r.data||[]){processed++;try{const app=await getMembershipApplication(row.application_id,db);if(app&&await ensureWebsiteMemberId(app,row.contact_id))assigned++;}catch{retry++;}}return{processed,assigned,retry};}
export async function memberIdsForOrganiser(contactIds:string[]){const result=new Map<string,string>();if(!contactIds.length)return result;const r=await createEventService().from('icsh_member_ids').select('contact_id,member_id').in('contact_id',contactIds).not('confirmed_at','is',null);if(r.error)throw new Error('MEMBER_ID_UNAVAILABLE');for(const row of r.data||[])result.set(row.contact_id,row.member_id);return result;}
