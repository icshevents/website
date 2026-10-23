import {createEventService} from './event-forms/service.js';
import {eventDirectory} from './event-forms/directory.js';
import {parseEventDirectory,type DirectoryEvent} from './event-directory.ts';

type PublishedForm={kind:string;configuration:unknown};
/** Only public registration forms whose own signup cutoff has not passed. */
export function activeParticipationEvents(records:PublishedForm[],now=Date.now()):DirectoryEvent[]{
 const state={festivalConfig:null as unknown,stallForms:[] as unknown[],events:[] as unknown[]};
 for(const record of records){
  const raw=record.configuration;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))continue;
  const config=raw as Record<string,unknown>;
  if(config.status!=='published')continue;
  const cutoff=record.kind==='stall'&&config.deadline?config.deadline:config.startsAt;
  if(typeof cutoff!=='string'||!Number.isFinite(Date.parse(cutoff))||Date.parse(cutoff)<=now)continue;
  if(record.kind==='participation')state.festivalConfig=config;
  else if(record.kind==='stall')state.stallForms.push(config);
  else state.events.push(config);
 }
 return parseEventDirectory(eventDirectory(state));
}
export async function participationEvents():Promise<{available:boolean;events:DirectoryEvent[]}>{
 try{
  const result=await createEventService().from('icsh_forms').select('kind,configuration').eq('status','published');
  if(result.error)throw result.error;
  return {available:true,events:activeParticipationEvents(result.data)};
 }catch{return {available:false,events:[]};}
}
