import { z } from 'zod';
import {iftariMenuSchema} from './iftari-menu.ts';
export const publicationStatuses = ['draft','ready_for_review','published','cancelled','completed'] as const;
const timestamp = z.iso.datetime({offset:true});
const price = z.number().int().min(0).max(1000000).refine(v=>v===0||v>=30,'Paid tickets must cost at least £0.30.');
export const eventContentSchema = z.object({
 title:z.string().trim().min(1).max(140), description:z.string().trim().min(1).max(6000),
 startsAt:timestamp, endsAt:timestamp, venue:z.string().trim().min(1).max(240), address:z.string().trim().max(500),
 image:z.string().max(1000).refine(v=>v===''||/^\/(?:assets\/[\w/.-]+|api\/events-image\/[a-f0-9-]{36})$/.test(v),'Upload an image or use an existing ICSH image.'),
 childTickets:z.boolean(),
 bookingType:z.enum(['information','free','paid','external']), externalUrl:z.string().max(1200).refine(v=>!v||safeBookingUrl(v),'Enter a secure HTTPS booking link.'),
 capacity:z.number().int().min(1).max(10000).nullable(), bookingOpens:timestamp.nullable(), bookingCloses:timestamp.nullable(), bookingEnabled:z.boolean(),
 prices:z.object({member:price,nonmember:price,child:price,childNonmember:price,under5:price}).strict(),
 menu:iftariMenuSchema.optional(),
 instructions:z.string().trim().max(3000),
}).strict().superRefine((v,ctx)=>{
 if(Date.parse(v.endsAt)<=Date.parse(v.startsAt))ctx.addIssue({code:'custom',message:'Finish time must be after start time.'});
 if(v.bookingOpens&&v.bookingCloses&&v.bookingOpens>=v.bookingCloses)ctx.addIssue({code:'custom',message:'Booking closing must be after opening.'});
 if(v.bookingCloses&&Date.parse(v.bookingCloses)>Date.parse(v.startsAt))ctx.addIssue({code:'custom',message:'Bookings must close by the event start.'});
 if(['free','paid'].includes(v.bookingType)&&v.bookingEnabled&&v.capacity===null)ctx.addIssue({code:'custom',message:'Enter a capacity for online bookings.'});
 if(v.bookingType==='external'&&!v.externalUrl)ctx.addIssue({code:'custom',message:'Enter the external booking link.'});
 if(v.bookingType==='free'&&Object.values(v.prices).some(n=>n!==0))ctx.addIssue({code:'custom',message:'All ticket prices must be zero for a free event.'});
 if(v.bookingType==='paid'&&v.prices.member===0&&v.prices.nonmember===0)ctx.addIssue({code:'custom',message:'Enter an adult ticket price.'});
});
export type EventContent=z.infer<typeof eventContentSchema>;
export type HubEvent={id:string;slug:string;source_type:'tickets'|'festival'|'iftari'|'none'|'archive';source_key:string|null;form_ids:string[];draft:EventContent;published:EventContent|null;status:typeof publicationStatuses[number];visible:boolean;archived:boolean;draft_image?:string|null;published_image?:string|null;published_status?:string;version:number;updated_at:string};
export type Task={id:string;event_id:string;title:string;assignee:string;assignee_ids?:string[];description?:string;updates?:{name:string;at:string;note:string}[];due_date:string|null;status:'not_started'|'in_progress'|'completed';version:number};
export type Entry={entryStatus?:string|null;deletedAt?:string|null;id:string;formId:string;formTitle:string;kind:string;reference:string;submittedAt:string;status:string;reviewStatus:string;notes:string;version:number;details:Record<string,unknown>};
export const saveSchema=z.object({id:z.uuid().nullable(),version:z.number().int().nonnegative(),slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80).refine(v=>!['admin','api','new','preview'].includes(v)),content:eventContentSchema,status:z.enum(['draft','ready_for_review']),}).strict();
export const taskSchema=z.object({eventId:z.uuid(),id:z.uuid().nullable(),version:z.number().int().nonnegative(),title:z.string().trim().min(1).max(240),assigneeIds:z.array(z.uuid()).max(30),description:z.string().max(10000),note:z.string().max(4000),dueDate:z.iso.date().nullable(),status:z.enum(['not_started','in_progress','completed'])}).strict();
export const planningSchema=z.object({eventId:z.uuid(),version:z.number().int().nonnegative(),notes:z.string().max(10000),requirements:z.string().max(10000)}).strict();
export const entryReviewSchema=z.object({eventId:z.uuid(),entryId:z.uuid(),version:z.number().int().nonnegative(),status:z.enum(['new','reviewed','archived']),notes:z.string().max(5000)}).strict();
export function safeBookingUrl(value:string){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}
export function bookingState(c:EventContent,occupied=0,now=Date.now()){
 if(c.bookingType==='information')return 'Information only';
 if(!c.bookingEnabled||now>=Date.parse(c.startsAt)||(c.bookingCloses&&now>=Date.parse(c.bookingCloses)))return 'Closed';
 if(c.bookingOpens&&now<Date.parse(c.bookingOpens))return 'Not yet open';
 if(c.capacity!==null&&occupied>=c.capacity)return 'Sold Out';
 return 'Open';
}
export function csvCell(value:unknown){const s=typeof value==='object'?JSON.stringify(value):String(value??'');return '"'+(/^[\s]*[=+@-]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';}
export function entriesCsv(entries:Entry[]){return '\uFEFF'+[['Reference','Form','Submitted','Booking status','Review status','Details','Internal notes','Entry status'],...entries.filter(e=>!e.deletedAt).map(e=>[e.reference,e.formTitle,e.submittedAt,e.status,e.reviewStatus,e.details,e.notes,e.entryStatus||'Original'])].map(row=>row.map(csvCell).join(',')).join('\r\n');}
export function londonInput(iso:string){const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso));const get=(k:string)=>p.find(x=>x.type===k)?.value;return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;}
// Reject missing spring times and ambiguous autumn times instead of silently moving an event.
export function londonISO(value:string){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw Error('Enter a valid UK date and time.');const utc=Date.parse(value+'Z');const candidates=[utc,utc-3600000].filter(n=>Number.isFinite(n)&&londonInput(new Date(n).toISOString())===value);if(candidates.length!==1)throw Error('This UK time changes with daylight saving. Choose a time outside the clock change.');return new Date(candidates[0]).toISOString();}
export function emptyContent():EventContent {const date=new Date();date.setUTCDate(date.getUTCDate()+7);date.setUTCHours(13,0,0,0);return {title:'',description:'',startsAt:date.toISOString(),endsAt:new Date(date.getTime()+3*3600000).toISOString(),venue:'',address:'',image:'',childTickets:false,bookingType:'information',externalUrl:'',capacity:null,bookingOpens:null,bookingCloses:null,bookingEnabled:false,prices:{member:0,nonmember:0,child:0,childNonmember:0,under5:0},instructions:''};}
export type TeamMember={id:string;first_name:string;enabled:boolean};
export type TaskUpdate={name:string;at:string;note:string};
export function ukDay(value:string){return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/London'}).format(new Date(value.length===10?value+'T12:00:00Z':value));}
export function taskDeadline(task:Task,now=Date.now()){if(task.status==='completed'||!task.due_date)return '';const today=new Date(now).toLocaleDateString('en-CA',{timeZone:'Europe/London'});if(task.due_date<today)return 'Overdue';return Date.parse(task.due_date+'T23:59:59Z')-now<=7*86400000?'Due soon':'';}
export function planningSummary(title:string,tasks:Task[],team:TeamMember[],now=Date.now()){
 if(!tasks.length)return {paragraph:`No planning tasks have been recorded for ${title} yet. Add the tasks and assign responsibilities to start tracking progress.`,completed:0,total:0,percentage:0};
 const completed=tasks.filter(t=>t.status==='completed'),ongoing=tasks.filter(t=>t.status==='in_progress'),waiting=tasks.filter(t=>t.status==='not_started');
 const clip=(s:string,n=110)=>s.length>n?s.slice(0,n).replace(/\s+\S*$/,'')+'…':s;
 const owner=(task:Task)=>{const names=(task.assignee_ids||[]).map(id=>team.find(p=>p.id===id)?.first_name).filter(Boolean);return names.length?names.join(' and '):task.assignee||'';};
 const clean=(s:string,n:number)=>clip(s.trim(),n).replace(/[.!?]+$/,'');
 const describe=(task:Task,ongoing:boolean)=>{const who=owner(task),parts=[who?`${who} ${task.assignee_ids&&task.assignee_ids.length>1?'are':'is'} ${ongoing?'working on':'responsible for the outstanding task'} “${task.title}”${task.due_date?`, with a target date of ${ukDay(task.due_date)}`:''}.`:`“${task.title}” is ${ongoing?'in progress':'not yet started'} and has not been assigned${task.due_date?`; its target date is ${ukDay(task.due_date)}`:''}.`];if(task.description)parts.push(`The recorded requirements are: ${clean(task.description,110)}.`);const latest=task.updates?.at(-1);if(latest)parts.push(`The latest update from ${latest.name} states: “${clean(latest.note,90)}”.`);const deadline=taskDeadline(task,now);if(deadline)parts.push(deadline==='Overdue'?'This task is overdue.':'This task is due soon.');return parts.join(' ');};
 const sentences=[`${tasks.length} planning ${tasks.length===1?'task is':'tasks are'} recorded for ${title}.`];
 if(completed.length){sentences.push(...completed.slice(0,2).map(t=>`“${t.title}”${owner(t)?`, assigned to ${owner(t)},`:''} is completed.`));if(completed.length>2)sentences.push(`${completed.length-2} further tasks are completed.`);}else sentences.push('No tasks have been marked completed yet.');
 sentences.push(...ongoing.slice(0,3).map(t=>describe(t,true)),...waiting.slice(0,3).map(t=>describe(t,false)));
 if(ongoing.length>3)sentences.push(`${ongoing.length-3} further tasks are in progress; their assignments and dates are in the task list.`);
 if(waiting.length>3)sentences.push(`${waiting.length-3} further tasks have not yet started; their assignments and dates are in the task list.`);
 return {paragraph:sentences.join(' '),completed:completed.length,total:tasks.length,percentage:Math.round(completed.length/tasks.length*100)};
}
export const customFieldSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]+$/).max(64),label:z.string().trim().min(1).max(160),type:z.enum(['text','name','email','mobile','select','checkbox','radio','textarea']),required:z.boolean(),options:z.array(z.string().trim().min(1).max(120)).max(30)}).strict().superRefine((f,ctx)=>{if(['select','radio'].includes(f.type)&&f.options.length===0)ctx.addIssue({code:'custom',message:'Add at least one choice.'});});
export const customFormSchema=z.object({id:z.uuid().nullable(),eventId:z.uuid(),version:z.number().int().nonnegative(),title:z.string().trim().min(1).max(180),description:z.string().trim().max(4000),slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(1).max(100),status:z.enum(['draft','published','closed']),fields:z.array(customFieldSchema).min(1).max(30)}).strict().superRefine((f,ctx)=>{if(new Set(f.fields.map(x=>x.id)).size!==f.fields.length)ctx.addIssue({code:'custom',message:'Question identifiers must be unique.'});});
export type CustomField=z.infer<typeof customFieldSchema>;
export type CustomForm={id:string|null;eventId:string;version:number;title:string;description:string;slug:string;status:'draft'|'published'|'closed';fields:CustomField[]};
/** Explicit UK task date entry, independent of the browser's regional date control. */
export function parseUKDay(value:string){const text=value.trim();if(!text)return null;const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);if(!m)throw Error('Enter the target date as DD/MM/YYYY.');const iso=m[3]+'-'+m[2]+'-'+m[1],date=new Date(iso+'T12:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==iso)throw Error('Enter a valid target date as DD/MM/YYYY.');return iso;}
