import {timingSafeEqual} from 'node:crypto';
import {reconcileMemberIds} from '@/lib/member-ids/server';
export const dynamic='force-dynamic';export const maxDuration=300;
export async function GET(request:Request){const secret=process.env.MEMBER_ID_JOB_SECRET||'',actual=Buffer.from(request.headers.get('authorization')||''),expected=Buffer.from('Bearer '+secret);const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex'};if(secret.length<32||actual.length!==expected.length||!timingSafeEqual(actual,expected))return Response.json({error:'Unauthorised'},{status:401,headers});try{return Response.json(await reconcileMemberIds(),{headers});}catch{return Response.json({error:'Reconciliation unavailable'},{status:503,headers});}}
