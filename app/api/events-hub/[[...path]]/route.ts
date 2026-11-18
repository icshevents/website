import type {EntryState} from '@/lib/entry-management/model';
import {readEventSaveRequest} from '@/lib/events-hub/event-save-request';
import {sealEventPassword,openEventPassword} from '@/lib/events-hub/password-vault';
import {taskFileRequest} from '@/lib/events-hub/task-files-server';
import {organiserSession} from '@/lib/supabase/server';
import {hashPassword,passwordLookup} from '@/lib/events-hub/passwords';
import { cookies } from 'next/headers';
import { createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { boundedBody } from '@/lib/payments/server';
import { createEventService } from '@/lib/event-forms/service.js';
import { signedPublicSession,constantEqual } from '@/lib/event-forms/security.js';
import { eventsSignIn,endPortalSession,portalSession,limitPortal,portalToken } from '@/lib/events-hub/session';
import { bookedGuests } from '@/lib/events-hub/booking-counts';
import type { HubEvent } from '@/lib/events-hub/core';
import { hubRpc,allEntries,HubError,type EventDetail } from '@/lib/events-hub/server';
import { saveSchema,taskSchema,planningSchema,entryReviewSchema,entriesCsv,customFormSchema } from '@/lib/events-hub/core';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'};
const json=(v:unknown,status=200)=>Response.json(v,{status,headers});
async function handle(req:Request,ctx:{params:Promise<{path?:string[]}>}){
 try{
  const path=(await ctx.params).path?.join('/')||'dashboard';
  const jar=await cookies(),name=(process.env.NODE_ENV==='production'?'__Host-':'')+'icsh-hub-csrf';
  const secret=process.env.SUPABASE_SECRET_KEY;if(!secret)throw new HubError('Events Hub access is awaiting administrator setup.',503);
  const old=jar.get(name)?.value,csrf=signedPublicSession(createHmac('sha256',secret).update('events-hub-csrf').digest('hex'),old);
  if(old!==csrf.cookie)jar.set(name,csrf.cookie,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:28800});
  if(req.method==='GET'&&path==='session')return json({session:await portalSession('events'),csrf:csrf.csrf});
  if(req.method!=='GET'){
   if(req.headers.get('origin')!==new URL(req.url).origin||old!==csrf.cookie||!constantEqual(req.headers.get('x-csrf-token')||'',csrf.csrf))throw new HubError('Your session changed. Reload the page.',403);
   await limitPortal(req.headers,path==='login'?'events-login':path==='password'?'password':'events-write',path==='login'||path==='password'?10:150);
  }
  if(path==='login'&&req.method==='POST'){
   const b=z.object({password:z.string().min(1).max(128)}).strict().parse(JSON.parse(await boundedBody(req,4000)));
   await eventsSignIn(b.password);return json({ok:true});
  }
  if(path==='access'||path==='access/save'||path==='access/reveal'){
   if((await organiserSession()).status!=='organiser')throw new HubError('Sign in to the Admin Hub.',401);
   const token=await portalToken('membership'),db=createEventService();
   if(req.method==='GET'&&path==='access'){
    const r=await db.rpc('icsh_admin_events_access',{p_token:token});if(r.error)throw new HubError('Events access is temporarily unavailable.',503);return json({entries:r.data});
   }
   if(req.method==='POST'&&path==='access/reveal'){
    if(!req.headers.get('content-type')?.startsWith('application/json'))throw new HubError('Invalid request.',415);
    await limitPortal(req.headers,'events-password-reveal',30);
    const b=z.object({id:z.uuid()}).strict().parse(JSON.parse(await boundedBody(req,1000)));
    const r=await db.rpc('icsh_admin_events_password',{p_token:token,p_id:b.id});
    if(r.error)throw new HubError('Unable to view this password. Sign in to the Admin Hub again.',403);
    if(!r.data)return json({requiresReset:true});
    try{return json({password:openEventPassword(r.data.encrypted,r.data.lookup,secret)});}catch{throw new HubError('Set a replacement password once to make it viewable.',409);}
   }
   if(req.method==='POST'&&path==='access/save'){
    if(!req.headers.get('content-type')?.startsWith('application/json'))throw new HubError('Invalid request.',415);
    const b=z.object({id:z.uuid().nullable(),version:z.number().int().nonnegative(),firstName:z.string().trim().min(1).max(60),password:z.union([z.literal(''),z.string().min(6,'Use at least 6 characters.').max(128,'Use no more than 128 characters.')]),enabled:z.boolean()}).strict().parse(JSON.parse(await boundedBody(req,4000)));
    if(!b.id&&!b.password)throw new HubError('Enter a password for this person.');
    const hash=b.password?await hashPassword(b.password):null,lookup=b.password?passwordLookup(b.password,secret):null;
    const r=await db.rpc('icsh_admin_save_events_access_viewable',{p_token:token,p_id:b.id,p_version:b.version,p_name:b.firstName,p_hash:hash,p_lookup:lookup,p_enabled:b.enabled,p_encrypted:b.password?sealEventPassword(b.password,lookup!,secret):null});
    if(r.error)throw new HubError(r.error.code==='23505'?'That password is already assigned to someone. Choose a different password.':r.error.code==='40001'?'This entry changed elsewhere. Refresh and try again.':'Access could not be saved.',409);
    return json({entry:r.data});
   }
   throw new HubError('Action not found.',404);
  }
  if(!await portalSession('events'))throw new HubError('Your Events Hub session has expired. Please sign in again.',401);
  if(req.method==='POST'&&path==='logout'){await endPortalSession('events');return json({ok:true});}
  if(path.startsWith('task/'))return await taskFileRequest(req,path);
  const url=new URL(req.url);
  if(req.method==='GET'){
   if(path==='forms')return json(await hubRpc('icsh_hub_forms',{p_event:z.uuid().parse(new URL(req.url).searchParams.get('id'))}));
   if(path==='dashboard'){
    const dashboard = await hubRpc('icsh_hub_dashboard') as { events: HubEvent[]; tasks: unknown; team: unknown };
    const bookingCounts = await bookedGuests(createEventService(), dashboard.events).catch(() => {
     console.error('Events Hub booking totals unavailable');
     return {};
    });
    return json({ ...dashboard, bookingCounts });
   }
   const id=z.uuid().parse(url.searchParams.get('id'));
   if(path==='event'){const d=await hubRpc('icsh_hub_event',{p_id:id});return json({...d,capacityState:await hubRpc('icsh_hub_capacity',{p_event:id})});}
   if(path==='overview')return json(await hubRpc('icsh_hub_booking_overview',{p_event:id}));
   const form=z.uuid().nullable().parse(url.searchParams.get('form'));
   if(path==='entry-list'){const entries=await allEntries(id,form);return json({entries,total:entries.length});}
   if(path==='entries')return json(await hubRpc('icsh_hub_entries',{p_event:id,p_form:form,p_page:z.coerce.number().int().min(0).max(10000).parse(url.searchParams.get('page')||0)}));
   if(path==='export'){const states=(await Promise.all(['event','iftari'].map(kind=>hubRpc('icsh_entry_states',{p_kind:kind,p_event:id})))).flat() as EntryState[];const csv=entriesCsv((await allEntries(id,form)).map(e=>{const state=states.find(s=>s.entry_id===e.id&&s.kind===(e.kind==='iftari'?'iftari':'event'));return {...e,entryStatus:state?.status,deletedAt:state?.deleted_at};}));return new Response(csv,{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="icsh-event-entries.csv"'}});}
   if(path==='image'){
    const detail=await hubRpc('icsh_hub_event',{p_id:id}) as EventDetail;const key=detail.event.draft_image;
    if(!key)throw new HubError('Image not found.',404);const r=await createEventService().storage.from('icsh-event-images').download(key);if(r.error||!r.data)throw new HubError('Image unavailable.',404);
    return new Response(r.data,{headers:{...headers,'Content-Type':r.data.type,'Content-Security-Policy':"default-src 'none'"}});
   }
  }
  if(req.method!=='POST')throw new HubError('Action not found.',404);
  if(path==='save-live'){
   let parsed:Awaited<ReturnType<typeof readEventSaveRequest>>;
   try{parsed=await readEventSaveRequest(req);}catch(e){if(e instanceof z.ZodError)throw e;throw new HubError(e instanceof Error?e.message:'Check the event details.');}
   const {input,poster}=parsed,db=createEventService();let key:string|null=null;
   if(poster){key='event-posters/'+randomUUID()+'.'+poster.ext;const uploaded=await db.storage.from('icsh-event-images').upload(key,poster.bytes,{contentType:poster.mime,upsert:false});if(uploaded.error)throw new HubError('Poster could not be uploaded. No event changes were saved.',503);}
   try{return json(await hubRpc('icsh_hub_save_live',{p_id:input.id,p_version:input.version,p_slug:input.slug,p_content:input.content,p_image_key:key,p_visibility:input.visibility}));}catch(e){
    // An ambiguous transport failure may have committed. Never delete an image now referenced by an event.
    if(key){const linked=await db.from('icsh_events').select('id').or('draft_image.eq.'+key+',published_image.eq.'+key).limit(1);if(!linked.error&&linked.data.length===0)await db.storage.from('icsh-event-images').remove([key]);}
    throw e;
   }
  }
  if(path==='upload'){
   const id=z.uuid().parse(url.searchParams.get('id'));const detail=await hubRpc('icsh_hub_event',{p_id:id}) as EventDetail;
   const reader=req.body?.getReader();if(!reader)throw new HubError('Choose an image.');let size=0;const chunks:Uint8Array[]=[];
   for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>5*1024*1024){await reader.cancel();throw new HubError('Choose an image smaller than 5 MB.',413);}chunks.push(part.value);}
   const bytes=Buffer.concat(chunks);const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
   const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;const webp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
   if(!png&&!jpg&&!webp)throw new HubError('Choose a JPG, PNG or WebP image.');
   const ext=png?'png':jpg?'jpg':'webp',mime=png?'image/png':jpg?'image/jpeg':'image/webp';const key=id+'/'+randomUUID()+'.'+ext;
   const db=createEventService();const uploaded=await db.storage.from('icsh-event-images').upload(key,bytes,{contentType:mime,upsert:false});
   if(uploaded.error)throw new HubError('Poster could not be uploaded.',503);
   try{await hubRpc('icsh_hub_image',{p_event:id,p_version:detail.event.version,p_key:key});}catch(e){await db.storage.from('icsh-event-images').remove([key]);throw e;}
   return json({ok:true});
  }
  if(!req.headers.get('content-type')?.startsWith('application/json'))throw new HubError('Invalid request.',415);
  const body=JSON.parse(await boundedBody(req,32000));
  if(path==='form/settings'){
   const stamp=z.iso.datetime({offset:true});
   const settings=z.object({title:z.string().trim().min(1).max(140),venue:z.string().trim().min(1).max(240),capacity:z.number().int().min(1).max(10000).nullable(),startsAt:stamp,endsAt:stamp,bookingOpens:stamp.nullable(),bookingCloses:stamp.nullable(),rates:z.partialRecord(z.enum(['member','nonmember','child','childNonmember','under5','pensioner','student']),z.number().int().min(0).max(1000000)).nullable().optional()}).strict();
   const b=z.object({eventId:z.uuid(),formId:z.uuid(),version:z.number().int().nonnegative(),settings}).strict().parse(body);
   return json(await hubRpc('icsh_hub_form_settings',{p_event:b.eventId,p_form:b.formId,p_version:b.version,p_settings:b.settings}));
  }
  if(path==='form/duplicate'){const b=z.object({sourceEventId:z.uuid(),sourceFormId:z.uuid(),sourceVersion:z.number().int().nonnegative(),targetEventId:z.uuid(),targetVersion:z.number().int().positive(),title:z.string().trim().min(1).max(140)}).strict().parse(body);return json(await hubRpc('icsh_hub_form_duplicate',{p_source_event:b.sourceEventId,p_source_form:b.sourceFormId,p_source_version:b.sourceVersion,p_target_event:b.targetEventId,p_target_version:b.targetVersion,p_title:b.title}));}
  if(path==='form/save')return json(await hubRpc('icsh_hub_form_save',{p_form:customFormSchema.parse(body)}));
  if(path==='form/state'){const b=z.object({eventId:z.uuid(),formId:z.uuid(),version:z.number().int().nonnegative(),status:z.enum(['published','closed'])}).strict().parse(body);return json(await hubRpc('icsh_hub_form_state',{p_event:b.eventId,p_form:b.formId,p_version:b.version,p_status:b.status}));}
  if(path==='visibility'){const b=z.object({id:z.uuid(),version:z.number().int().positive(),visibility:z.enum(['published','hidden','archive'])}).strict().parse(body);return json(await hubRpc('icsh_hub_set_visibility',{p_id:b.id,p_version:b.version,p_visibility:b.visibility}));}
  if(path==='save'){const b=saveSchema.parse(body);return json(await hubRpc('icsh_hub_save',{p_id:b.id,p_version:b.version,p_slug:b.slug,p_content:b.content,p_status:b.status}));}
  if(path==='publish'){const b=z.object({id:z.uuid(),version:z.number().int().positive(),action:z.enum(['publish','unpublish','cancel','complete','archive','restore'])}).strict().parse(body);return json(await hubRpc('icsh_hub_publish',{p_id:b.id,p_version:b.version,p_action:b.action}));}
  if(path==='planning'){const b=planningSchema.parse(body);return json(await hubRpc('icsh_hub_planning',{p_event:b.eventId,p_version:b.version,p_notes:b.notes,p_requirements:b.requirements}));}
  if(path==='task'){const b=taskSchema.parse(body);return json(await hubRpc('icsh_hub_task',{p_event:b.eventId,p_id:b.id,p_version:b.version,p_title:b.title,p_assignee_ids:b.assigneeIds,p_description:b.description,p_note:b.note,p_due:b.dueDate,p_status:b.status}));}
  if(path==='review'){const b=entryReviewSchema.parse(body);return json(await hubRpc('icsh_hub_entry_review',{p_event:b.eventId,p_entry:b.entryId,p_version:b.version,p_status:b.status,p_notes:b.notes}));}
  throw new HubError('Action not found.',404);
 }catch(e){if(e instanceof z.ZodError)return json({error:e.issues[0]?.message||'Check the form.'},400);if(e instanceof HubError)return json({error:e.message},e.status);return json({error:e instanceof Error&&/^(Unable to sign in|Events Hub access|Too many attempts)/.test(e.message)?e.message:'The Events Hub is temporarily unavailable. Please retry.'},503);}
}
export const GET=handle;export const POST=handle;
