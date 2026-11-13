import {authorisedActivationJob} from '@/lib/membership-activation/server';
import {runRenewalReminders} from '@/lib/renewal-reminders/server';
export const dynamic='force-dynamic';export const runtime='nodejs';export const maxDuration=300;
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex'};
export async function GET(request:Request){
 if(!authorisedActivationJob(request))return Response.json({error:'Unauthorised'},{status:401,headers});
 const hour=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',hourCycle:'h23',timeZone:'Europe/London'}).format(new Date());
 if(!request.url.split('?')[0].endsWith('/catchup')&&hour!=='10')return Response.json({skipped:true,reason:'Outside UK morning slot'},{headers});
 try{return Response.json(await runRenewalReminders(new URL(request.url).searchParams.get('dryRun')==='true'),{headers});}
 catch{return Response.json({error:'Renewal reminders require review'},{status:503,headers});}
}
