import { createHash } from 'node:crypto';
// Deliberately small public projection: no applicants, notes, access keys or admin settings.
const origin='https://website-nine-beta-11.vercel.app';
export function eventDirectory(state){
 const grouped=new Map();
 function participation(c,form){const key=[c.eventName,c.startsAt.slice(0,10),c.venue].join('|');let event=grouped.get(key);if(!event){event={id:'festival-'+createHash('sha256').update(key).digest('hex').slice(0,16),title:c.eventName,startsAt:c.startsAt,endsAt:c.endsAt,venue:c.venue,description:'A community fundraising event supporting UK charities and ICSH community projects.',forms:[]};grouped.set(key,event);}event.forms.push(form);}
 const c=state.festivalConfig;if(c&&c.status==='published')participation(c,{label:'Cook, donate or volunteer',url:origin+'/harrow-food-festival-2026/get-involved',kind:'participation'});
 for(const c of state.stallForms||[])if(c.status==='published')participation(c,{label:'Apply for a stall',url:origin+'/stall-hire/'+encodeURIComponent(c.slug),kind:'stall',feeFromPence:Math.min(...c.packages.map(p=>p.fee))});
 const events=[...grouped.values()];
 for(const e of state.events||[])if(e.status==='published'&&!e.prototype)events.push({id:'ticket-'+e.id,title:e.title,startsAt:e.startsAt,endsAt:e.endsAt,venue:e.venue,description:e.description,forms:[{label:'Register for this event',url:origin+'/event-tickets/'+encodeURIComponent(e.slug),kind:'tickets',feeFromPence:Math.min(...Object.values(e.rates))}]});
 return {mode:'live',events:events.sort((a,b)=>a.startsAt.localeCompare(b.startsAt))};
}
