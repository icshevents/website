import {createHash,createHmac} from 'node:crypto';
import {signedPublicSession,constantEqual} from '../event-forms/security.js';
import {cleanAnswers,termsVersion,type Answers} from './model.ts';

export class RishtaError extends Error {status:number;constructor(message:string,status=400){super(message);this.status=status;}}
export type ProfileInput={id:string;sessionHash:string;requestHash:string;answers:Answers;termsVersion:string;photo:{bytes:Uint8Array;type:string;extension:string;hash:string}|null};
export type RishtaDependencies={secret:string;available:()=>Promise<boolean>;rateLimit:(key:string,max:number)=>Promise<boolean>;save:(value:ProfileInput)=>Promise<void>;today?:string};
export const privateHeaders={'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'};
const digest=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
export function decodePhoto(photo:unknown):ProfileInput['photo'] {
 if(photo===null||photo===undefined)return null;
 if(typeof photo!=='object'||Array.isArray(photo))throw new RishtaError('Please choose a valid photograph.');
 const p=photo as Record<string,unknown>;
 if(typeof p.data!=='string'||p.data.length>4194304||(p.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(p.data)))throw new RishtaError('Choose a photograph no larger than 3 MB.');
 const b=Buffer.from(p.data,'base64');
 if(b.length<12||b.length>3*1024*1024)throw new RishtaError('Choose a valid photograph no larger than 3 MB.');
 const kind=b[0]===0xff&&b[1]===0xd8&&b[2]===0xff?'image/jpeg':b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'?'image/webp':null;
 if(!kind||kind!==p.type)throw new RishtaError('Choose a JPG, PNG or WebP photograph.');
 return {bytes:b,type:kind,extension:kind==='image/jpeg'?'jpg':kind==='image/png'?'png':'webp',hash:digest(b)};
}
async function readBody(request:Request){
 const reader=request.body?.getReader();if(!reader)throw new RishtaError('Your profile is missing.');
 const chunks:Buffer[]=[];let size=0;
 for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>4400000){await reader.cancel();throw new RishtaError('Your profile is too large. Please use a smaller photograph.',413);}chunks.push(Buffer.from(part.value));}
 try{const v=JSON.parse(Buffer.concat(chunks).toString());if(!v||typeof v!=='object'||Array.isArray(v))throw Error();return v;}catch{throw new RishtaError('Your profile could not be read. Please try again.');}
}
export async function handleRishta(request:Request,deps:RishtaDependencies){
 try{
  if(!deps.secret)throw new RishtaError('The registration service is temporarily unavailable. Please try again shortly.',503);
  const url=new URL(request.url),secure=url.protocol==='https:',cookieName=secure?'__Host-icsh-rishta':'icsh-rishta';
  const cookie=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  const session=signedPublicSession(deps.secret,cookie);
  if(request.method==='GET'){
   if(!await deps.available())throw new RishtaError('The registration service is temporarily unavailable. Please try again shortly.',503);
   return Response.json({csrf:session.csrf},{headers:{...privateHeaders,'Set-Cookie':`${cookieName}=${session.cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure?'; Secure':''}`}});
  }
  if(request.method!=='POST')return Response.json({error:'Method not allowed.'},{status:405,headers:{...privateHeaders,Allow:'GET, POST'}});
  if(request.headers.get('origin')!==url.origin)throw new RishtaError('Request origin not allowed.',403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new RishtaError('Expected a JSON submission.',415);
  if(!cookie||session.cookie!==cookie||!constantEqual(request.headers.get('x-csrf-token')||'',session.csrf))throw new RishtaError('Your session changed. Please reload the page before submitting.',403);
  const network=(request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')||'local').split(',')[0];
  const key='rishta:'+createHmac('sha256',deps.secret).update(network).digest('hex');
  if(!await deps.rateLimit(key,5))throw new RishtaError('Too many attempts. Please wait ten minutes before trying again.',429);
  const body=await readBody(request);
  if(body.website)throw new RishtaError('Unable to submit this profile. Please contact ICSH.');
  if(typeof body.requestKey!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(body.requestKey))throw new RishtaError('Please reload the form and try again.');
  if(!body.answers||typeof body.answers!=='object'||Array.isArray(body.answers))throw new RishtaError('Please complete the profile fields.');
  if(JSON.stringify(body.answers).length>64000)throw new RishtaError('Please shorten your written answers.');
  const {answers,errors}=cleanAnswers(body.answers,deps.today);
  if(Object.keys(errors).length)return Response.json({error:'Please check the required fields before submitting.',fields:errors},{status:400,headers:privateHeaders});
  const photo=decodePhoto(body.photo),sessionHash=digest(session.cookie);
  const requestHash=digest(JSON.stringify({answers,photo:photo?.hash??null,termsVersion}));
  await deps.save({id:body.requestKey,sessionHash,requestHash,answers,termsVersion,photo});
  return Response.json({reference:'RIS-'+body.requestKey.replaceAll('-','').toUpperCase(),status:'received'},{status:201,headers:privateHeaders});
 }catch(e){return Response.json({error:e instanceof RishtaError?e.message:'Your profile could not be saved. Please try again. No confirmation has been issued.'},{status:e instanceof RishtaError?e.status:503,headers:privateHeaders});}
}
