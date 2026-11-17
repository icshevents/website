'use server';
import {z} from 'zod';
import {organiserSession} from '@/lib/supabase/server';
import {portalSession,portalToken,limitPortal} from '@/lib/events-hub/session';
import {createEventService} from '@/lib/event-forms/service.js';
import {headers} from 'next/headers';
import type {EntryState} from './model';
const scope=z.object({kind:z.enum(['membership','donation','rishta','event','iftari']),eventId:z.uuid().optional()}).strict();
async function context(value:unknown){
 const input=scope.parse(value),portal=input.kind==='event'||input.kind==='iftari'?'events':'membership';
 if(portal==='membership'?(await organiserSession()).status!=='organiser':!await portalSession('events'))throw Error('Sign in to the correct hub again.');
 return{input,token:await portalToken(portal)};
}
export async function getEntryStates(value:unknown){
 try{const{input,token}=await context(value);const r=await createEventService().rpc('icsh_entry_states',{p_token:token,p_kind:input.kind,p_event:input.eventId||null});if(r.error)throw Error('Entry controls are temporarily unavailable. Refresh and try again.');return {ok:true as const,states:r.data as EntryState[]};}catch(e){return{ok:false as const,error:e instanceof Error?e.message:'Unable to load entry controls.'};}
}
export async function manageEntry(value:unknown){
 try{const b=z.object({kind:scope.shape.kind,eventId:z.uuid().optional(),id:z.uuid(),version:z.number().int().nonnegative(),action:z.enum(['cancelled','refunded','reset','delete','restore'])}).strict().parse(value);
 const{input,token}=await context({kind:b.kind,...(b.eventId?{eventId:b.eventId}:{})});await limitPortal(await headers(),'entry-management',120);
 const r=await createEventService().rpc('icsh_entry_manage',{p_token:token,p_kind:input.kind,p_event:input.eventId||null,p_id:b.id,p_version:b.version,p_action:b.action});
 if(r.error)throw Error(r.error.code==='40001'?'This entry changed elsewhere. Refresh before trying again.':r.error.code==='42501'?'This entry is unavailable in this hub.':'Changes could not be saved. Refresh and try again.');
 return{ok:true as const,state:r.data as EntryState};
 }catch(e){return{ok:false as const,error:e instanceof Error?e.message:'Changes could not be saved.'};}
}
