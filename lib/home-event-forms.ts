import {createEventService} from './event-forms/service.js';
import {activeParticipationEvents} from './participation-links.ts';

type PublishedForm={kind:string;configuration:unknown;created_at?:string};
export type HomeEventForm={href:string;title:string;label:string;summary:string;date:string;dateLabel:string;venue:string;kind:'participation'|'stall'|'tickets'};
const created=(form:PublishedForm)=>Date.parse(form.created_at??'')||0;
const summary=(text:string)=>text.length<=180?text:text.slice(0,177).replace(/\s+\S*$/,'')+'…';

/** Project only open public forms, ordered by when each form was added. */
export function selectHomeEventForms(records:PublishedForm[],now=Date.now()):HomeEventForm[]{
 const links=new Map<string,HomeEventForm>();
 for(const record of [...records].sort((a,b)=>created(b)-created(a))){
  if(!['participation','stall','event'].includes(record.kind))continue;
  try{
   for(const event of activeParticipationEvents([record],now))for(const form of event.forms){
    const href=new URL(form.url).pathname;
    if(links.has(href))continue;
    links.set(href,{href,title:event.title,label:form.label,kind:form.kind,date:event.startsAt,dateLabel:new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/London'}).format(new Date(event.startsAt)),venue:event.venue,
     summary:form.kind==='participation'?'Prepare food, volunteer your time or contribute to our community food festival.':form.kind==='stall'?'Bring your food or business to the festival. Apply for a stall, subject to organiser approval.':summary(event.description)});
   }
  }catch{ /* A malformed form must not hide the other valid public forms. */ }
 }
 return [...links.values()];
}

export async function getHomeEventForms():Promise<{available:boolean;forms:HomeEventForm[]}>{
 try{
  const result=await createEventService().from('icsh_forms').select('kind,configuration,created_at').eq('status','published').order('created_at',{ascending:false});
  if(result.error)throw result.error;
  return {available:true,forms:selectHomeEventForms(result.data)};
 }catch{return {available:false,forms:[]};}
}
