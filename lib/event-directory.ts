import {createEventService} from './event-forms/service.js';
import {eventDirectory} from './event-forms/directory.js';
export const eventWorkspace='https://website-nine-beta-11.vercel.app';
export type EventForm={label:string;url:string;kind:'participation'|'stall'|'tickets';feeFromPence?:number};
export type DirectoryEvent={id:string;title:string;startsAt:string;endsAt:string;venue:string;description:string;forms:EventForm[]};
export type Directory={available:boolean;mode:'test';events:DirectoryEvent[]};
const object=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=6000):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
const timestamp=(v:unknown):v is string=>text(v,40)&&Number.isFinite(Date.parse(v));
export function parseEventDirectory(payload:unknown):DirectoryEvent[]{
 if(!object(payload)||payload.mode!=='test'||!Array.isArray(payload.events)||payload.events.length>100)throw new Error('Invalid event directory.');
 return payload.events.map((entry):DirectoryEvent=>{
  if(!object(entry)||!text(entry.id,1000)||!text(entry.title,220)||!text(entry.venue,240)||!text(entry.description)||!timestamp(entry.startsAt)||!timestamp(entry.endsAt)||Date.parse(entry.endsAt)<Date.parse(entry.startsAt)||!Array.isArray(entry.forms)||entry.forms.length<1||entry.forms.length>24)throw new Error('Invalid public event.');
  const forms=entry.forms.map((form):EventForm=>{
   if(!object(form)||!text(form.label,160)||!text(form.url,1200)||!['participation','stall','tickets'].includes(String(form.kind)))throw new Error('Invalid event form.');
   const url=new URL(form.url);if(url.origin!==eventWorkspace||url.username||url.password||url.search||url.hash||!/^\/(?:event-tickets\/[a-z0-9-]+|harrow-food-festival-2026\/get-involved|stall-hire\/[a-z0-9-]+)$/.test(url.pathname))throw new Error('Invalid registration destination.');
   if(form.kind==='participation'&&url.pathname!=='/harrow-food-festival-2026/get-involved'||form.kind==='stall'&&!url.pathname.startsWith('/stall-hire/')||form.kind==='tickets'&&(!/^\/event-tickets\/[a-z0-9-]+$/.test(url.pathname)||['/admin','/privacy','/api','/checkout'].includes(url.pathname)))throw new Error('Invalid form route.');
   const amount=form.feeFromPence;if(amount!==undefined&&(typeof amount!=='number'||!Number.isSafeInteger(amount)||amount<0||amount>10000000))throw new Error('Invalid event price.');
   return {label:form.label,url:url.href,kind:form.kind as EventForm['kind'],...(amount===undefined?{}:{feeFromPence:amount as number})};
  });
  return {id:entry.id,title:entry.title,startsAt:entry.startsAt,endsAt:entry.endsAt,venue:entry.venue,description:entry.description,forms};
 });
}
export async function getEventDirectory():Promise<Directory>{
 try{
  const db=createEventService();
  const result=await db.from('icsh_forms').select('kind,configuration').eq('status','published');
  if(result.error)throw new Error('Directory unavailable');
  const state={festivalConfig:null as unknown,stallForms:[] as unknown[],events:[] as unknown[]};
  for(const form of result.data){if(form.kind==='participation')state.festivalConfig=form.configuration;else if(form.kind==='stall')state.stallForms.push(form.configuration);else state.events.push(form.configuration);}
  return {available:true,mode:'test',events:parseEventDirectory(eventDirectory(state))};
 }catch{return {available:false,mode:'test',events:[]};}
}
export function londonDate(value:string){return new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeZone:'Europe/London'}).format(new Date(value));}
export function londonTime(value:string){return new Intl.DateTimeFormat('en-GB',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'Europe/London'}).format(new Date(value));}
