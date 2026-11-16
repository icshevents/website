import {cookies} from 'next/headers';
import {createHmac,createHash} from 'node:crypto';
import {z} from 'zod';
import {parsePhoneNumberFromString} from 'libphonenumber-js/max';
import {createEventService} from '@/lib/event-forms/service.js';
import {signedPublicSession,constantEqual} from '@/lib/event-forms/security.js';
import {boundedBody} from '@/lib/payments/server';
import {limitPortal} from '@/lib/events-hub/session';
import {publicCustomForm} from '@/lib/events-hub/custom-forms-server';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers});
async function handle(req:Request,{params}:{params:Promise<{slug:string}>}){try{
 const {slug}=await params;const secret=process.env.SUPABASE_SECRET_KEY;if(!secret)return json({error:'Event forms are temporarily unavailable.'},503);
 const jar=await cookies(),name=(process.env.NODE_ENV==='production'?'__Host-':'')+'icsh-event-custom';const old=jar.get(name)?.value,session=signedPublicSession(createHmac('sha256',secret).update('custom-event-form').digest('hex'),old);
 if(old!==session.cookie)jar.set(name,session.cookie,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:28800});
 if(req.method==='POST'&&(req.headers.get('origin')!==new URL(req.url).origin||old!==session.cookie||!constantEqual(req.headers.get('x-csrf-token')||'',session.csrf)||!req.headers.get('content-type')?.startsWith('application/json')))return json({error:'Your session changed. Reload the form.'},403);
 await limitPortal(req.headers,'custom-form-'+(req.method==='POST'?'submit':'read'),req.method==='POST'?20:150);
 const form=await publicCustomForm(slug);if(!form)return json({error:'This event form is not published.'},404);
 if(req.method==='GET')return json({form,csrf:session.csrf});
 if(!form.open)return json({error:'This form is currently closed.'},409);
 const body=z.object({id:z.uuid(),version:z.number().int().positive(),answers:z.record(z.string(),z.union([z.string().max(4000),z.boolean()])),website:z.literal('')}).strict().parse(JSON.parse(await boundedBody(req,64000)));
 const answers:Record<string,string|boolean>={};for(const key of Object.keys(body.answers))if(!form.fields.some(f=>f.id===key))return json({error:'The form changed. Reload before submitting.'},409);
 for(const field of form.fields){const value=body.answers[field.id]??(field.type==='checkbox'?false:'');if(field.required&&(field.type==='checkbox'?value!==true:typeof value!=='string'||!value.trim()))return json({error:'Please answer: '+field.label},400);if(field.type==='checkbox'){if(typeof value!=='boolean')return json({error:'Check: '+field.label},400);}else{
  if(typeof value!=='string')return json({error:'Check: '+field.label},400);
  if(['select','radio'].includes(field.type)&&value&&!field.options.includes(value))return json({error:'Choose a listed answer for '+field.label},400);
  if(field.type==='email'&&value&&!z.email().safeParse(value).success)return json({error:'Enter a valid email address.'},400);
  if(field.type==='mobile'&&value&&!parsePhoneNumberFromString(value,{defaultCountry:'GB',extract:false})?.isPossible())return json({error:'Enter a valid mobile number.'},400);
 }answers[field.id]=value;}
 const hash=createHash('sha256').update(JSON.stringify({slug,version:body.version,answers})).digest('hex');const r=await createEventService().rpc('icsh_custom_form_submit',{p_slug:slug,p_id:body.id,p_version:body.version,p_answers:answers,p_hash:hash});
 if(r.error)return json({error:r.error.code==='22023'?'Please complete all required answers.':'The form changed or is closed. Reload before submitting.'},409);return json({reference:r.data.reference},201);
}catch(e){if(e instanceof z.ZodError||e instanceof SyntaxError)return json({error:'Please check your answers.'},400);return json({error:e instanceof Error&&e.message.startsWith('Too many')?'Too many attempts. Please wait ten minutes.':'Event forms are temporarily unavailable. Please retry.'},503);}}
export const GET=handle;export const POST=handle;
