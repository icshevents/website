import {runRishta} from '@/lib/rishta/server';
import {scheduleFormEmails} from '@/lib/form-emails/server';
import {privateHeaders} from '@/lib/rishta/api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
async function handle(request:Request){try{return scheduleFormEmails(request,await runRishta(request));}catch{return Response.json({error:'The registration service is temporarily unavailable. Please try again shortly.'},{status:503,headers:privateHeaders});}}
export {handle as GET,handle as POST};
