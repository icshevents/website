import 'server-only';
import { randomBytes, createHash, createHmac } from 'node:crypto';
import { cookies } from 'next/headers';
import {passwordLookup,verifyPassword,dummyPasswordHash} from './passwords';
import { createEventService } from '../event-forms/service.js';

export type Portal='membership'|'events';
export const portalCookie=(portal:Portal)=>(process.env.NODE_ENV==='production'?'__Host-':'')+'icsh-'+portal+'-portal';
export const hashToken=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function portalToken(portal:Portal){const value=(await cookies()).get(portalCookie(portal))?.value;return value&&/^[a-f0-9]{64}$/.test(value)?value:'';}
export async function portalSession(portal:Portal){
 const token=await portalToken(portal);if(!token)return null;
 try{const r=await createEventService().rpc('icsh_portal_check',{p_token:token,p_portal:portal});return r.error?null:r.data as {user_id:string|null;credential_id:string|null;display_name:string;expires_at:string}|null;}catch{return null;}
}
export async function startPortalSession(userId:string,portal:Portal,displayName='',authSessionId:string|null=null){
 const token=randomBytes(32).toString('hex');
 const r=await createEventService().rpc('icsh_portal_start',{p_user:userId,p_portal:portal,p_hash:hashToken(token),p_display_name:displayName,p_auth_session:authSessionId});
 if(r.error)throw Error('Portal access could not be confirmed.');
 const jar=await cookies();jar.set(portalCookie(portal),token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:8*3600});
}
export async function endPortalSession(portal:Portal){const token=await portalToken(portal);if(token){const r=await createEventService().rpc('icsh_portal_end',{p_token:token,p_portal:portal});if(r.error)throw Error('Unable to sign out. Please retry.');}(await cookies()).delete(portalCookie(portal));}
export async function limitPortal(requestHeaders:Headers,scope:string,max=10){
 const secret=process.env.SUPABASE_SECRET_KEY;if(!secret)throw Error('Portal sign-in is unavailable.');
 const address=(requestHeaders.get('x-vercel-forwarded-for')||requestHeaders.get('x-forwarded-for')||'unknown').split(',')[0].trim();
 const key=createHmac('sha256',secret).update('portal:'+scope+':'+address).digest('hex');
 const r=await createEventService().rpc('icsh_event_rate_limit',{p_key:key,p_max:max});if(r.error||r.data!==true)throw Error('Too many attempts or sign-in unavailable. Please wait ten minutes.');
}
export async function eventsSignIn(password:string){
 const secret=process.env.SUPABASE_SECRET_KEY;if(!secret)throw Error('Events Hub access is awaiting administrator setup.');
 const db=createEventService();const result=await db.from('icsh_events_credentials').select('id,password_hash,version').eq('lookup_key',passwordLookup(password,secret)).eq('enabled',true).maybeSingle();
 if(result.error)throw Error('Events Hub access is awaiting administrator setup.');
 const valid=await verifyPassword(password,result.data?.password_hash||dummyPasswordHash);
 if(!valid||!result.data)throw Error('Unable to sign in. Check the password and try again.');
 const token=randomBytes(32).toString('hex');
 const started=await db.rpc('icsh_events_session_start',{p_credential:result.data.id,p_version:result.data.version,p_hash:hashToken(token)});
 if(started.error)throw Error('Unable to sign in. Check the password and try again.');
 (await cookies()).set(portalCookie('events'),token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:8*3600});
}
