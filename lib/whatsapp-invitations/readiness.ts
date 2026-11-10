import {timingSafeEqual} from 'node:crypto';

/** Temporary, authenticated, read-only setup check. It cannot send or update records. */
export async function handleInvitationReadiness(request:Request,env:Record<string,string|undefined>,inspect:()=>Promise<unknown>,now=Date.now()){
 const headers={'Cache-Control':'private, no-store, max-age=0','X-Robots-Tag':'noindex, nofollow'};
 const reply=(body:unknown,status:number)=>Response.json(body,{status,headers});
 const token=env.ICSH_WHATSAPP_READINESS_TOKEN||'',expires=Date.parse(env.ICSH_WHATSAPP_READINESS_UNTIL||'');
 const given=request.headers.get('authorization')||'',expected='Bearer '+token;
 if(env.ZOHO_BIGIN_WHATSAPP_RELEASE_MODE!=='owner-test'||!/^[a-f0-9]{64}$/.test(token)||!Number.isFinite(expires)||now>=expires||
  Buffer.byteLength(given)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(given),Buffer.from(expected)))return reply({error:'Not found'},404);
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 try{return reply({ok:true,fields:await inspect()},200);}
 catch(error){
  const code=error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'&&/^ZOHO_[A-Z_]{1,60}$/.test(error.code)?error.code:'READINESS_UNAVAILABLE';
  return reply({ok:false,code},503);
 }
}
