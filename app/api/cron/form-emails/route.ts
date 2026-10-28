import {timingSafeEqual} from 'node:crypto';
import {processFormEmails} from '@/lib/form-emails/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
export async function GET(request:Request){
 const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex'};
 const expected=process.env.CRON_SECRET?Buffer.from('Bearer '+process.env.CRON_SECRET):null,actual=Buffer.from(request.headers.get('authorization')||'');
 if(!expected||actual.length!==expected.length||!timingSafeEqual(actual,expected))return Response.json({error:'Unauthorised'},{status:401,headers});
 try{return Response.json(await processFormEmails(10),{headers});}catch{return Response.json({error:'Email processing pending'},{status:503,headers});}
}
