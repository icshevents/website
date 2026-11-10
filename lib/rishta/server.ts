import 'server-only';
import {createEventService} from '../event-forms/service.js';
import {handleRishta,RishtaError,type ProfileInput} from './api';
const bucket='icsh-rishta-private';
export async function runRishta(request:Request){
 const db=createEventService();
 return handleRishta(request,{
  secret:process.env.SUPABASE_SECRET_KEY||'',
  available:async()=>{const q=await db.from('icsh_rishta_profiles').select('id',{head:true,count:'exact'});return !q.error;},
  rateLimit:async(key,max)=>{const q=await db.rpc('icsh_event_rate_limit',{p_key:key,p_max:max});if(q.error)throw q.error;return q.data===true;},
  save:async(input:ProfileInput)=>{
   const existing=await db.from('icsh_rishta_profiles').select('request_hash,session_hash').eq('id',input.id).maybeSingle();
   if(existing.error)throw existing.error;
   const matches=(value:{request_hash:string;session_hash:string})=>value.request_hash===input.requestHash&&value.session_hash===input.sessionHash;
   if(existing.data){if(!matches(existing.data))throw new RishtaError('This submission reference has already been used. Reload the form before making a new submission.',409);return;}
   let photoPath:string|null=null;
   if(input.photo){
    photoPath=`${input.id}/${input.photo.hash}.${input.photo.extension}`;
    const q=await db.storage.from(bucket).upload(photoPath,input.photo.bytes,{contentType:input.photo.type,upsert:false,cacheControl:'0'});
    if(q.error&&String((q.error as {statusCode?:unknown}).statusCode)!=='409')throw new RishtaError('Your photograph could not be saved. Please retry, or remove the optional photograph.',503);
   }
   const saved=await db.from('icsh_rishta_profiles').insert({id:input.id,request_hash:input.requestHash,session_hash:input.sessionHash,answers:input.answers,terms_version:input.termsVersion,photo_path:photoPath,is_test:String(input.answers.SingleLine4).endsWith('@example.invalid')});
   if(saved.error){
    if(saved.error.code==='23505'){const retry=await db.from('icsh_rishta_profiles').select('request_hash,session_hash').eq('id',input.id).maybeSingle();if(retry.data&&matches(retry.data))return;}
    throw saved.error;
   }
  },
 });
}
export {bucket as rishtaPhotoBucket};
