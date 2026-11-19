import {formatUKLongDate} from './uk-date-time.ts';
import {createEventService} from './event-forms/service.js';
import {activeParticipationEvents} from './participation-links.ts';
import {bookingState,safeBookingUrl} from './events-hub/core.ts';
import type {PublicEvent} from './events-hub/server';

type PublishedForm={kind:string;configuration:unknown;created_at?:string};
export type HomeEventForm={eventId:string;href:string;title:string;label:string;summary:string;date:string;dateLabel:string;venue:string;kind:'participation'|'stall'|'tickets'};
export type HomeUpcomingEvent={
 id:string;title:string;summary:string;date:string;dateLabel:string;venue:string;image?:string;bookingNotYetOpen?:boolean;
 links:{href:string;label:string}[];
};
const dateLabel={format:formatUKLongDate};
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
    links.set(href,{eventId:event.id,href,title:event.title,label:form.label,kind:form.kind,date:event.startsAt,dateLabel:dateLabel.format(new Date(event.startsAt)),venue:event.venue,
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

export function upcomingPublicEvents(events:PublicEvent[],now=Date.now()):PublicEvent[]{
 return events.filter(({status,content})=>status==='published'&&Date.parse(content.endsAt)>now&&Number.isFinite(Date.parse(content.startsAt)))
  .sort((a,b)=>Date.parse(a.content.startsAt)-Date.parse(b.content.startsAt));
}

export function selectHomeUpcomingEvents(events:PublicEvent[],now=Date.now()):HomeUpcomingEvent[]{
 return upcomingPublicEvents(events,now).map(event=>{
  const {content,slug,sourceType,bookingSlug}=event;
  const links=new Map<string,string>();
  const state=bookingState(content,0,now);
  const open=state==='Open';
  const bookingNotYetOpen=!event.bookingLimitReached&&content.bookingType!=='information'
   && now<Date.parse(content.startsAt)&&(!content.bookingCloses||now<Date.parse(content.bookingCloses))
   && (content.bookingOpens ? now<Date.parse(content.bookingOpens) : !content.bookingEnabled);
  const href=content.bookingType==='external'&&safeBookingUrl(content.externalUrl)?content.externalUrl
    :sourceType==='iftari'?'/ramadan-iftari-2027'
    :sourceType==='tickets'&&bookingSlug?'/event-tickets/'+bookingSlug:'';
  if(open&&href)links.set(href,'Book your places');
  for(const form of event.forms??[]){
   if(form.url.startsWith('/event-tickets/')&&(!open||form.url===href))continue;
   const label=form.url.startsWith('/stall-hire/')?'Apply for a stall'
    :form.url==='/harrow-food-festival-2026/get-involved'?'Cook, donate or volunteer':form.title;
   links.set(form.url,label);
  }
  links.set('/events/'+slug,'View event details');
  return {id:event.id,title:content.title,summary:summary(content.description),date:content.startsAt,
   dateLabel:dateLabel.format(new Date(content.startsAt)),venue:content.venue,image:content.image,bookingNotYetOpen,
   links:[...links].map(([href,label])=>({href,label}))};
 });
}

export function groupHomeEventForms(forms:HomeEventForm[]):HomeUpcomingEvent[]{
 const events=new Map<string,HomeUpcomingEvent>();
 for(const {eventId,href,label,title,date,dateLabel,venue,summary} of forms){
  const existing=events.get(eventId);
  if(existing)existing.links.push({href,label});
  else events.set(eventId,{id:eventId,title,date,dateLabel,venue,summary,links:[{href,label}]});
 }
 return [...events.values()];
}
