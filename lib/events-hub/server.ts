import 'server-only';
import { createEventService } from '../event-forms/service.js';
import { portalToken } from './session';
import type { EventContent,HubEvent,Entry,Task } from './core';
export class HubError extends Error {constructor(message:string,public status=400){super(message);}}
export async function hubRpc(name:string,args:Record<string,unknown>={}){
 const token=await portalToken('events');if(!token)throw new HubError('Sign in to the Events Hub.',401);
 const r=await createEventService().rpc(name,{p_token:token,...args});
 if(r.error){const code=r.error.code;throw new HubError(code==='42501'?'Your Events Hub session has expired. Please sign in again.':['40001','23505'].includes(code)?'This record or link changed elsewhere. Reload before saving.':['P0001','22023'].includes(code)?r.error.message:'The Events Hub is temporarily unavailable or awaiting setup.',code==='42501'?401:['40001','23505','P0001'].includes(code)?409:503);}return r.data;
}
export type EventDetail={event:HubEvent;planning:{notes:string;requirements:string;version:number};tasks:Task[];forms:{id:string;title:string;kind:string}[];history:{action:string;actor:string;occurred_at:string;changes:unknown}[]};
export type PublicEvent={id:string;slug:string;content:EventContent;status:string;sourceType:string;sourceKey:string|null;forms?:{title:string;url:string}[]};
export async function publicEvents(slug?:string):Promise<PublicEvent[]|null>{
 if(process.env.ICSH_EVENTS_HUB_ENABLED!=='true')return null;
 try{const r=await createEventService().rpc('icsh_events_public',{p_slug:slug||null});if(r.error)throw Error('Event catalogue unavailable');return r.data as PublicEvent[];}catch{throw new HubError('Events are temporarily unavailable. Please try again shortly.',503);}
}
export async function allEntries(eventId:string,formId:string|null){const out:Entry[]=[];for(let page=0;;page++){const r=await hubRpc('icsh_hub_entries',{p_event:eventId,p_page:page,p_form:formId}) as {entries:Entry[];total:number};out.push(...r.entries);if(out.length>=r.total||r.entries.length<100)break;if(out.length>20000)throw new HubError('Please export one form at a time.',413);}return out;}

/** Public, already-published content only. Drafts, forms and private planning never enter this projection. */
export async function publicPastEvents():Promise<PublicEvent[]|null>{
 if(process.env.ICSH_EVENTS_HUB_ENABLED!=='true')return null;
 const r=await createEventService().from('icsh_events').select('id,slug,published,source_type,source_key').or('published_status.eq.completed,archived.eq.true').not('published','is',null);
 if(r.error)throw new HubError('Past events are temporarily unavailable.',503);
 return r.data.map(e=>({id:e.id,slug:e.slug,content:e.published as EventContent,status:'completed',sourceType:e.source_type,sourceKey:e.source_key})).sort((a,b)=>Date.parse(b.content.startsAt)-Date.parse(a.content.startsAt));
}
